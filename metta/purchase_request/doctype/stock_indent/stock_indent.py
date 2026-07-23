# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

# Statuses reached only after Submitted - a Stock Transfer can move the
# indent forward through these, but must never touch a Draft/Cancelled indent.
ISSUING_STATUSES = ("Submitted", "Partially Issued", "Issued")


class StockIndent(Document):
	pass


def refresh_issuing_status(stock_indent_name):
	# Called by Stock Transfer after it updates qty_issued, so the indent's
	# status always reflects reality without anyone touching it by hand.
	indent = frappe.get_doc("Stock Indent", stock_indent_name)
	if indent.status not in ISSUING_STATUSES:
		return

	total_requested = sum(flt(row.qty_requested) for row in indent.items)
	total_issued = sum(flt(row.qty_issued) for row in indent.items)

	# Unlike a one-way receiving status, this must also revert cleanly back to
	# "Submitted" when a Stock Transfer against it is cancelled and
	# total_issued drops back to zero - not get stuck on "Issued"/"Partially
	# Issued" forever.
	if total_issued <= 0:
		new_status = "Submitted"
	elif total_issued >= total_requested:
		new_status = "Issued"
	else:
		new_status = "Partially Issued"

	if new_status != indent.status:
		indent.db_set("status", new_status, update_modified=False)


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
