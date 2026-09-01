# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from metta.metta.doctype.patient_registration.patient_registration import (
	GENERAL_CATEGORY,
	STAFF_CATEGORY,
	STAFF_DEPENDENT_CATEGORY,
)
from metta.sales.report.collection_report.collection_report import execute as get_collection_report_data


@frappe.whitelist()
def get_data(from_date, to_date):
	# Reuses Collection Report's own execute() - same permission checks, same
	# get_data() logic - so this page and the underlying Script Report can
	# never drift apart into showing two different numbers for the same period.
	_columns, user_wise_details = get_collection_report_data({"from_date": from_date, "to_date": to_date})
	return {
		"user_wise_details": user_wise_details,
		"visited_patients_count": get_visited_patients_count(from_date, to_date),
		"advances": get_advances(from_date, to_date),
		"user_wise_charity": get_user_wise_charity(from_date, to_date),
		"item_type_collection": get_item_type_collection(from_date, to_date),
		"local_group_wise": get_local_group_wise_details(from_date, to_date),
		"sales_return_cash": get_sales_return_by_mode(from_date, to_date, "Cash"),
		"sales_return_credit": get_sales_return_by_mode(from_date, to_date, "Credit"),
		"charity": get_charity(from_date, to_date),
		"ip_adjusted": get_ip_adjusted(from_date, to_date),
		"credit_bills": get_credit_bills(from_date, to_date),
		"tax_bills": get_tax_details(from_date, to_date),
		"tax_returns": get_tax_details_returns(from_date, to_date),
	}


