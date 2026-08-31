# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

# Patient Debit and Debit Collected have no backing field or doctype anywhere
# in the app, so they're always reported as 0 rather than silently guessed
# at. Adv/IP comes straight from Billing.advance_adjusted.
UNTRACKED_COLUMNS = ("patient_debit", "debit_collected")


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
		{"label": "Charity", "fieldname": "charity", "fieldtype": "Currency", "width": 100},
		{"label": "Card", "fieldname": "card", "fieldtype": "Currency", "width": 100},
		{"label": "Gpay", "fieldname": "gpay", "fieldtype": "Currency", "width": 100},
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
			-- net_amount is already AFTER charity/discount - a fully-discounted
			-- bill would otherwise show Gross Amt as 0 despite genuinely having
			-- been billed for something, and Cash Amt would go negative once
			-- Charity is subtracted from it below. Adding discount_amount back
			-- recovers the real total billed before any charity was applied.
			SUM(net_amount + discount_amount) AS gross_amt,
			SUM(discount_amount) AS charity,
			-- amount_collected, not net_amount - a bill fully (or partly)
			-- covered by Advance Adjusted still keeps whatever Payment Mode
			-- was picked, even though nothing (or only part) was actually
			-- collected that way; summing net_amount here would double-count
			-- that same money under both Adv/IP and Cash/Card/Gpay/Credit Bills.
			SUM(CASE WHEN payment_mode = 'Card' THEN amount_collected ELSE 0 END) AS card,
			SUM(CASE WHEN payment_mode = 'UPI' THEN amount_collected ELSE 0 END) AS gpay,
			SUM(CASE WHEN payment_mode = 'Credit - Corporate' THEN amount_collected ELSE 0 END) AS credit_bills,
			SUM(advance_adjusted) AS adv_ip
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
		SELECT
			returned_by AS owner,
			SUM(total_value) AS sales_ret,
			-- Only Credit Bills nets against its own return here - Cash Amt
			-- isn't summed directly anymore (see below), so a cash refund
			-- only ever shows up once, inside Sales Ret itself.
			SUM(CASE WHEN payment_mode = 'Credit' THEN total_value ELSE 0 END) AS credit_returns
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
		entry = rows_by_user.setdefault(row.owner, frappe._dict())
		entry.sales_ret = row.sales_ret
		entry.credit_returns = row.credit_returns

	full_names = _get_full_names(rows_by_user.keys())
	amount_fields = (
		"gross_amt",
		"charity",
		"card",
		"gpay",
		"credit_bills",
		"sales_ret",
		*UNTRACKED_COLUMNS,
		"adv_ip",
		"cash_amt",
	)

	result = []
	totals = dict.fromkeys(amount_fields, 0)
	for owner, row in rows_by_user.items():
		entry = {"user_name": full_names.get(owner, owner)}
		# Credit Bills is net-of-returns - a return is that same day's
		# transaction against whoever processes it, so it reduces that
		# person's own collected-today figure, not the original bill's day.
		net_credit_bills = flt(row.get("credit_bills")) - flt(row.get("credit_returns"))
		# Cash Amt is never summed directly by payment_mode - it's whatever's
		# left of Gross Amt after every other named column is accounted for,
		# so the row always reconciles even when Payment Mode was left blank
		# (e.g. a fully-discounted bill has no payment mode at all).
		net_cash_amt = (
			flt(row.get("gross_amt"))
			- flt(row.get("charity"))
			- flt(row.get("card"))
			- flt(row.get("gpay"))
			- net_credit_bills
			- flt(row.get("sales_ret"))
			- flt(row.get("adv_ip"))
		)
		for field in amount_fields:
			if field == "cash_amt":
				entry[field] = net_cash_amt
			elif field == "credit_bills":
				entry[field] = net_credit_bills
			elif field in UNTRACKED_COLUMNS:
				entry[field] = 0
			else:
				entry[field] = row.get(field) or 0
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
