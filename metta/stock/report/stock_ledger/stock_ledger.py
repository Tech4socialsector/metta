# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import calendar

import frappe

MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": "Posting Date", "fieldname": "posting_datetime", "fieldtype": "Datetime", "width": 160},
		{"label": "Item", "fieldname": "item", "fieldtype": "Link", "options": "Item", "width": 110},
		{"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 160},
		{"label": "Warehouse", "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 110},
		{"label": "Batch", "fieldname": "batch_no", "fieldtype": "Link", "options": "Batch", "width": 130},
		{"label": "Voucher Type", "fieldname": "voucher_type", "fieldtype": "Data", "width": 130},
		{
			"label": "Voucher No",
			"fieldname": "voucher_no",
			"fieldtype": "Dynamic Link",
			"options": "voucher_type",
			"width": 140,
		},
		{"label": "In / Out", "fieldname": "qty_change", "fieldtype": "Float", "width": 100},
		# Two balances, because "Balance Qty" alone was read as the batch's
		# own stock: the batch's running total, and the whole warehouse's
		# (all batches of the item) - the stored qty_after_transaction.
		{"label": "Batch Balance", "fieldname": "batch_balance", "fieldtype": "Float", "width": 110},
		{"label": "Warehouse Balance", "fieldname": "qty_after_transaction", "fieldtype": "Float", "width": 130},
	]


def get_data(filters):
	conditions = []
	values = {}
	# item / warehouse / batch only pick which running totals to show, so they
	# can narrow the inner query; voucher type and dates must NOT, or the
	# batch balance would start from 0 at the From Date instead of carrying
	# the batch's earlier history. Those go on the outer query.
	outer = []

	# Only the filters actually provided narrow the query - an empty Stock
	# Ledger report (no filters at all) still returns every entry, same as
	# the raw list view would.
	if filters.get("item"):
		conditions.append("item = %(item)s")
		values["item"] = filters["item"]
	if filters.get("warehouse"):
		conditions.append("warehouse = %(warehouse)s")
		values["warehouse"] = filters["warehouse"]
	if filters.get("batch_no"):
		conditions.append("batch_no = %(batch_no)s")
		values["batch_no"] = filters["batch_no"]
	if filters.get("voucher_type"):
		outer.append("voucher_type = %(voucher_type)s")
		values["voucher_type"] = filters["voucher_type"]
	# Year + Month, when both are set, take over the date range entirely -
	# picking a whole calendar month is what "month wise" filtering means,
	# rather than making someone work out the first/last date by hand.
	if filters.get("year") and filters.get("month"):
		month_index = MONTHS.index(filters["month"]) + 1
		year = int(filters["year"])
		last_day = calendar.monthrange(year, month_index)[1]
		outer.append("posting_datetime >= %(from_date)s")
		outer.append("posting_datetime <= %(to_date)s")
		values["from_date"] = f"{year}-{month_index:02d}-01 00:00:00"
		values["to_date"] = f"{year}-{month_index:02d}-{last_day} 23:59:59"
	else:
		if filters.get("from_date"):
			outer.append("posting_datetime >= %(from_date)s")
			values["from_date"] = filters["from_date"]
		if filters.get("to_date"):
			outer.append("posting_datetime <= %(to_date)s")
			values["to_date"] = filters["to_date"]

	where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
	outer_clause = f"WHERE {' AND '.join(outer)}" if outer else ""

	rows = frappe.db.sql(
		f"""
		SELECT * FROM (
			SELECT
				posting_datetime, creation, item, item_name, warehouse, batch_no,
				voucher_type, voucher_no, qty_change, qty_after_transaction,
				SUM(qty_change) OVER (
					PARTITION BY item, warehouse, batch_no
					ORDER BY posting_datetime, creation
					ROWS UNBOUNDED PRECEDING
				) AS batch_balance
			FROM `tabStock Ledger Entry`
			{where_clause}
		) sle
		{outer_clause}
		ORDER BY posting_datetime ASC, creation ASC
		""",
		values,
		as_dict=True,
	)
	for r in rows:
		r.pop("creation", None)
		# Items kept without batches have no batch balance to show.
		if not r.batch_no:
			r.batch_balance = None
	return rows