def _op_ip_rows(raw_rows, label_field):
	# Every section in the reference report splits the same underlying rows
	# into OP Amount / IP Amount columns rather than a single total - this is
	# the one place that split is done, so every section builder below just
	# hands over {label, registration_category, amount} rows and gets the
	# same two-column shape back.
	#
	# A row can also carry doctype/docname (+ an optional human-readable
	# detail) - when it does, that source document is collected into this
	# label's own "docs" list, so the client can make the row clickable and
	# show exactly which bills/visits/returns were added together to make it,
	# without a second round trip. Purely additive - a row with neither key
	# just contributes nothing to "docs", same shape as before.
	grouped = {}
	order = []
	for row in raw_rows:
		label = row[label_field]
		if label not in grouped:
			grouped[label] = {"label": label, "op_amount": 0, "ip_amount": 0, "docs": []}
			order.append(label)
		if row.get("registration_category") == "IP":
			grouped[label]["ip_amount"] += flt(row["amount"])
		else:
			grouped[label]["op_amount"] += flt(row["amount"])
		if row.get("doctype") and row.get("docname"):
			grouped[label]["docs"].append(
				{
					"doctype": row["doctype"],
					"name": row["docname"],
					"detail": row.get("detail") or "",
					"amount": flt(row["amount"]),
					"registration_category": row.get("registration_category"),
				}
			)
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
			sri.amount AS amount,
			'Sales Return' AS doctype, sr.name AS docname, i.item_name AS detail
		FROM `tabSales Return Item` sri
		INNER JOIN `tabSales Return` sr ON sr.name = sri.parent
		INNER JOIN `tabItem` i ON i.name = sri.item
		LEFT JOIN `tabPatient Visit` pv ON pv.name = sr.patient
		WHERE sr.docstatus = 1 AND sr.payment_mode = %(payment_mode)s AND sr.is_received = 1
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
			b.registration_category AS registration_category, b.charity_amount AS amount,
			'Billing' AS doctype, b.name AS docname
		FROM `tabBilling` b
		LEFT JOIN `tabPatient Visit` pv ON pv.name = b.patient
		WHERE b.docstatus = 1 AND b.charity_amount > 0
			-- "Increase" (Corporate) is the hospital charging MORE, never a
			-- concession given to the patient - it must never be counted or
			-- listed as charity given out, even though it shares the same
			-- Charity Amount field on the bill.
			AND COALESCE(b.adjustment_type, '') != 'Increase'
			AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY b.billing_category, b.sale_datetime
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	# The registration fee itself (Patient Visit's own fee_amount) can also
	# have charity applied to it - either a category-wide rate (Staff 100%,
	# Staff Dependent 60%, Patient 10%, ...) or, for General specifically (it
	# sits at 0% by design - the hospital doesn't discount everyone), a
	# manual, patient-specific amount Front Desk types in for someone who
	# genuinely can't pay at all. Either way this lives on Patient Visit's
	# own discount_amount, not on Billing at all, so it has to be pulled in
	# from there as a second source - across every category, not just General.
	registration_charity_rows = frappe.db.sql(
		"""
		SELECT name, patient_name, uid, payment_mode, registration_category, billing_category, discount_amount AS amount
		FROM `tabPatient Visit`
		WHERE discount_amount > 0
			AND COALESCE(adjustment_type, '') != 'Increase'
			AND date BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	rows += [
		frappe._dict(
			{
				"category": r.billing_category or GENERAL_CATEGORY,
				"patient_name": r.patient_name,
				"uid": r.uid,
				"payment_mode": r.payment_mode,
				"registration_category": r.registration_category,
				"amount": r.amount,
				"doctype": "Patient Visit",
				"docname": r.name,
			}
		)
		for r in registration_charity_rows
	]

	summary = _op_ip_rows(
		[
			{
				"label": _charity_display_label(r.category),
				"registration_category": r.registration_category,
				"amount": r.amount,
				"doctype": r.doctype,
				"docname": r.docname,
				"detail": r.patient_name,
			}
			for r in rows
		],
		"label",
	)

	# These three are always shown, even with nothing to report for the
	# period - unlike a corporate tie-up category, they're permanent fixtures
	# of the billing model, not something that only exists when it's used.
	details = {GENERAL_CATEGORY: [], STAFF_CATEGORY: [], STAFF_DEPENDENT_CATEGORY: []}
	order = [GENERAL_CATEGORY, STAFF_CATEGORY, STAFF_DEPENDENT_CATEGORY]
	for r in rows:
		category = r.category or _("Not Set")
		if category not in details:
			details[category] = []
			order.append(category)
		# "(B) ANITA RAWAT (43583) - CASH" in the reference report - the
		# Billing this discount actually happened on, its patient, and how
		# they paid. UID/Payment Mode can genuinely be blank on an older
		# record - each part is only added when it actually has a value, so
		# a blank one never leaves an empty "()" or a dangling "- " behind.
		label = f"(B) {r.patient_name or _('Unknown')}"
		if r.uid:
			label += f" ({r.uid})"
		if r.payment_mode:
			label += f" - {r.payment_mode}"
		details[category].append(
			{
				"label": label,
				"registration_category": r.registration_category,
				"amount": r.amount,
				"doctype": r.doctype,
				"docname": r.docname,
			}
		)

	return {
		"summary": summary,
		"details": [{"category": _charity_display_label(c), **_op_ip_rows(details[c], "label")} for c in order],
	}


def _charity_display_label(category):
	# The reference report names its charity groups "STAFF CHARITY" / "GENERAL
	# CHARITY" / "STAFF DEPENDENT CHARITY" - this app's own Category Price
	# Adjustment master is just named "Staff" / "General" / "Staff Dependent"
	# (renaming those would break the exact-string checks elsewhere in the
	# app, e.g. Patient Visit's Staff-only fields), so " Charity" is appended
	# here purely for display. A category that's already a full, specific
	# name (e.g. "Woodstock School (Students)") is left as-is.
	category = category or _("Not Set")
	if category.endswith(")"):
		return category
	return f"{category} Charity"


def get_user_wise_charity(from_date, to_date):
	# A pivot, unlike every other section here - one row per staff user, one
	# column per charity category (dynamic, whichever categories actually had
	# a discount in this period) - matches the reference report's own
	# "GENERAL | STAFF | ..." column layout, which (unlike Charity - Summary)
	# uses the bare category name as the column header, not "X Charity".
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT owner, billing_category AS category, SUM(charity_amount) AS amount
		FROM `tabBilling`
		WHERE docstatus = 1 AND charity_amount > 0
			-- "Increase" (Corporate) is the hospital charging MORE, never a
			-- concession given to the patient - never counted as charity here,
			-- even though it shares the same Charity Amount field on the bill.
			AND COALESCE(adjustment_type, '') != 'Increase'
			AND sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner, billing_category
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	# Registration-fee charity lives on Patient Visit, not Billing (see
	# get_charity) - same second source pulled in here, attributed to
	# whoever collected the fee (collected_by) the same way Billing
	# attributes to "owner". Every category can have charity here, not just
	# General - Staff/Staff Dependent/etc. get a category-wide rate applied
	# to the registration fee too.
	registration_charity_rows = frappe.db.sql(
		"""
		SELECT collected_by AS owner, billing_category AS category, SUM(discount_amount) AS amount
		FROM `tabPatient Visit`
		WHERE discount_amount > 0
			AND COALESCE(adjustment_type, '') != 'Increase'
			AND date BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY collected_by, billing_category
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	rows += [
		frappe._dict({"owner": r.owner, "category": r.category or GENERAL_CATEGORY, "amount": r.amount})
		for r in registration_charity_rows
	]

	# General/Staff/Staff Dependent are permanent fixtures of the billing
	# model (see get_charity's own details boxes) - always shown as columns,
	# even with nothing to report for the period, rather than only appearing
	# once something has actually been discounted under them.
	categories = [GENERAL_CATEGORY, STAFF_CATEGORY, STAFF_DEPENDENT_CATEGORY]
	by_user = {}
	for r in rows:
		category = r.category or _("Not Set")
		if category not in categories:
			categories.append(category)
		entry = by_user.setdefault(r.owner, {})
		entry[category] = flt(r.amount)

	full_names = _get_user_full_names(by_user.keys())
	totals = dict.fromkeys(categories, 0)
	result = []
	for owner, entry in by_user.items():
		# Kept alongside the display name so the report page can drill a
		# cell down into its real bills/visits without a name-to-user lookup.
		row = {"user_name": full_names.get(owner, owner), "owner": owner}
		for category in categories:
			amount = entry.get(category, 0)
			row[category] = amount
			totals[category] += amount
		result.append(row)
	result.sort(key=lambda r: r["user_name"] or "")

	total_row = {"user_name": _("Total")}
	total_row.update(totals)
	result.append(total_row)

	return {"categories": categories, "rows": result}


def _get_user_full_names(owners):
	owners = [o for o in owners if o]
	if not owners:
		return {}
	rows = frappe.get_all("User", filters={"name": ["in", owners]}, fields=["name", "full_name"])
	return {row.name: row.full_name or row.name for row in rows}


def get_ip_adjusted(from_date, to_date):
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT b.name AS docname, b.customer_name AS detail, b.advance_adjusted AS amount,
			b.registration_category AS registration_category
		FROM `tabBilling` b
		WHERE b.docstatus = 1 AND b.registration_category = 'IP' AND b.advance_adjusted > 0
			AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)
	if not rows:
		return {"rows": [], "total": {"op_amount": 0, "ip_amount": 0}}
	for r in rows:
		r["label"] = _("Advance Adjusted")
		r["doctype"] = "Billing"
	return _op_ip_rows(rows, "label")


