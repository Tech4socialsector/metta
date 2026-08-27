# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt, getdate


@frappe.whitelist()
def get_data(from_date, to_date, warehouse=None, item=None, item_type=None, bill_type=None):
	# Billing (not Stock Ledger Entry) is the source for the sale side - it
	# carries the actual selling rate/GST/discount, where the ledger only
	# knows cost-basis valuation.
	frappe.has_permission("Billing", "read", throw=True)
	frappe.has_permission("Stock Balance", "read", throw=True)

	item_conditions = []
	item_values = {}
	if item:
		# "i" (Item) is joined under the same alias in both the sold and
		# stock queries below - unlike "bi" (Sales Bill Item), which only
		# exists in the sold query - so this filter works in both places.
		item_conditions.append("i.name = %(item)s")
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
			SUM(bi.amount) AS sales_value,
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

	# Every item currently holding stock is pulled in too, not just ones that
	# sold in this range - the whole point is to see slow/dead stock sitting
	# next to what's actually moving, not just the sales side on its own.
	stock_values = dict(item_values)
	stock_warehouse_condition = ""
	if warehouse:
		stock_warehouse_condition = "AND sb.warehouse = %(warehouse)s"
		stock_values["warehouse"] = warehouse

	stock_rows = frappe.db.sql(
		f"""
		SELECT sb.item, i.item_name, i.item_type, sb.warehouse, sb.actual_qty
		FROM `tabStock Balance` sb
		INNER JOIN `tabItem` i ON i.name = sb.item
		WHERE sb.actual_qty > 0 {stock_warehouse_condition} {item_where}
		""",
		stock_values,
		as_dict=True,
	)
	stock = {(r.item, r.warehouse): r for r in stock_rows}

	# Stock Ledger Entry's own valuation_rate is never actually populated
	# anywhere in this app (every voucher type creates its entries without
	# passing one) - Batch's own Purchase Rate (the real per-tablet landed
	# cost, set when that batch's Purchase Bill was approved) is used
	# instead, weighted by how much of each batch is still on hand. Same
	# "sum signed ledger movements per batch" technique Batch-wise Stock
	# Listing already uses to work out batch-level quantities.
	stock_value_values = dict(item_values)
	stock_value_warehouse_condition = ""
	if warehouse:
		stock_value_warehouse_condition = "AND sle.warehouse = %(warehouse)s"
		stock_value_values["warehouse"] = warehouse

	stock_value_rows = frappe.db.sql(
		f"""
		WITH batch_qty AS (
			SELECT sle.item, sle.warehouse, sle.batch_no, SUM(sle.qty_change) AS qty
			FROM `tabStock Ledger Entry` sle
			INNER JOIN `tabItem` i ON i.name = sle.item
			WHERE sle.batch_no IS NOT NULL AND sle.batch_no != ''
				{stock_value_warehouse_condition} {item_where}
			GROUP BY sle.item, sle.warehouse, sle.batch_no
		)
		SELECT bq.item, bq.warehouse, SUM(bq.qty * COALESCE(b.purchase_rate, 0)) AS stock_value
		FROM batch_qty bq
		INNER JOIN `tabBatch` b ON b.name = bq.batch_no AND b.item = bq.item
		WHERE bq.qty > 0
		GROUP BY bq.item, bq.warehouse
		""",
		stock_value_values,
		as_dict=True,
	)
	stock_value_by_key = {(r.item, r.warehouse): flt(r.stock_value) for r in stock_value_rows}

	# Reorder Level is a child table on Item, one row per warehouse it's
	# configured for - reused as-is, no new master data needed.
	reorder_rows = frappe.db.get_all(
		"Item Reorder Level", fields=["parent AS item", "warehouse", "reorder_level"]
	)
	reorder_level = {(r.item, r.warehouse): flt(r.reorder_level) for r in reorder_rows}

	keys = set(sold) | set(stock)
	if not keys:
		return []

	days_in_range = (getdate(to_date) - getdate(from_date)).days + 1

	result = []
	for item_code, wh in keys:
		s = sold.get((item_code, wh))
		st = stock.get((item_code, wh))

		qty_sold = flt(s.qty_sold) if s else 0
		sales_value = flt(s.sales_value) if s else 0
		gst_collected = flt(s.gst_collected) if s else 0
		bill_count = s.bill_count if s else 0
		current_stock = flt(st.actual_qty) if st else 0

		# Some Item records have stray whitespace (even literal tab
		# characters) baked into item_name in this system - stripped here so
		# it doesn't render as a lopsided gap, same issue already found and
		# fixed in the Outlet-wise Expiry Report.
		item_name = (s.item_name if s else (st.item_name if st else "")) or ""
		item_type = (s.item_type if s else (st.item_type if st else "")) or ""

		# Only meaningful when something actually sold this period - a
		# genuinely unsold item has no "pace" to project a runout date from,
		# so it's left blank rather than shown as a misleading zero or infinity.
		days_of_stock = None
		if qty_sold > 0:
			daily_pace = qty_sold / days_in_range
			if daily_pace > 0:
				days_of_stock = current_stock / daily_pace

		level = reorder_level.get((item_code, wh))
		is_low_stock = bool(level) and current_stock <= level

		result.append(
			{
				"item": item_code,
				"item_name": item_name.strip(),
				"item_type": item_type,
				"warehouse": wh,
				"bill_count": bill_count,
				"qty_sold": qty_sold,
				"sales_value": sales_value,
				"gst_collected": gst_collected,
				"current_stock": current_stock,
				"stock_value": stock_value_by_key.get((item_code, wh), 0),
				"days_of_stock": days_of_stock,
				"is_low_stock": is_low_stock,
			}
		)

	result.sort(key=lambda r: r["sales_value"], reverse=True)
	return result
