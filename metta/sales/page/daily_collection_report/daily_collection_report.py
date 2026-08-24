# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from metta.sales.report.collection_report.collection_report import execute as get_collection_report_data


@frappe.whitelist()
def get_data(from_date, to_date):
	# Reuses Collection Report's own execute() - same permission checks, same
	# get_data() logic - so this page and the underlying Script Report can
	# never drift apart into showing two different numbers for the same period.
	_columns, user_wise_details = get_collection_report_data({"from_date": from_date, "to_date": to_date})
	return {
		"user_wise_details": user_wise_details,
		"advances": get_advances(from_date, to_date),
		"item_type_collection": get_item_type_collection(from_date, to_date),
		"sales_return_cash": get_sales_return_by_mode(from_date, to_date, "Cash"),
		"sales_return_credit": get_sales_return_by_mode(from_date, to_date, "Credit"),
		"charity": get_charity(from_date, to_date),
		"ip_adjusted": get_ip_adjusted(from_date, to_date),
		"credit_bills": get_credit_bills(from_date, to_date),
		"epayment": get_epayment(from_date, to_date),
		"tax_bills": get_tax_details(from_date, to_date),
		"tax_returns": get_tax_details_returns(from_date, to_date),
	}


def _op_ip_rows(raw_rows, label_field):
	# Every section in the reference report splits the same underlying rows
	# into OP Amount / IP Amount columns rather than a single total - this is
	# the one place that split is done, so every section builder below just
	# hands over {label, registration_category, amount} rows and gets the
	# same two-column shape back.
	grouped = {}
	order = []
	for row in raw_rows:
		label = row[label_field]
		if label not in grouped:
			grouped[label] = {"label": label, "op_amount": 0, "ip_amount": 0}
			order.append(label)
		if row.get("registration_category") == "IP":
			grouped[label]["ip_amount"] += flt(row["amount"])
		else:
			grouped[label]["op_amount"] += flt(row["amount"])
	rows = [grouped[label] for label in order]
	total = {
		"op_amount": sum(r["op_amount"] for r in rows),
		"ip_amount": sum(r["ip_amount"] for r in rows),
	}
	return {"rows": rows, "total": total}


def get_sales_return_by_mode(from_date, to_date, payment_mode):
	# "CASH - (P) PHARMACY" / "IP CREDIT - (P) PHARMACY" in the reference report
	# groups by department, which this app has no equivalent master for -
	# Item Type (Medicine/Consumable vs Service) is the closest grouping this
	# data model actually has, so the same "<MODE> - " prefix from the
	# reference report is kept even though the grouping itself is coarser.
	frappe.has_permission("Sales Return", "read", throw=True)
	prefix = "CASH - " if payment_mode == "Cash" else "IP CREDIT - "
	rows = frappe.db.sql(
		"""
		SELECT
			CASE WHEN i.item_type IN ('Medicine', 'Consumable') THEN 'PRODUCT' ELSE 'SERVICE' END AS label,
			pv.registration_category AS registration_category,
			sri.amount AS amount
		FROM `tabSales Return Item` sri
		INNER JOIN `tabSales Return` sr ON sr.name = sri.parent
		INNER JOIN `tabItem` i ON i.name = sri.item
		LEFT JOIN `tabPatient Visit` pv ON pv.name = sr.patient
		WHERE sr.docstatus = 1 AND sr.payment_mode = %(payment_mode)s
			AND sr.return_date_time BETWEEN %(from_date)s AND %(to_date)s
		""",
		{
			"payment_mode": payment_mode,
			"from_date": f"{from_date} 00:00:00",
			"to_date": f"{to_date} 23:59:59",
		},
		as_dict=True,
	)
	for r in rows:
		r["label"] = prefix + r["label"]
	return _op_ip_rows(rows, "label")


