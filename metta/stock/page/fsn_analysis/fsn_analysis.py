# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, getdate

# Below this active-days ratio an item is "Slow-Moving" rather than "Fast" -
# e.g. 0.5 means it has to move out on at least half the days in the
# selected range to count as fast. Zero movement at all is "Non-Moving"
# regardless of this threshold.
FAST_MOVING_RATIO = 0.5


@frappe.whitelist()
def get_data(from_date, to_date, warehouse=None, item=None, item_type=None):
	# Fast/Slow/Non-Moving is judged by movement FREQUENCY (how many distinct
	# days had an outward transaction), not raw quantity - a ratio survives
	# whatever date range is picked (a week, a month, a quarter) without
	# needing separate "weekly report" / "monthly report" logic.
	#
	# What counts as "outward" is whatever the Stock Ledger Entry already
	# recorded as leaving that warehouse - Stock Transfer-out for a Central
	# Store, Material Issue for a Pharmacy - so the same query works for
	# both without a special case; the warehouse filter is what changes the
	# meaning, not the code.
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
		# The last ledger entry per item/warehouse/batch on or before a
		# given moment IS the balance at that moment, since
		# qty_after_transaction is already a running total - same technique
		# Previous Day Stock Report uses, just summed across batches here
		# since FSN Analysis doesn't need batch-level granularity.
		values = dict(values_common)
		values["as_of_datetime"] = as_of_datetime
		rows = frappe.db.sql(
			f"""
			SELECT item, warehouse,
				SUM(qty_after_transaction) AS qty,
				SUM(qty_after_transaction * valuation_rate) AS value
			FROM (
				SELECT sle.item, sle.warehouse, sle.batch_no, sle.qty_after_transaction, sle.valuation_rate,
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
		SELECT
			sle.item, sle.warehouse,
			SUM(CASE WHEN sle.qty_change > 0 THEN sle.qty_change ELSE 0 END) AS inward_qty,
			SUM(CASE WHEN sle.qty_change < 0 THEN -sle.qty_change ELSE 0 END) AS outward_qty,
			COUNT(DISTINCT CASE WHEN sle.qty_change < 0 THEN DATE(sle.posting_datetime) END) AS active_days,
			MAX(CASE WHEN sle.qty_change < 0 THEN sle.posting_datetime END) AS last_outward_datetime
		FROM `tabStock Ledger Entry` sle
		INNER JOIN `tabItem` i ON i.name = sle.item
		WHERE sle.posting_datetime BETWEEN %(from_datetime)s AND %(to_datetime)s {warehouse_condition} {item_where}
		GROUP BY sle.item, sle.warehouse
		""",
		values_movement,
		as_dict=True,
	)
	movement = {(r.item, r.warehouse): r for r in movement_rows}

	# The three queries above don't share a row set - an item can have an
	# opening balance with zero movement in range, or movement in range
	# starting from nothing, so the full result has to be the union of every
	# (item, warehouse) key seen anywhere, not just one query's keys.
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

	total_days = (getdate(to_date) - getdate(from_date)).days + 1

	result = []
	for item_code, wh in keys:
		o = opening.get((item_code, wh))
		c = closing.get((item_code, wh))
		m = movement.get((item_code, wh))

		opening_qty = o.qty if o else 0
		# With no ledger activity in range at all, the balance never
		# changed - closing falls back to opening rather than 0, so an
		# untouched item still shows its real quantity, not a false zero.
		closing_qty = c.qty if c else opening_qty
		closing_value = c.value if c else 0
		active_days = m.active_days if m else 0

		if active_days == 0:
			movement_status = "Non-Moving"
		elif total_days and (active_days / total_days) >= FAST_MOVING_RATIO:
			movement_status = "Fast-Moving"
		else:
			movement_status = "Slow-Moving"

		meta = item_meta.get(item_code)
		result.append(
			{
				"item": item_code,
				"item_name": meta.item_name if meta else "",
				"item_type": meta.item_type if meta else "",
				"warehouse": wh,
				"opening_qty": opening_qty,
				"inward_qty": m.inward_qty if m else 0,
				"outward_qty": m.outward_qty if m else 0,
				"closing_qty": closing_qty,
				"closing_value": closing_value,
				"active_days": active_days,
				"total_days": total_days,
				"last_outward_datetime": m.last_outward_datetime if m else None,
				"movement_status": movement_status,
			}
		)

	result.sort(key=lambda r: (r["warehouse"] or "", r["item"] or ""))
	return result
