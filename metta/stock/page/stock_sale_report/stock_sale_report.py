# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_data(from_date, to_date, warehouse=None, item=None, item_type=None, bill_type=None):
	# Billing (not Stock Ledger Entry) is the source for the sale side - it
	# carries the actual selling rate/GST/discount, where the ledger only
	# knows cost-basis valuation. Sales Return is netted in separately so a
	# returned item doesn't inflate what actually stayed sold.
	frappe.has_permission("Billing", "read", throw=True)
	frappe.has_permission("Sales Return", "read", throw=True)

	item_conditions = []
	item_values = {}
	if item:
		item_conditions.append("bi.item = %(item)s")
		item_values["item"] = item
	if item_type:
		item_conditions.append("i.item_type = %(item_type)s")
		item_values["item_type"] = item_type
	item_where = (" AND " + " AND ".join(item_conditions)) if item_conditions else ""

	sold_values = dict(item_values)
	sold_values["from_datetime"] = f"{from_date} 00:00:00"
	sold_values["to_datetime"] = f"{to_date} 23:59:59"
	warehouse_condition = ""
	if warehouse:
		warehouse_condition = "AND b.warehouse = %(warehouse)s"
		sold_values["warehouse"] = warehouse
	bill_type_condition = ""
	if bill_type:
		bill_type_condition = "AND b.bill_type = %(bill_type)s"
		sold_values["bill_type"] = bill_type

	sold_rows = frappe.db.sql(
		f"""
		SELECT bi.item, bi.item_name, i.item_type, b.warehouse,
			SUM(bi.qty) AS qty_sold,
			SUM(bi.amount) AS gross_value,
			SUM(bi.gst_amount) AS gst_collected,
			COUNT(DISTINCT b.name) AS bill_count
		FROM `tabSales Bill Item` bi
		INNER JOIN `tabBilling` b ON b.name = bi.parent
		INNER JOIN `tabItem` i ON i.name = bi.item
		WHERE b.docstatus = 1 AND b.sale_datetime BETWEEN %(from_datetime)s AND %(to_datetime)s
			{warehouse_condition} {bill_type_condition} {item_where}
		GROUP BY bi.item, b.warehouse
		""",
		sold_values,
		as_dict=True,
	)
	sold = {(r.item, r.warehouse): r for r in sold_rows}

	# Sales Return doesn't have its own bill_type/item_type filters the same
	# way Billing does - it's netted in purely by item+warehouse+date, since
	# a return doesn't carry a "bill type" of its own to filter on.
	return_values = dict(item_values)
	return_values["from_datetime"] = sold_values["from_datetime"]
	return_values["to_datetime"] = sold_values["to_datetime"]
	return_warehouse_condition = ""
	if warehouse:
		return_warehouse_condition = "AND sr.to_warehouse = %(warehouse)s"
		return_values["warehouse"] = warehouse

	returned_rows = frappe.db.sql(
		f"""
		SELECT sri.item, sri.item_name, i.item_type, sr.to_warehouse AS warehouse,
			SUM(sri.qty_returned) AS qty_returned,
			SUM(sri.amount) AS return_value
		FROM `tabSales Return Item` sri
		INNER JOIN `tabSales Return` sr ON sr.name = sri.parent
		INNER JOIN `tabItem` i ON i.name = sri.item
		WHERE sr.docstatus = 1 AND sr.return_date_time BETWEEN %(from_datetime)s AND %(to_datetime)s
			{return_warehouse_condition} {item_where}
		GROUP BY sri.item, sr.to_warehouse
		""",
		return_values,
		as_dict=True,
	)
	returned = {(r.item, r.warehouse): r for r in returned_rows}

	# The two queries don't share a row set - an item can be sold with zero
	# returns, or (less commonly) returned against a Material Issue in a
	# warehouse it wasn't freshly sold into this same range - so the result
	# has to be the union of every key seen in either query.
	keys = set(sold) | set(returned)
	if not keys:
		return []

	result = []
	for item_code, wh in keys:
		s = sold.get((item_code, wh))
		r = returned.get((item_code, wh))

		qty_sold = flt(s.qty_sold) if s else 0
		gross_value = flt(s.gross_value) if s else 0
		gst_collected = flt(s.gst_collected) if s else 0
		bill_count = s.bill_count if s else 0
		qty_returned = flt(r.qty_returned) if r else 0
		return_value = flt(r.return_value) if r else 0

		# Some Item records have stray whitespace (even literal tab
		# characters) baked into item_name in this system - stripped here so
		# it doesn't render as a lopsided gap, same issue already found and
		# fixed in the Outlet-wise Expiry Report.
		item_name = (s.item_name if s else (r.item_name if r else "")) or ""
		item_type = (s.item_type if s else (r.item_type if r else "")) or ""

		result.append(
			{
				"item": item_code,
				"item_name": item_name.strip(),
				"item_type": item_type,
				"warehouse": wh,
				"bill_count": bill_count,
				"qty_sold": qty_sold,
				"qty_returned": qty_returned,
				"net_qty": qty_sold - qty_returned,
				"gross_value": gross_value,
				"return_value": return_value,
				"net_value": gross_value - return_value,
				"gst_collected": gst_collected,
			}
		)

	result.sort(key=lambda r: r["net_value"], reverse=True)
	return result
