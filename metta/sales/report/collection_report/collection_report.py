# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe

# The columns below are only what today's schema can actually answer -
# Patient Debit, Debit Collected and Adv/IP have no backing field or
# doctype anywhere in the app yet, so they're always reported as 0 rather
# than silently guessed at.
UNTRACKED_COLUMNS = ("patient_debit", "debit_collected", "adv_ip")


def execute(filters=None):
	# Collection Report's own permission check (via its "roles" list + the
	# ref_doctype=Billing check the report framework runs) never sees that
	# get_data() also reads straight from Sales Return - checked explicitly
	# here for the same reason Stock Sale Report checks it.
	frappe.has_permission("Sales Return", "read", throw=True)

	filters = filters or {}
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": "User Name", "fieldname": "user_name", "fieldtype": "Data", "width": 160},
		{"label": "Gross Amt", "fieldname": "gross_amt", "fieldtype": "Currency", "width": 110},
		{"label": "Epay", "fieldname": "epay", "fieldtype": "Currency", "width": 100},
		{"label": "Credit Bills", "fieldname": "credit_bills", "fieldtype": "Currency", "width": 110},
		{"label": "Sales Ret", "fieldname": "sales_ret", "fieldtype": "Currency", "width": 100},
		{"label": "Patient Debit", "fieldname": "patient_debit", "fieldtype": "Currency", "width": 110},
		{"label": "Debit Collected", "fieldname": "debit_collected", "fieldtype": "Currency", "width": 120},
		{"label": "Adv/IP", "fieldname": "adv_ip", "fieldtype": "Currency", "width": 100},
		{"label": "Cash Amt", "fieldname": "cash_amt", "fieldtype": "Currency", "width": 100},
	]


def get_data(filters):
	bill_conditions, bill_values = _date_range_conditions(filters, "sale_datetime")
	bills = frappe.db.sql(
		f"""
		SELECT
			owner,
			SUM(net_amount) AS gross_amt,
			SUM(CASE WHEN payment_mode = 'Cash' THEN net_amount ELSE 0 END) AS cash_amt,
			SUM(CASE WHEN payment_mode IN ('UPI', 'Card') THEN net_amount ELSE 0 END) AS epay,
			SUM(CASE WHEN payment_mode = 'Credit - Corporate' THEN net_amount ELSE 0 END) AS credit_bills
		FROM `tabBilling`
		WHERE docstatus = 1 {bill_conditions}
		GROUP BY owner
		""",
		bill_values,
		as_dict=True,
	)

	return_conditions, return_values = _date_range_conditions(filters, "return_date_time")
	returns = frappe.db.sql(
		f"""
		SELECT returned_by AS owner, SUM(total_value) AS sales_ret
		FROM `tabSales Return`
		WHERE docstatus = 1 {return_conditions}
		GROUP BY returned_by
		""",
		return_values,
		as_dict=True,
	)

	# A cashier who only processed returns (no bills) in this range, or vice
	# versa, still needs a row - neither side of this merge is allowed to
	# silently drop them.
	rows_by_user = {row.owner: row for row in bills}
	for row in returns:
		rows_by_user.setdefault(row.owner, frappe._dict()).sales_ret = row.sales_ret

	full_names = _get_full_names(rows_by_user.keys())
	amount_fields = (
		"gross_amt",
		"epay",
		"credit_bills",
		"sales_ret",
		*UNTRACKED_COLUMNS,
		"cash_amt",
	)

	result = []
	totals = dict.fromkeys(amount_fields, 0)
	for owner, row in rows_by_user.items():
		entry = {"user_name": full_names.get(owner, owner)}
		for field in amount_fields:
			entry[field] = 0 if field in UNTRACKED_COLUMNS else row.get(field) or 0
			totals[field] += entry[field]
		result.append(entry)

	result.sort(key=lambda r: r["user_name"] or "")

	if result:
		result.append({"user_name": "Total", **totals})

	return result


def _date_range_conditions(filters, date_field):
	conditions = []
	values = {}
	if filters.get("from_date"):
		conditions.append(f"{date_field} >= %(from_date)s")
		values["from_date"] = f"{filters['from_date']} 00:00:00"
	if filters.get("to_date"):
		conditions.append(f"{date_field} <= %(to_date)s")
		values["to_date"] = f"{filters['to_date']} 23:59:59"
	return ("AND " + " AND ".join(conditions)) if conditions else "", values


def _get_full_names(owners):
	owners = [o for o in owners if o]
	if not owners:
		return {}
	rows = frappe.get_all("User", filters={"name": ["in", owners]}, fields=["name", "full_name"])
	return {row.name: row.full_name or row.name for row in rows}
