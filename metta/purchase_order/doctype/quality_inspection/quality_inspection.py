# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class QualityInspection(Document):
	pass


@frappe.whitelist()
def get_items_to_inspect(purchase_receipt):
	# Purchase Receipt already has the real Batch No, Expiry Date and Qty
	# Received for this specific delivery - pulling from it (rather than the
	# Purchase Order, which only knows what was ordered) means those three
	# fields come across automatically too, and only the actual inspection
	# outcome (Qty Accepted/Rejected, Result) is left for the inspector.
	pr = frappe.get_doc("Purchase Receipt", purchase_receipt)
	return [
		{
			"item": row.item,
			"item_name": frappe.db.get_value("Item", row.item, "item_name") or "",
			"batch_no": row.batch_no,
			"expiry_date": row.expiry_date,
			"qty_delivered": row.qty_received,
		}
		for row in pr.items
	]
