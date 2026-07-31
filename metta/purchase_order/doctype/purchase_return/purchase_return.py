# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_stock,
)

# Only reasons whose wording matches an actual Purchase Return Item option
# carry across automatically - "Wrong Item"/"Quantity Mismatch" are left for
# the person creating the return to pick themselves rather than guess wrong.
QUALITY_INSPECTION_TO_RETURN_REASON = {
	"Damaged": "Damaged",
	"Expired": "Expired",
	"Short Expiry": "Short Expiry",
}


class PurchaseReturn(Document):
	def validate(self):
		# JS keeps this live while editing, but validate() is the authoritative
		# recompute, same as every other bill/order total in this app.
		total = 0
		for row in self.items:
			row.amount = flt(row.qty_returned) * flt(row.rate)
			# Qty Returned is in the Purchase UOM (e.g. "1 box"), same as it
			# was recorded on the original Purchase Receipt - stock itself is
			# tracked in the Stock UOM, so the actual ledger impact has to go
			# through the same conversion the receipt applied, not the raw
			# Purchase UOM quantity.
			row.stock_qty = flt(row.qty_returned) * flt(row.conversion_factor or 1)
			total += row.amount
		self.total_credit_amount = total

	def on_submit(self):
		for row in self.items:
			validate_sufficient_stock(row.item, self.from_warehouse, row.stock_qty)
			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.from_warehouse,
				batch_no=row.batch,
				posting_datetime=self.return_date_time,
				voucher_type="Purchase Return",
				voucher_no=self.name,
				qty_change=-row.stock_qty,
			)
		self.db_set("status", "Submitted", update_modified=False)

	def on_cancel(self):
		reverse_stock_ledger_entries("Purchase Return", self.name)
		self.db_set("status", "Cancelled", update_modified=False)

	@frappe.whitelist()
	def mark_credit_received(self):
		if self.docstatus != 1:
			frappe.throw(_("Only a submitted Purchase Return can have credit marked as received."))
		self.db_set("status", "Credit Received", update_modified=False)

	@frappe.whitelist()
	def mark_replacement_sent(self):
		# A supplier resolves a return one of two ways - credit back, or send
		# replacement stock instead. This starts the second path; the actual
		# "received" transition only happens once a Purchase Receipt linked
		# back to this return is submitted (see get_replacement_receipt_details).
		if self.status != "Submitted":
			frappe.throw(_("Only a Submitted Purchase Return can be marked as awaiting a replacement."))
		self.db_set("status", "Replacement Pending", update_modified=False)


def update_status_on_replacement_receipt(purchase_return_name, received):
	# Called by Purchase Receipt on submit/cancel of a receipt that names this
	# Purchase Return as what it's replacing.
	status = "Replacement Received" if received else "Replacement Pending"
	frappe.db.set_value("Purchase Return", purchase_return_name, "status", status)


@frappe.whitelist()
def get_existing_return_for_quality_inspection(quality_inspection):
	# One Quality Inspection should only ever produce one Purchase Return -
	# without this check, re-clicking "Create Purchase Return" would keep
	# generating duplicates for the same already-returned rejected qty.
	frappe.has_permission("Purchase Return", "read", throw=True)
	if not quality_inspection:
		return None
	return frappe.db.get_value(
		"Purchase Return", {"quality_inspection": quality_inspection, "docstatus": ["!=", 2]}, "name"
	)


@frappe.whitelist()
def get_rate_for_item(against_purchase_receipt, item):
	# The Rate being credited back is what was actually paid for it - that
	# lives on the original Purchase Order, not the Purchase Receipt itself
	# (which only ever records physical qty/batch, never a price).
	frappe.has_permission("Purchase Return", "read", throw=True)
	if not (against_purchase_receipt and item):
		return 0
	purchase_order = frappe.db.get_value("Purchase Receipt", against_purchase_receipt, "purchase_order")
	if not purchase_order:
		return 0
	return frappe.db.get_value("Purchase Order Item", {"parent": purchase_order, "item": item}, "rate") or 0