def get_credit_bills(from_date, to_date):
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT COALESCE(cc.customer_name, %(unassigned)s) AS label, b.registration_category AS registration_category,
			b.payable_amount AS amount, 'Billing' AS doctype, b.name AS docname, b.customer_name AS detail
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


def get_tax_details(from_date, to_date):
	# Grouped by Item Type + GST%, combined into one "(P) PHARMACY - 12.00%"
	# style Particulars label - matches the reference report's own single
	# combined column exactly, instead of a separate GST % column. Split by
	# OP/IP the same way Tax - Details - Returns already is, rather than
	# aggregated away in SQL.
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT
			CASE WHEN sbi.item_type IN ('Medicine', 'Consumable') THEN 'PRODUCT' ELSE 'SERVICE' END AS item_type,
			sbi.gst_percent AS gst_percent,
			b.registration_category AS registration_category,
			sbi.amount AS amount, sbi.gst_amount AS tax_amount,
			b.name AS docname, sbi.item_name AS detail
		FROM `tabSales Bill Item` sbi
		INNER JOIN `tabBilling` b ON b.name = sbi.parent
		WHERE b.docstatus = 1 AND sbi.gst_percent > 0
			AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	grouped = {}
	order = []
	for r in rows:
		key = (r.item_type, r.gst_percent)
		if key not in grouped:
			grouped[key] = {
				"label": f"{r.item_type} - {flt(r.gst_percent):.2f}%",
				"amount": 0,
				"tax_amount": 0,
				"op_amount": 0,
				"ip_amount": 0,
				"docs": [],
			}
			order.append(key)
		grouped[key]["amount"] += flt(r.amount)
		grouped[key]["tax_amount"] += flt(r.tax_amount)
		if r.registration_category == "IP":
			grouped[key]["ip_amount"] += flt(r.amount)
		else:
			grouped[key]["op_amount"] += flt(r.amount)
		grouped[key]["docs"].append(
			{
				"doctype": "Billing",
				"name": r.docname,
				"detail": r.detail,
				"amount": flt(r.amount),
				"registration_category": r.registration_category,
			}
		)

	out_rows = [grouped[k] for k in order]
	total = {
		"amount": sum(r["amount"] for r in out_rows),
		"tax_amount": sum(r["tax_amount"] for r in out_rows),
		"op_amount": sum(r["op_amount"] for r in out_rows),
		"ip_amount": sum(r["ip_amount"] for r in out_rows),
	}
	return {"rows": out_rows, "total": total}


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
			-(sri.amount * i.gst_percent / (100 + i.gst_percent)) AS tax_amount,
			sr.name AS docname, i.item_name AS detail
		FROM `tabSales Return Item` sri
		INNER JOIN `tabSales Return` sr ON sr.name = sri.parent
		INNER JOIN `tabItem` i ON i.name = sri.item
		LEFT JOIN `tabPatient Visit` pv ON pv.name = sr.patient
		WHERE sr.docstatus = 1 AND i.gst_percent > 0 AND sr.is_received = 1
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
			grouped[key] = {
				"label": f"{r.item_type} - {flt(r.gst_percent):.2f}%",
				"amount": 0,
				"tax_amount": 0,
				"op_amount": 0,
				"ip_amount": 0,
				"docs": [],
			}
			order.append(key)
		grouped[key]["amount"] += flt(r.amount)
		grouped[key]["tax_amount"] += flt(r.tax_amount)
		if r.registration_category == "IP":
			grouped[key]["ip_amount"] += flt(r.amount)
		else:
			grouped[key]["op_amount"] += flt(r.amount)
		grouped[key]["docs"].append(
			{
				"doctype": "Sales Return",
				"name": r.docname,
				"detail": r.detail,
				"amount": flt(r.amount),
				"registration_category": r.registration_category,
			}
		)

	out_rows = [grouped[k] for k in order]
	total = {
		"amount": sum(r["amount"] for r in out_rows),
		"tax_amount": sum(r["tax_amount"] for r in out_rows),
		"op_amount": sum(r["op_amount"] for r in out_rows),
		"ip_amount": sum(r["ip_amount"] for r in out_rows),
	}
	return {"rows": out_rows, "total": total}


