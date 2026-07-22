# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class StockBalance(Document):
	pass


def get_or_create_stock_balance(item, warehouse):
	# Stock Balance is meant to be system-maintained (one row per item+warehouse),
	# never created by hand - this is the single place that invariant is enforced,
	# so every caller (Purchase Receipt, Sales Bill, etc.) shares it instead of
	# each re-implementing its own get-or-create logic.
	name = f"{item}-{warehouse}"
	if frappe.db.exists("Stock Balance", name):
		return frappe.get_doc("Stock Balance", name)
	stock_balance_doc = frappe.get_doc(
		{"doctype": "Stock Balance", "item": item, "warehouse": warehouse, "actual_qty": 0}
	)
	stock_balance_doc.insert(ignore_permissions=True)
	return stock_balance_doc