def get_charity(from_date, to_date):
	# "Billing Category is Charity" - this app never had a separate Charity
	# concept (removed in favour of Category Price Adjustment), so every
	# category with a real discount in the period stands in for what the old
	# report tracked as a named Charity group.
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT b.billing_category AS category, b.customer_name AS patient_name,
			pv.uid AS uid, b.payment_mode AS payment_mode,
			b.registration_category AS registration_category, b.discount_amount AS amount
		FROM `tabBilling` b
		LEFT JOIN `tabPatient Visit` pv ON pv.name = b.patient
		WHERE b.docstatus = 1 AND b.discount_amount > 0
			AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY b.billing_category, b.sale_datetime
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	summary = _op_ip_rows(
		[{"label": r.category or _("Not Set"), "registration_category": r.registration_category, "amount": r.amount} for r in rows],
		"label",
	)

	details = {}
	order = []
	for r in rows:
		category = r.category or _("Not Set")
		if category not in details:
			details[category] = []
			order.append(category)
		# "(B) ANITA RAWAT (43583) - CASH" in the reference report - the
		# Billing this discount actually happened on, its patient, and how
		# they paid.
		details[category].append(
			{
				"label": f"(B) {r.patient_name or _('Unknown')} ({r.uid or ''}) - {r.payment_mode or ''}",
				"registration_category": r.registration_category,
				"amount": r.amount,
			}
		)

	return {
		"summary": summary,
		"details": [{"category": c, **_op_ip_rows(details[c], "label")} for c in order],
	}


def get_ip_adjusted(from_date, to_date):
	frappe.has_permission("Billing", "read", throw=True)
	total = frappe.db.sql(
		"""
		SELECT SUM(advance_adjusted) AS total
		FROM `tabBilling`
		WHERE docstatus = 1 AND registration_category = 'IP' AND advance_adjusted > 0
			AND sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)[0].total
	return {"rows": [{"label": _("Advance Adjusted"), "op_amount": 0, "ip_amount": flt(total)}], "total": {"op_amount": 0, "ip_amount": flt(total)}}


def get_credit_bills(from_date, to_date):
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT COALESCE(cc.customer_name, %(unassigned)s) AS label, b.registration_category AS registration_category,
			b.net_amount AS amount
		FROM `tabBilling` b
		LEFT JOIN `tabCorporate Customer` cc ON cc.name = b.corporate_customer
		WHERE b.docstatus = 1 AND b.payment_mode = 'Credit - Corporate'
			AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		""",
		{
			"unassigned": _("IP Credits"),
			"from_date": f"{from_date} 00:00:00",
			"to_date": f"{to_date} 23:59:59",
		},
		as_dict=True,
	)
	# "BILLS - IP CREDITS" / "BILLS - GURUNANAK CENTARY SCHOOL" in the
	# reference report.
	for r in rows:
		r["label"] = f"BILLS - {r['label']}"
	return _op_ip_rows(rows, "label")


def get_epayment(from_date, to_date):
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT payment_mode AS label, registration_category AS registration_category, amount_collected AS amount
		FROM `tabBilling`
		WHERE docstatus = 1 AND payment_mode IN ('UPI', 'Card')
			AND sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)
	# "BILLS - MASTER CARD" in the reference report - UPI/Card is the closest
	# this data model tracks (no card-network breakdown).
	for r in rows:
		r["label"] = f"BILLS - {r['label']}"
	return _op_ip_rows(rows, "label")


def get_tax_details(from_date, to_date):
	# Grouped by Item Type + GST% - the closest this data model has to the
	# reference report's "(P) PHARMACY - 12.00%" department+rate grouping.
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT
			CASE WHEN sbi.item_type IN ('Medicine', 'Consumable') THEN 'PRODUCT' ELSE 'SERVICE' END AS item_type,
			sbi.gst_percent AS gst_percent,
			SUM(sbi.amount) AS amount, SUM(sbi.gst_amount) AS tax_amount
		FROM `tabSales Bill Item` sbi
		INNER JOIN `tabBilling` b ON b.name = sbi.parent
		WHERE b.docstatus = 1 AND sbi.gst_percent > 0
			AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY item_type, sbi.gst_percent
		ORDER BY item_type, sbi.gst_percent
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)
	total_amount = sum(flt(r.amount) for r in rows)
	total_tax = sum(flt(r.tax_amount) for r in rows)
	return {"rows": rows, "total": {"amount": total_amount, "tax_amount": total_tax}}