def get_item_type_collection(from_date, to_date):
	# Matches the reference report's own "PARTICULARS (PRODUCT/SERVICE) / OP
	# AMOUNT / IP AMOUNT" shape - same _op_ip_rows split every other section
	# uses, rather than a Bills-count/%-of-total breakdown this app added on
	# its own.
	frappe.has_permission("Billing", "read", throw=True)

	rows = frappe.db.sql(
		"""
		SELECT
			CASE WHEN sbi.item_type IN ('Medicine', 'Consumable') THEN 'PRODUCT' ELSE 'SERVICE' END AS label,
			b.registration_category AS registration_category,
			sbi.amount AS amount,
			'Billing' AS doctype, b.name AS docname, sbi.item_name AS detail
		FROM `tabSales Bill Item` sbi
		INNER JOIN `tabBilling` b ON b.name = sbi.parent
		WHERE b.docstatus = 1 AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)
	return _op_ip_rows(rows, "label")


def get_local_group_wise_details(from_date, to_date):
	# Grouped by Item Category - Item Group is only the coarse Pharmacy
	# Store / General Store split; the actual fine detail (Lab, X-Ray,
	# Dental, ...) lives one level deeper, on Category. Whichever Category a
	# billed item belongs to is exactly the bucket it lands in here - no
	# separate tag maintained just for this report.
	#
	# A Service item (Group: Service) has no Category at all anymore - it's
	# classified by Department instead, so that's what this falls back to
	# for those rows, rather than collapsing every service into "Others".
	frappe.has_permission("Billing", "read", throw=True)
	rows = frappe.db.sql(
		"""
		SELECT
			COALESCE(NULLIF(i.category, ''), NULLIF(i.department, ''), 'Others') AS label,
			b.registration_category AS registration_category,
			sbi.amount AS amount,
			'Billing' AS doctype, b.name AS docname, sbi.item_name AS detail
		FROM `tabSales Bill Item` sbi
		INNER JOIN `tabBilling` b ON b.name = sbi.parent
		INNER JOIN `tabItem` i ON i.name = sbi.item
		WHERE b.docstatus = 1 AND b.sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	# The OP registration/consultation fee is its own transaction on Patient
	# Visit, not a Sales Bill Item row against a real Item - so it was never
	# reachable through the query above and needs pulling in separately.
	# IP has no fee_amount of its own at all (see patient_visit.json), so
	# there's nothing to add for IP here - its charges all flow through
	# Billing instead, already covered above.
	frappe.has_permission("Patient Visit", "read", throw=True)
	registration_rows = frappe.db.sql(
		"""
		SELECT 'Registration' AS label, registration_category, net_amount AS amount,
			'Patient Visit' AS doctype, name AS docname, patient_name AS detail
		FROM `tabPatient Visit`
		WHERE registration_category = 'OP' AND net_amount > 0
			AND date BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	rows += registration_rows

	return _op_ip_rows(rows, "label")


def get_advances(from_date, to_date):
	# Matches the reference report's own "PARTICULARS / OP AMOUNT / IP AMOUNT"
	# shape - same _op_ip_rows split every other section uses, rather than
	# this app's own richer Patient Advance record (Payment Mode, Received By,
	# Remarks) laid out as its own separate column set.
	frappe.has_permission("Patient Advance", "read", throw=True)

	advances = frappe.db.sql(
		"""
		SELECT pa.name AS docname, pa.patient_name AS patient_name, pv.uid AS uid,
			pv.registration_category AS registration_category, pa.amount AS amount
		FROM `tabPatient Advance` pa
		LEFT JOIN `tabPatient Visit` pv ON pv.name = pa.patient_visit
		WHERE pa.received_on BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY pa.received_on
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	labeled = []
	for row in advances:
		# "SAMIKSHA (24562)" in the reference report - patient name plus UID,
		# UID left out if this older record never had one fetched.
		label = row.patient_name or _("Unknown")
		if row.uid:
			label += f" ({row.uid})"
		labeled.append(
			{
				"label": label,
				"registration_category": row.registration_category,
				"amount": row.amount,
				"doctype": "Patient Advance",
				"docname": row.docname,
			}
		)

	return _op_ip_rows(labeled, "label")


@frappe.whitelist()
def get_user_bill_detail(owner, from_date, to_date):
	# Drill-down for one row of User Wise Details - the exact same two
	# sources (and the exact same date-range/owner filters) collection_report.py's
	# own get_data() sums for that user, just handed back as a raw list
	# instead of a single total, so a calculation can actually be checked
	# against the real bills/visits behind it instead of just trusted.
	frappe.has_permission("Billing", "read", throw=True)
	bills = frappe.db.sql(
		"""
		SELECT name AS docname, 'Billing' AS doctype, sale_datetime AS datetime,
			customer_name AS detail, net_amount, payable_amount, payment_mode
		FROM `tabBilling`
		WHERE docstatus = 1 AND owner = %(owner)s
			AND sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY sale_datetime
		""",
		{"owner": owner, "from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)
	registrations = frappe.db.sql(
		"""
		SELECT name AS docname, 'Patient Visit' AS doctype, date AS datetime,
			patient_name AS detail, fee_amount AS net_amount, net_amount AS payable_amount, payment_mode
		FROM `tabPatient Visit`
		WHERE registration_category = 'OP' AND net_amount > 0 AND collected_by = %(owner)s
			AND date BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY date
		""",
		{"owner": owner, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	return bills + registrations


@frappe.whitelist()
def get_user_charity_detail(owner, category, from_date, to_date):
	# Drill-down for one cell of User Wise Charity Details - same two sources
	# and filters get_user_wise_charity() itself sums, narrowed to one
	# user+category cell.
	frappe.has_permission("Billing", "read", throw=True)
	bills = frappe.db.sql(
		"""
		SELECT name AS docname, 'Billing' AS doctype, sale_datetime AS datetime,
			customer_name AS detail, charity_amount AS amount, payment_mode
		FROM `tabBilling`
		WHERE docstatus = 1 AND owner = %(owner)s AND billing_category = %(category)s
			AND charity_amount > 0 AND COALESCE(adjustment_type, '') != 'Increase'
			AND sale_datetime BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY sale_datetime
		""",
		{"owner": owner, "category": category, "from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)
	registrations = frappe.db.sql(
		"""
		SELECT name AS docname, 'Patient Visit' AS doctype, date AS datetime,
			patient_name AS detail, discount_amount AS amount, payment_mode
		FROM `tabPatient Visit`
		WHERE collected_by = %(owner)s AND billing_category = %(category)s
			AND discount_amount > 0 AND COALESCE(adjustment_type, '') != 'Increase'
			AND date BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY date
		""",
		{"owner": owner, "category": category, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	return bills + registrations


@frappe.whitelist()
def get_visited_patients_count(from_date, to_date):
	# A quick, clickable headline figure - "how many patients came in today" -
	# separate from every revenue section above, but the same audit need:
	# a number staff can immediately open up and check against the real list.
	frappe.has_permission("Patient Visit", "read", throw=True)
	return frappe.db.count(
		"Patient Visit",
		filters={"creation": ["between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]]},
	)


@frappe.whitelist()
def get_visited_patients(from_date, to_date):
	frappe.has_permission("Patient Visit", "read", throw=True)
	return frappe.db.sql(
		"""
		SELECT name AS docname, 'Patient Visit' AS doctype, creation AS datetime,
			patient_name AS detail, registration_category, department_name
		FROM `tabPatient Visit`
		WHERE creation BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY creation
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)
