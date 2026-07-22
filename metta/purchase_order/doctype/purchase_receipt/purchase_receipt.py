# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

from metta.purchase_order.doctype.purchase_order.purchase_order import refresh_receiving_status
from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
)


class PurchaseReceipt(Document):
	def on_submit(self):
		for row in self.items:
			batch_name = self.get_or_create_batch(row)
			row.stock_qty = flt(row.qty_received) * flt(row.conversion_factor or 1)
			row.db_set("stock_qty", row.stock_qty, update_modified=False)

			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.receiving_warehouse,
				batch_no=batch_name,
				posting_datetime=self.receipt_date_time,
				voucher_type="Purchase Receipt",
				voucher_no=self.name,
				qty_change=row.stock_qty,
			)

			self.update_purchase_order_qty_received(row)
		if self.purchase_order:
			refresh_receiving_status(self.purchase_order)

	def on_cancel(self):
		reverse_stock_ledger_entries("Purchase Receipt", self.name)
		for row in self.items:
			self.update_purchase_order_qty_received(row, reverse=True)
		if self.purchase_order:
			refresh_receiving_status(self.purchase_order)

	def get_or_create_batch(self, row):
		# Purchase Receipt is where a Batch first has a reason to exist - if
		# it wasn't already created by hand (e.g. from Quality Inspection),
		# create it now rather than blocking receipt of real, physical stock.
		# Supplier and Source Purchase Receipt trace the batch back to this
		# specific delivery, so they must be set here - Batch has no other
		# way to learn them.
		batch_name = f"{row.item}-{row.batch_no}"
		if not frappe.db.exists("Batch", batch_name):
			frappe.get_doc(
				{
					"doctype": "Batch",
					"batch_no": row.batch_no,
					"item": row.item,
					"manufacturing_date": row.manufacturing_date,
					"expiry_date": row.expiry_date,
					"supplier": self.supplier,
					"purchase_receipt": self.name,
				}
			).insert(ignore_permissions=True)
		return batch_name

	def update_purchase_order_qty_received(self, row, reverse=False):
		if not self.purchase_order:
			return
		po_item = frappe.db.get_value(
			"Purchase Order Item", {"parent": self.purchase_order, "item": row.item}, ["name", "qty_received"]
		)
		if not po_item:
			return
		po_item_name, current_qty_received = po_item
		delta = -flt(row.qty_received) if reverse else flt(row.qty_received)
		frappe.db.set_value(
			"Purchase Order Item", po_item_name, "qty_received", flt(current_qty_received) + delta
		)


@frappe.whitelist()
def get_pending_items(purchase_order):
	# Only what's still outstanding is worth pulling in - if part of the order
	# was already received on an earlier Purchase Receipt, that portion must
	# not be offered again here.
	po = frappe.get_doc("Purchase Order", purchase_order)
	rows = []
	for po_row in po.items:
		pending_qty = flt(po_row.qty_ordered) - flt(po_row.qty_received)
		if pending_qty <= 0:
			continue
		conversion_factor = (
			frappe.db.get_value(
				"Item UOM Conversion",
				{"parent": po_row.item, "uom": po_row.unit_of_measure},
				"conversion_factor",
			)
			or 1
		)
		rows.append(
			{
				"item": po_row.item,
				"unit_of_measure": po_row.unit_of_measure,
				"qty_received": pending_qty,
				"conversion_factor": conversion_factor,
			}
		)
	return rows


@frappe.whitelist()
def find_matching_quality_inspection(purchase_order, item, batch_no):
	# A Quality Inspection is keyed by the same (Purchase Order, Item, Batch)
	# as the receipt row it belongs to - so it can be found automatically
	# instead of making the store staff hunt for it in a dropdown. The field
	# is read_only, so this is the only thing that ever sets it.
	if not (purchase_order and item and batch_no):
		return None
	return frappe.db.get_value(
		"Quality Inspection",
		{
			"purchase_order": purchase_order,
			"item": item,
			"batch_no": batch_no,
			"docstatus": 1,
		},
		["name", "result"],
		as_dict=True,
	)
