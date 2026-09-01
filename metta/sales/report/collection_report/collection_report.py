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
			-- Gross Amt is the real, full amount billed to the patient - for a
			-- Charity bill that's net_amount itself (before the discount is
			-- taken off); for an Increase (Corporate) bill, the increase is
			-- already part of what was billed, so Gross Amt has to include it
			-- too, i.e. payable_amount, not the smaller pre-increase net_amount.
			SUM(CASE WHEN COALESCE(adjustment_type, '') = 'Increase' THEN payable_amount ELSE net_amount END) AS gross_amt,
			-- "Increase" (Corporate) is the hospital charging MORE, never a
			-- concession given to the patient - it must never be counted as
			-- charity given out, even though it shares the same Charity Amount
			-- field on the bill.
			SUM(CASE WHEN COALESCE(adjustment_type, '') != 'Increase' THEN charity_amount ELSE 0 END) AS charity,
			-- The real amount actually owed on the bill, whichever way Charity
			-- Percent pushed it - Cash Amt is reconciled against this below,
			-- not against "gross_amt - charity" (which only holds true for a
			-- real Charity discount, not an Increase).
			SUM(payable_amount) AS payable_amt,
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

	# The OP registration/consultation fee is its own transaction on Patient
	# Visit, not a Billing row at all (see Local Group Wise Details, which
	# already pulls this in the same way) - IP has no fee_amount of its own,
	# so nothing to add for IP here, its charges all flow through Billing.
	reg_conditions, reg_values = _date_range_conditions(filters, "date")
	registration_fees = frappe.db.sql(
		f"""
		SELECT
			collected_by AS owner,
			-- Same reasoning as Billing's own Gross Amt above - an Increase
			-- bill's net_amount already has the increase baked into it, so
			-- that's the real billed amount; a Charity (or unadjusted) bill's
			-- real billed amount is fee_amount, before the discount comes off.
			SUM(CASE WHEN COALESCE(adjustment_type, '') = 'Increase' THEN net_amount ELSE fee_amount END) AS gross_amt,
			SUM(CASE WHEN COALESCE(adjustment_type, '') != 'Increase' THEN discount_amount ELSE 0 END) AS charity,
			-- Patient Visit's own net_amount is already the real amount owed
			-- (fee_amount adjusted for Charity or Increase, whichever applies) -
			-- same role Billing's payable_amount plays above.
			SUM(net_amount) AS payable_amt,
			SUM(CASE WHEN payment_mode = 'Card' THEN net_amount ELSE 0 END) AS card,
			SUM(CASE WHEN payment_mode = 'UPI' THEN net_amount ELSE 0 END) AS gpay,
			SUM(CASE WHEN payment_mode = 'Credit - Corporate' THEN net_amount ELSE 0 END) AS credit_bills
		FROM `tabPatient Visit`
		WHERE registration_category = 'OP' AND net_amount > 0 {reg_conditions}
		GROUP BY collected_by
		""",
		reg_values,
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
	# Additive, not a straight overwrite - the same person can easily have
	# both Billing bills and OP registrations on the same day, and neither
	# source is allowed to clobber the other's figures.
	for row in registration_fees:
		entry = rows_by_user.setdefault(row.owner, frappe._dict())
		for field in ("gross_amt", "charity", "payable_amt", "card", "gpay", "credit_bills"):
			entry[field] = flt(entry.get(field)) + flt(row.get(field))

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
		# Kept alongside the display name (not shown as its own report
		# column) so the Daily Collection Report page can drill a row down
		# into its real bills/visits without a separate name-to-user lookup.
		entry = {"user_name": full_names.get(owner, owner), "owner": owner}
		# Credit Bills is net-of-returns - a return is that same day's
		# transaction against whoever processes it, so it reduces that
		# person's own collected-today figure, not the original bill's day.
		net_credit_bills = flt(row.get("credit_bills")) - flt(row.get("credit_returns"))
		# Cash Amt is never summed directly by payment_mode - it's whatever's
		# left of the real amount owed (Payable Amt - the actual bill total
		# after Charity or Increase, whichever applies) once every other named
		# column is accounted for, so the row always reconciles even when
		# Payment Mode was left blank (e.g. a fully-discounted bill has no
		# payment mode at all). Reconciled against Payable Amt, not against
		# "Gross Amt - Charity" - that only holds true for a real Charity
		# discount, not an Increase, where the patient actually owes MORE
		# than Gross Amt, not less.
		net_cash_amt = (
			flt(row.get("payable_amt"))
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
