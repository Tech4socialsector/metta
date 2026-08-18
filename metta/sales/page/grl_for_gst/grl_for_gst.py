# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_data(from_date, to_date, warehouse=None):
	# GST Register/Ledger - reconciles Output Tax (GST collected on sales,
	# net of Sales Return credit notes) against Input Tax Credit (GST paid on
	# purchases, net of Purchase Return) for a filing period. Purchase Bill is
	# matched on supplier_invoice_date rather than a posting date, since that's
	# the date that actually governs which period a bill's ITC belongs to.
	frappe.has_permission("Billing", "read", throw=True)
	frappe.has_permission("Sales Return", "read", throw=True)
	frappe.has_permission("Purchase Bill", "read", throw=True)
	frappe.has_permission("Purchase Return", "read", throw=True)
	frappe.has_permission("Item", "read", throw=True)

	# Item.hsn_code is trimmed below (including literal tab characters) - some
	# Item records have stray whitespace baked into it (same issue already
	# found and fixed for item_name/rack_location elsewhere in this app), which
	# would otherwise split one HSN code into two separate summary buckets.
	# Plain SQL TRIM() only strips spaces, not tabs, hence TRIM(BOTH '\t' ...).
	from_datetime = f"{from_date} 00:00:00"
	to_datetime = f"{to_date} 23:59:59"

	sales_rows = _get_sales_rows(from_datetime, to_datetime, warehouse)
	sales_return_rows = _get_sales_return_rows(from_datetime, to_datetime, warehouse)
	purchase_rows = _get_purchase_rows(from_date, to_date)
	purchase_return_rows = _get_purchase_return_rows(from_datetime, to_datetime)

	summary = _build_summary(sales_rows, sales_return_rows, purchase_rows, purchase_return_rows)

	return {
		"summary": summary,
		"output": {
			"hsn_summary": _hsn_summary(sales_rows),
			"detail": sales_rows,
			"returns_hsn_summary": _hsn_summary(sales_return_rows),
			"returns_detail": sales_return_rows,
		},
		"input": {
			"hsn_summary": _hsn_summary(purchase_rows),
			"detail": purchase_rows,
			"returns_hsn_summary": _hsn_summary(purchase_return_rows),
			"returns_detail": purchase_return_rows,
		},
	}


def _get_sales_rows(from_datetime, to_datetime, warehouse):
	warehouse_condition = ""
	values = {"from_datetime": from_datetime, "to_datetime": to_datetime}
	if warehouse:
		warehouse_condition = "AND b.warehouse = %(warehouse)s"
		values["warehouse"] = warehouse

	rows = frappe.db.sql(
		f"""
		SELECT
			'Billing' AS doc_type, b.name AS doc_no, b.sale_datetime AS doc_date,
			b.warehouse, b.customer_name AS party, cc.gst_number AS gstin,
			(b.payment_mode = 'Credit - Corporate') AS is_b2b,
			bi.item, bi.item_name, TRIM(BOTH '\t' FROM TRIM(i.hsn_code)) AS hsn_code, hsn.description AS hsn_description,
			bi.qty, bi.rate, bi.amount, bi.gst_percent, bi.gst_amount
		FROM `tabSales Bill Item` bi
		INNER JOIN `tabBilling` b ON b.name = bi.parent
		INNER JOIN `tabItem` i ON i.name = bi.item
		LEFT JOIN `tabHSN Master` hsn ON hsn.hsn_code = TRIM(BOTH '\t' FROM TRIM(i.hsn_code))
		LEFT JOIN `tabCorporate Customer` cc ON cc.name = b.corporate_customer
		WHERE b.docstatus = 1 AND b.sale_datetime BETWEEN %(from_datetime)s AND %(to_datetime)s
			{warehouse_condition}
		ORDER BY b.sale_datetime ASC, b.name ASC
		""",
		values,
		as_dict=True,
	)
	for row in rows:
		row["is_b2b"] = bool(row["is_b2b"])
	return rows


