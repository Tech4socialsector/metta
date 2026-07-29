# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class QualityInspection(Document):
	def validate(self):
		# JS keeps Qty Rejected/Qty Accepted live while editing (each is
		# Qty Delivered minus the other), but validate() is the authoritative
		# recompute so this is still correct even via the API or an import,
		# not just when the client script ran.
		for row in self.items:
			row.qty_rejected = flt(row.qty_delivered) - flt(row.qty_accepted)
			if row.qty_rejected < 0:
				frappe.throw(
					_("Row #{0}: Qty Accepted cannot be more than Qty Delivered.").format(row.idx)
				)
			if row.qty_rejected > 0 and not row.rejection_reason:
				frappe.throw(
					_("Row #{0}: Rejection Reason is mandatory when Qty Rejected is greater than 0.").format(
						row.idx
					)
				)

	def on_update(self):
		self.refresh_purchase_receipt_link()

	def on_cancel(self):
		self.refresh_purchase_receipt_link()

	def on_trash(self):
		self.refresh_purchase_receipt_link()

	def refresh_purchase_receipt_link(self):
		# Keeps the Purchase Receipt list's "Linked Quality Inspection" column
		# accurate regardless of how this was created, cancelled, or deleted -
		# not just when it happened via the receipt's own button.
		if not self.purchase_receipt:
			return
		existing = get_existing_inspection_for_purchase_receipt(self.purchase_receipt)
		# update_modified=False - this is a side effect of saving a *different*
		# document, not something someone editing this Purchase Receipt did;
		# bumping its timestamp would wrongly collide with their own edit.
		frappe.db.set_value(
			"Purchase Receipt",
			self.purchase_receipt,
			"linked_quality_inspection",
			existing or "",
			update_modified=False,
		)


@frappe.whitelist()
def get_existing_inspection_for_purchase_receipt(purchase_receipt):
	# One Purchase Receipt should only ever get one Quality Inspection (it
	# already covers every item on the receipt in one go) - without this, a
	# "Create Quality Inspection" button on the receipt would keep spawning
	# duplicates for the same delivery.
	if not purchase_receipt:
		return None
	return frappe.db.get_value(
		"Quality Inspection", {"purchase_receipt": purchase_receipt, "docstatus": ["!=", 2]}, "name"
	)


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
