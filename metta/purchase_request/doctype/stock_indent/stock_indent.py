# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class StockIndent(Document):
	pass


@frappe.whitelist()
def search_items_for_indent(warehouse=None, search_term=""):
	# Services aren't stocked or indentable - only physical items can be
	# requested from a warehouse.
	filters = {"item_type": ["in", ["Medicine", "Consumable", "Asset"]]}
	if search_term:
		filters["item_name"] = ["like", f"%{search_term}%"]

	items = frappe.get_all(
		"Item",
		fields=["name as item_code", "item_name", "manufacturer", "rack_location"],
		filters=filters,
		limit=20,
	)

	result = []
	for it in items:
		avail_qty = 0
		if warehouse:
			avail_qty = frappe.db.get_value(
				"Stock Balance", {"item": it.item_code, "warehouse": warehouse}, "actual_qty"
			) or 0
		result.append(
			{
				"item_code": it.item_code,
				"name": it.item_name,
				"avail_qty": avail_qty,
				"manufacturer": it.manufacturer or "",
				"rack_location": it.rack_location or "",
			}
		)
	return result