def _get_sales_return_rows(from_datetime, to_datetime, warehouse):
	warehouse_condition = ""
	values = {"from_datetime": from_datetime, "to_datetime": to_datetime}
	if warehouse:
		warehouse_condition = "AND sr.to_warehouse = %(warehouse)s"
		values["warehouse"] = warehouse

	# Sales Return Item carries no gst_percent/gst_amount of its own - GST on
	# a return is re-derived from the Item's current rate, same technique used
	# for Purchase Return below.
	return frappe.db.sql(
		f"""
		SELECT
			'Sales Return' AS doc_type, sr.name AS doc_no, sr.return_date_time AS doc_date,
			sr.to_warehouse AS warehouse, NULL AS party, NULL AS gstin, 0 AS is_b2b,
			sri.item, sri.item_name, TRIM(BOTH '\t' FROM TRIM(i.hsn_code)) AS hsn_code, hsn.description AS hsn_description,
			sri.qty_returned AS qty, sri.rate, sri.amount, i.gst_percent,
			(sri.amount * i.gst_percent / 100) AS gst_amount
		FROM `tabSales Return Item` sri
		INNER JOIN `tabSales Return` sr ON sr.name = sri.parent
		INNER JOIN `tabItem` i ON i.name = sri.item
		LEFT JOIN `tabHSN Master` hsn ON hsn.hsn_code = TRIM(BOTH '\t' FROM TRIM(i.hsn_code))
		WHERE sr.docstatus = 1 AND sr.return_date_time BETWEEN %(from_datetime)s AND %(to_datetime)s
			{warehouse_condition}
		ORDER BY sr.return_date_time ASC, sr.name ASC
		""",
		values,
		as_dict=True,
	)


