# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days


@frappe.whitelist()
def get_item_movement_data(from_date, to_date, warehouse=None, item=None, item_type=None):
	# Available/Issued/Remaining is the same opening/movement/closing snapshot
	# technique FSN Analysis uses - the last ledger entry per item/warehouse/
	# batch on or before a given moment already IS the balance at that moment
	# (qty_after_transaction is a running total), so no separate balance table
	# is needed.
	frappe.has_permission("Stock Ledger Entry", "read", throw=True)

	item_conditions = []
	item_values = {}
	if item:
		item_conditions.append("i.name = %(item)s")
		item_values["item"] = item
	if item_type:
		item_conditions.append("i.item_type = %(item_type)s")
		item_values["item_type"] = item_type
	item_where = (" AND " + " AND ".join(item_conditions)) if item_conditions else ""

	values_common = dict(item_values)
	warehouse_condition = ""
	if warehouse:
		warehouse_condition = "AND sle.warehouse = %(warehouse)s"
		values_common["warehouse"] = warehouse

	def snapshot(as_of_datetime):
		values = dict(values_common)
		values["as_of_datetime"] = as_of_datetime
		rows = frappe.db.sql(
			f"""
			SELECT item, warehouse, SUM(qty_after_transaction) AS qty
			FROM (
				SELECT sle.item, sle.warehouse, sle.batch_no, sle.qty_after_transaction,
					ROW_NUMBER() OVER (
						PARTITION BY sle.item, sle.warehouse, sle.batch_no
						ORDER BY sle.posting_datetime DESC, sle.creation DESC
					) AS rn
				FROM `tabStock Ledger Entry` sle
				INNER JOIN `tabItem` i ON i.name = sle.item
				WHERE sle.posting_datetime <= %(as_of_datetime)s {warehouse_condition} {item_where}
			) ranked
			WHERE rn = 1
			GROUP BY item, warehouse
			""",
			values,
			as_dict=True,
		)
		return {(r.item, r.warehouse): r for r in rows}

	opening = snapshot(f"{add_days(from_date, -1)} 23:59:59")
	closing = snapshot(f"{to_date} 23:59:59")

	values_movement = dict(values_common)
	values_movement["from_datetime"] = f"{from_date} 00:00:00"
	values_movement["to_datetime"] = f"{to_date} 23:59:59"
	movement_rows = frappe.db.sql(
		f"""
		SELECT sle.item, sle.warehouse,
			SUM(CASE WHEN sle.qty_change < 0 THEN -sle.qty_change ELSE 0 END) AS issued_qty
		FROM `tabStock Ledger Entry` sle
		INNER JOIN `tabItem` i ON i.name = sle.item
		WHERE sle.posting_datetime BETWEEN %(from_datetime)s AND %(to_datetime)s {warehouse_condition} {item_where}
		GROUP BY sle.item, sle.warehouse
		""",
		values_movement,
		as_dict=True,
	)
	movement = {(r.item, r.warehouse): r for r in movement_rows}

	# An item can have an opening balance with no movement in range, or
	# movement in range starting from a zero balance - the full result has to
	# be the union of every key seen anywhere, not just one query's keys.
	keys = set(opening) | set(closing) | set(movement)
	if not keys:
		return []

	item_codes = {k[0] for k in keys}
	item_meta = {
		d.name: d
		for d in frappe.db.get_all(
			"Item", filters={"name": ["in", list(item_codes)]}, fields=["name", "item_name", "item_type"]
		)
	}

	result = []
	for item_code, wh in keys:
		o = opening.get((item_code, wh))
		c = closing.get((item_code, wh))
		m = movement.get((item_code, wh))

		available_qty = o.qty if o else 0
		issued_qty = m.issued_qty if m else 0
		# With no ledger activity in range at all, the balance never changed -
		# closing falls back to opening rather than 0, so an untouched item
		# still shows its real quantity, not a false zero.
		remaining_qty = c.qty if c else available_qty

		meta = item_meta.get(item_code)
		result.append(
			{
				"item": item_code,
				"item_name": meta.item_name if meta else "",
				"item_type": meta.item_type if meta else "",
				"warehouse": wh,
				"available_qty": available_qty,
				"issued_qty": issued_qty,
				"remaining_qty": remaining_qty,
				"not_moving": bool(available_qty > 0 and not issued_qty),
			}
		)

	result.sort(key=lambda r: (r["warehouse"] or "", r["item"] or ""))
	return result


@frappe.whitelist()
def get_stock_position_data(from_date, to_date, warehouse=None, item=None, status=None):
	# Stock Position tracks each outlet's Stock Indent requests through to
	# fulfilment - Qty Requested/Issued/Pending already live on Stock Indent
	# Item, and "who issued it" comes from the Stock Transfer(s) raised
	# against that Indent (against_indent), since issuing itself happens on
	# Stock Transfer, not on the Indent.
	frappe.has_permission("Stock Indent", "read", throw=True)
	frappe.has_permission("Stock Transfer", "read", throw=True)

	# Stock Indent isn't a submittable doctype here (docstatus always stays 0)
	# - "approved and moving" is tracked through the status field itself, so a
	# still-Draft indent (nothing requested/approved yet) is excluded instead.
	conditions = [
		"si.status != 'Draft'",
		"DATE(si.request_date_time) >= %(from_date)s",
		"DATE(si.request_date_time) <= %(to_date)s",
	]
	values = {"from_date": from_date, "to_date": to_date}

	if warehouse:
		conditions.append("si.requesting_warehouse = %(warehouse)s")
		values["warehouse"] = warehouse
	if item:
		conditions.append("sii.item = %(item)s")
		values["item"] = item
	if status:
		conditions.append("si.status = %(status)s")
		values["status"] = status

	where_clause = " AND ".join(conditions)

	rows = frappe.db.sql(
		f"""
		SELECT
			si.name AS stock_indent, si.requesting_warehouse AS warehouse, si.requested_by,
			si.request_date_time, si.required_by, si.priority, si.status,
			sii.item, sii.item_name, sii.qty_requested, sii.qty_issued, sii.qty_pending
		FROM `tabStock Indent Item` sii
		INNER JOIN `tabStock Indent` si ON si.name = sii.parent
		WHERE {where_clause}
		ORDER BY si.request_date_time DESC, si.name ASC
		""",
		values,
		as_dict=True,
	)
	if not rows:
		return []

	indent_names = list({r.stock_indent for r in rows})
	transfer_rows = frappe.db.sql(
		"""
		SELECT against_indent, GROUP_CONCAT(DISTINCT issued_by) AS issued_by, MAX(dispatch_date_time) AS issue_date
		FROM `tabStock Transfer`
		WHERE against_indent IN %(indents)s AND docstatus = 1
		GROUP BY against_indent
		""",
		{"indents": indent_names},
		as_dict=True,
	)
	transfer_map = {r.against_indent: r for r in transfer_rows}

	for row in rows:
		t = transfer_map.get(row.stock_indent)
		row["issued_by"] = t.issued_by if t else None
		row["issue_date"] = t.issue_date if t else None

	return rows
