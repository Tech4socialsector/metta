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
		{"label": "Qty Change", "fieldname": "qty_change", "fieldtype": "Float", "width": 100},
		{"label": "Balance Qty", "fieldname": "qty_after_transaction", "fieldtype": "Float", "width": 110},
	]


def get_data(filters):
	conditions = []
	values = {}

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
		conditions.append("voucher_type = %(voucher_type)s")
		values["voucher_type"] = filters["voucher_type"]
	# Year + Month, when both are set, take over the date range entirely -
	# picking a whole calendar month is what "month wise" filtering means,
	# rather than making someone work out the first/last date by hand.
	if filters.get("year") and filters.get("month"):
		month_index = MONTHS.index(filters["month"]) + 1
		year = int(filters["year"])
		last_day = calendar.monthrange(year, month_index)[1]
		conditions.append("posting_datetime >= %(from_date)s")
		conditions.append("posting_datetime <= %(to_date)s")
		values["from_date"] = f"{year}-{month_index:02d}-01 00:00:00"
		values["to_date"] = f"{year}-{month_index:02d}-{last_day} 23:59:59"
	else:
		if filters.get("from_date"):
			conditions.append("posting_datetime >= %(from_date)s")
			values["from_date"] = filters["from_date"]
		if filters.get("to_date"):
			conditions.append("posting_datetime <= %(to_date)s")
			values["to_date"] = filters["to_date"]

	where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

	return frappe.db.sql(
		f"""
		SELECT
			posting_datetime, item, item_name, warehouse, batch_no,
			voucher_type, voucher_no, qty_change, qty_after_transaction
		FROM `tabStock Ledger Entry`
		{where_clause}
		ORDER BY posting_datetime ASC, creation ASC
		""",
		values,
		as_dict=True,
	)