def _get_purchase_rows(from_date, to_date):
	rows = frappe.db.sql(
		"""
		SELECT
			'Purchase Bill' AS doc_type, pb.name AS doc_no, pb.supplier_invoice_date AS doc_date,
			pb.supplier AS party, s.gst_number AS gstin, 1 AS is_b2b,
			pbi.item, pbi.item_name, TRIM(BOTH '\t' FROM TRIM(i.hsn_code)) AS hsn_code, hsn.description AS hsn_description,
			pbi.qty, pbi.rate, pbi.amount, pbi.gst_percent, pbi.gst_amount
		FROM `tabPurchase Bill Item` pbi
		INNER JOIN `tabPurchase Bill` pb ON pb.name = pbi.parent
		INNER JOIN `tabItem` i ON i.name = pbi.item
		LEFT JOIN `tabHSN Master` hsn ON hsn.hsn_code = TRIM(BOTH '\t' FROM TRIM(i.hsn_code))
		LEFT JOIN `tabSupplier` s ON s.name = pb.supplier
		WHERE pb.docstatus = 1 AND pb.supplier_invoice_date BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY pb.supplier_invoice_date ASC, pb.name ASC
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	for row in rows:
		row["is_b2b"] = bool(row["is_b2b"])
	return rows


def _get_purchase_return_rows(from_datetime, to_datetime):
	# Purchase Return Item, like Sales Return Item, carries no gst_percent/
	# gst_amount of its own - re-derived from the Item's current rate.
	return frappe.db.sql(
		"""
		SELECT
			'Purchase Return' AS doc_type, pr.name AS doc_no, pr.return_date_time AS doc_date,
			pr.supplier AS party, s.gst_number AS gstin, 1 AS is_b2b,
			pri.item, pri.item_name, TRIM(BOTH '\t' FROM TRIM(i.hsn_code)) AS hsn_code, hsn.description AS hsn_description,
			pri.qty_returned AS qty, pri.rate, pri.amount, i.gst_percent,
			(pri.amount * i.gst_percent / 100) AS gst_amount
		FROM `tabPurchase Return Item` pri
		INNER JOIN `tabPurchase Return` pr ON pr.name = pri.parent
		INNER JOIN `tabItem` i ON i.name = pri.item
		LEFT JOIN `tabHSN Master` hsn ON hsn.hsn_code = TRIM(BOTH '\t' FROM TRIM(i.hsn_code))
		LEFT JOIN `tabSupplier` s ON s.name = pr.supplier
		WHERE pr.docstatus = 1 AND pr.return_date_time BETWEEN %(from_datetime)s AND %(to_datetime)s
		ORDER BY pr.return_date_time ASC, pr.name ASC
		""",
		{"from_datetime": from_datetime, "to_datetime": to_datetime},
		as_dict=True,
	)


def _hsn_summary(rows):
	buckets = {}
	for row in rows:
		hsn_code = row.get("hsn_code") or "(No HSN)"
		bucket = buckets.setdefault(
			hsn_code,
			{
				"hsn_code": hsn_code,
				"hsn_description": row.get("hsn_description") or "",
				"taxable_value": 0,
				"gst_amount": 0,
				"gst_percents": set(),
				"doc_numbers": set(),
			},
		)
		bucket["taxable_value"] += flt(row.get("amount"))
		bucket["gst_amount"] += flt(row.get("gst_amount"))
		bucket["gst_percents"].add(row.get("gst_percent"))
		bucket["doc_numbers"].add(row.get("doc_no"))

	summary = []
	for bucket in buckets.values():
		# Two Items legitimately shouldn't share one HSN code at different GST
		# rates, but nothing in this app enforces that - when it happens
		# anyway, showing any single rate for the bucket would misreport it,
		# so this leaves the rate blank rather than picking one arbitrarily.
		gst_percents = bucket["gst_percents"]
		summary.append(
			{
				"hsn_code": bucket["hsn_code"],
				"hsn_description": bucket["hsn_description"],
				"gst_percent": next(iter(gst_percents)) if len(gst_percents) == 1 else None,
				"taxable_value": bucket["taxable_value"],
				"gst_amount": bucket["gst_amount"],
				"doc_count": len(bucket["doc_numbers"]),
			}
		)
	summary.sort(key=lambda r: r["hsn_code"])
	return summary


def _build_summary(sales_rows, sales_return_rows, purchase_rows, purchase_return_rows):
	output_taxable = sum(flt(r["amount"]) for r in sales_rows)
	output_gst = sum(flt(r["gst_amount"]) for r in sales_rows)
	output_return_taxable = sum(flt(r["amount"]) for r in sales_return_rows)
	output_return_gst = sum(flt(r["gst_amount"]) for r in sales_return_rows)

	input_taxable = sum(flt(r["amount"]) for r in purchase_rows)
	input_gst = sum(flt(r["gst_amount"]) for r in purchase_rows)
	input_return_taxable = sum(flt(r["amount"]) for r in purchase_return_rows)
	input_return_gst = sum(flt(r["gst_amount"]) for r in purchase_return_rows)

	net_output_taxable = output_taxable - output_return_taxable
	net_output_gst = output_gst - output_return_gst
	net_input_taxable = input_taxable - input_return_taxable
	net_input_gst = input_gst - input_return_gst

	# No Company/GSTIN/state field exists anywhere in this app to tell
	# intra-state from inter-state supply, so this assumes a single-location,
	# single-GSTIN business and splits GST evenly for statutory-format display.
	return {
		"output_taxable": net_output_taxable,
		"output_gst": net_output_gst,
		"output_cgst": net_output_gst / 2,
		"output_sgst": net_output_gst / 2,
		"input_taxable": net_input_taxable,
		"input_gst": net_input_gst,
		"input_cgst": net_input_gst / 2,
		"input_sgst": net_input_gst / 2,
		"net_gst_payable": net_output_gst - net_input_gst,
	}