@frappe.whitelist()
def get_uom_details_for_item(against_purchase_receipt, item):
	# Qty Returned is entered in the same Purchase UOM the item was received
	# in - the exact conversion factor used back then lives on that Purchase
	# Receipt Item row, so reusing it here (rather than re-deriving it) keeps
	# the return's stock impact consistent with what the receipt recorded.
	frappe.has_permission("Purchase Return", "read", throw=True)
	if not (against_purchase_receipt and item):
		return {"unit_of_measure": "", "conversion_factor": 1}
	row = frappe.db.get_value(
		"Purchase Receipt Item",
		{"parent": against_purchase_receipt, "item": item},
		["unit_of_measure", "conversion_factor"],
		as_dict=True,
	)
	if not row:
		return {"unit_of_measure": "", "conversion_factor": 1}
	return {"unit_of_measure": row.unit_of_measure or "", "conversion_factor": flt(row.conversion_factor) or 1}


@frappe.whitelist()
def get_return_details_from_quality_inspection(quality_inspection):
	# Only the quantity that actually failed inspection should go back to the
	# supplier - not the full delivered amount - so this pulls qty_rejected
	# per row, never qty_delivered/qty_accepted.
	frappe.has_permission("Purchase Return", "read", throw=True)
	qi = frappe.get_doc("Quality Inspection", quality_inspection)
	pr = frappe.get_doc("Purchase Receipt", qi.purchase_receipt)

	items = []
	for row in qi.items:
		# What matters is whether there's a rejected quantity to send back -
		# not the Result dropdown, since a row can have some units rejected
		# while the batch overall is still marked Accepted.
		if not flt(row.qty_rejected):
			continue
		rate = get_rate_for_item(qi.purchase_receipt, row.item)
		uom_details = get_uom_details_for_item(qi.purchase_receipt, row.item)
		conversion_factor = uom_details["conversion_factor"]
		items.append(
			{
				"item": row.item,
				"item_name": frappe.db.get_value("Item", row.item, "item_name") or "",
				"batch": f"{row.item}-{row.batch_no}",
				"qty_returned": row.qty_rejected,
				"unit_of_measure": uom_details["unit_of_measure"],
				"conversion_factor": conversion_factor,
				"stock_qty": flt(row.qty_rejected) * conversion_factor,
				"rate": rate,
				"amount": flt(row.qty_rejected) * flt(rate),
				"return_reason": QUALITY_INSPECTION_TO_RETURN_REASON.get(row.rejection_reason, ""),
			}
		)

	return {
		"supplier": pr.supplier,
		"against_purchase_receipt": pr.name,
		"from_warehouse": pr.receiving_warehouse,
		"items": items,
	}


@frappe.whitelist()
def get_replacement_receipt_details(purchase_return):
	# The replacement goes back into the same warehouse it was returned from,
	# and against the same Purchase Order if one is known via the original
	# receipt. Item and expected Qty are known in advance (the supplier is
	# replacing exactly what was sent back) so those are prefilled too - but
	# Batch No/Expiry Date are left blank, since the replacement is very
	# likely a different batch to the one that was returned.
	frappe.has_permission("Purchase Return", "read", throw=True)
	pret = frappe.get_doc("Purchase Return", purchase_return)
	purchase_order = None
	if pret.against_purchase_receipt:
		purchase_order = frappe.db.get_value(
			"Purchase Receipt", pret.against_purchase_receipt, "purchase_order"
		)

	items = []
	for row in pret.items:
		# The original Purchase Order Item always has this filled in (it's
		# mandatory there) - Item.purchase_uom isn't reliably set on every
		# item, so falling back to it directly left this blank.
		unit_of_measure = ""
		if purchase_order:
			unit_of_measure = (
				frappe.db.get_value(
					"Purchase Order Item", {"parent": purchase_order, "item": row.item}, "unit_of_measure"
				)
				or ""
			)
		if not unit_of_measure:
			unit_of_measure = frappe.db.get_value("Item", row.item, "purchase_uom") or ""
		conversion_factor = (
			frappe.db.get_value(
				"Item UOM Conversion", {"parent": row.item, "uom": unit_of_measure}, "conversion_factor"
			)
			or 1
		)
		items.append(
			{
				"item": row.item,
				"item_name": frappe.db.get_value("Item", row.item, "item_name") or "",
				"unit_of_measure": unit_of_measure,
				"qty_received": row.qty_returned,
				"conversion_factor": conversion_factor,
			}
		)

	return {
		"supplier": pret.supplier,
		"purchase_order": purchase_order,
		"receiving_warehouse": pret.from_warehouse,
		"replacement_for": pret.name,
		"items": items,
	}
