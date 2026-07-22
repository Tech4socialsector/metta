# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class StockIndent(Document):
	pass


@frappe.whitelist()
def search_items_for_indent(warehouse=None, search_term=""):
	# Item Group's own name IS the medicine's identity (e.g. "dolo", "Dolo 650
	# Tablet"), so searching that field is searching by item name.
	filters = {}
	if search_term:
		filters["item_group"] = ["like", f"%{search_term}%"]

	items = frappe.get_all(
		"Medicine Item",
		fields=["name as item_code", "item_group", "manufacturer", "standard_purchase_rate", "rack_location"],
		filters=filters,
		limit=20,
	)

	result = []
	for it in items:
		category = frappe.db.get_value("Item Group", it.item_group, "parent_item_group")
		# Only Purchase Receipt currently keeps Stock Balance updated - other
		# stock-moving doctypes still need the same logic wired in, so this
		# may read 0 for movements that haven't been extended yet.
		avail_qty = 0
		if warehouse:
			avail_qty = frappe.db.get_value(
				"Stock Balance", {"item": it.item_code, "warehouse": warehouse}, "actual_qty"
			) or 0
		result.append(
			{
				"item_code": it.item_code,
				"name": it.item_group,
				"avail_qty": avail_qty,
				"category": category,
				"manufacturer": it.manufacturer or "",
				"last_pur_rate": it.standard_purchase_rate or 0,
				"rack_location": it.rack_location or "",
			}
		)
	return result