def get_tax_details_returns(from_date, to_date):
	# Sales Return Item never stored its own GST split, so the Item master's
	# current gst_percent is used as a reasonable approximation - it's the
	# same rate that would have applied when the item was originally sold.
	frappe.has_permission("Sales Return", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT
			CASE WHEN i.item_type IN ('Medicine', 'Consumable') THEN 'PRODUCT' ELSE 'SERVICE' END AS item_type,
			i.gst_percent AS gst_percent,
			pv.registration_category AS registration_category,
			-sri.amount AS amount,
			-(sri.amount * i.gst_percent / (100 + i.gst_percent)) AS tax_amount
		FROM `tabSales Return Item` sri
		INNER JOIN `tabSales Return` sr ON sr.name = sri.parent
		INNER JOIN `tabItem` i ON i.name = sri.item
		LEFT JOIN `tabPatient Visit` pv ON pv.name = sr.patient
		WHERE sr.docstatus = 1 AND i.gst_percent > 0
			AND sr.return_date_time BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	grouped = {}
	order = []
	for r in rows:
		key = (r.item_type, r.gst_percent)
		if key not in grouped:
			grouped[key] = {"item_type": r.item_type, "gst_percent": r.gst_percent, "amount": 0, "tax_amount": 0, "op_amount": 0, "ip_amount": 0}
			order.append(key)
		grouped[key]["amount"] += flt(r.amount)
		grouped[key]["tax_amount"] += flt(r.tax_amount)
		if r.registration_category == "IP":
			grouped[key]["ip_amount"] += flt(r.amount)
		else:
			grouped[key]["op_amount"] += flt(r.amount)

	out_rows = [grouped[k] for k in order]
	total = {
		"amount": sum(r["amount"] for r in out_rows),
		"tax_amount": sum(r["tax_amount"] for r in out_rows),
		"op_amount": sum(r["op_amount"] for r in out_rows),
		"ip_amount": sum(r["ip_amount"] for r in out_rows),
	}
	return {"rows": out_rows, "total": total}


def get_item_type_collection(from_date, to_date):
	frappe.has_permission("Billing", "read", throw=True)

	rows = frappe.db.sql(
		"""
		SELECT sbi.item_type, SUM(sbi.amount) AS amount, COUNT(DISTINCT sbi.parent) AS bill_count
		FROM `tabSales Bill Item` sbi
		INNER JOIN `tabBilling` b ON b.name = sbi.parent
		WHERE b.docstatus = 1 AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY sbi.item_type
		ORDER BY amount DESC
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	return {"rows": rows, "total": sum(flt(row.amount) for row in rows)}


def get_advances(from_date, to_date):
	frappe.has_permission("Patient Advance", "read", throw=True)

	advances = frappe.db.sql(
		"""
		SELECT name, patient_visit, patient_name, amount, payment_mode,
			received_by, received_on, remarks
		FROM `tabPatient Advance`
		WHERE received_on BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY received_on
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	full_names = _get_full_names({row.received_by for row in advances if row.received_by})
	for row in advances:
		# patient_name is a fetch_from that can be blank on an older record
		# whose Patient Visit has no demographics (uhin_id) linked yet - fall
		# back to the Visit ID so the row is never blank.
		row["patient_label"] = row.patient_name or row.patient_visit
		row["received_by_name"] = full_names.get(row.received_by, row.received_by)

	return {"rows": advances, "total": sum(flt(row.amount) for row in advances)}


def _get_full_names(users):
	users = [u for u in users if u]
	if not users:
		return {}
	rows = frappe.get_all("User", filters={"name": ["in", users]}, fields=["name", "full_name"])
	return {row.name: row.full_name or row.name for row in rows}
