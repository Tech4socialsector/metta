# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime

from metta.purchase_order.doctype.purchase_receipt.purchase_receipt import get_latest_batch_for_item
from metta.purchase_request.doctype.stock_indent.stock_indent import refresh_issuing_status
from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_stock,
)


class StockTransfer(Document):
	def validate(self):
		if self.from_warehouse and self.to_warehouse and self.from_warehouse == self.to_warehouse:
			frappe.throw(_("From Warehouse and To Warehouse cannot be the same."))

	def on_submit(self):
		# A transfer is a two-step physical event: stock leaves the source
		# warehouse the moment it's dispatched, but only reaches the
		# destination once someone there confirms receipt (see confirm_receipt).
		# So submit only records the dispatch-out side.
		for row in self.items:
			validate_sufficient_stock(row.item, self.from_warehouse, row.qty_dispatched)
			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.from_warehouse,
				batch_no=row.batch,
				posting_datetime=self.dispatch_date_time,
				voucher_type="Stock Transfer",
				voucher_no=self.name,
				qty_change=-flt(row.qty_dispatched),
			)
			self.update_stock_indent_qty_issued(row)
		if self.against_indent:
			refresh_issuing_status(self.against_indent)
		self.db_set("status", "Dispatched", update_modified=False)

	def on_cancel(self):
		reverse_stock_ledger_entries("Stock Transfer", self.name)
		for row in self.items:
			self.update_stock_indent_qty_issued(row, reverse=True)
		if self.against_indent:
			refresh_issuing_status(self.against_indent)
		self.db_set("status", "Cancelled", update_modified=False)

	def update_stock_indent_qty_issued(self, row, reverse=False):
		if not self.against_indent:
			return
		indent_item = frappe.db.get_value(
			"Stock Indent Item",
			{"parent": self.against_indent, "item": row.item},
			["name", "qty_requested", "qty_issued"],
			as_dict=True,
		)
		if not indent_item:
			return
		delta = -flt(row.qty_dispatched) if reverse else flt(row.qty_dispatched)
		new_qty_issued = flt(indent_item.qty_issued) + delta
		frappe.db.set_value(
			"Stock Indent Item",
			indent_item.name,
			{
				"qty_issued": new_qty_issued,
				"qty_pending": flt(indent_item.qty_requested) - new_qty_issued,
			},
		)

	@frappe.whitelist()
	def confirm_receipt(self):
		if self.docstatus != 1:
			frappe.throw(_("Only a dispatched Stock Transfer can be confirmed."))
		if self.status == "Confirmed":
			frappe.throw(_("This Stock Transfer has already been confirmed."))

		has_discrepancy = False
		for row in self.items:
			# qty_confirmed is defaulted to qty_dispatched by the JS the moment
			# a row is added (see stock_transfer.js), so it always carries a
			# real value by the time this runs - a genuine total loss can be
			# recorded as an explicit 0 here without being confused with "not
			# yet set" (0 and "unset" are indistinguishable for a Float field).
			qty_confirmed = flt(row.qty_confirmed)
			# The destination can never receive more than what actually left
			# the source - anything above qty_dispatched would create stock
			# out of nowhere.
			if qty_confirmed > flt(row.qty_dispatched):
				frappe.throw(
					_("Row {0}: Qty Confirmed ({1}) cannot exceed Qty Dispatched ({2}).").format(
						row.idx, qty_confirmed, row.qty_dispatched
					)
				)
			row.db_set("qty_confirmed", qty_confirmed, update_modified=False)
			if qty_confirmed != flt(row.qty_dispatched):
				has_discrepancy = True

			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.to_warehouse,
				batch_no=row.batch,
				posting_datetime=now_datetime(),
				voucher_type="Stock Transfer",
				voucher_no=self.name,
				qty_change=qty_confirmed,
			)

		self.db_set("confirmation_date_time", now_datetime(), update_modified=False)
		self.db_set("confirmed_by", frappe.session.user, update_modified=False)
		self.db_set("status", "Confirmed", update_modified=False)
		if has_discrepancy:
			self.db_set("has_discrepancy", 1, update_modified=False)
			self.db_set("discrepancy_status", "Pending Review", update_modified=False)

	@frappe.whitelist()
	def resolve_discrepancy(self, resolution):
		if not self.has_discrepancy or self.discrepancy_status != "Pending Review":
			frappe.throw(_("There is no pending discrepancy to resolve on this Stock Transfer."))
		if resolution not in ("Written Off", "Reissued"):
			frappe.throw(_("Resolution must be either Written Off or Reissued."))

		self.db_set("discrepancy_status", resolution, update_modified=False)
		self.db_set("resolved_by", frappe.session.user, update_modified=False)
		self.db_set("resolution_date", frappe.utils.today(), update_modified=False)


@frappe.whitelist()
def get_return_transfer_details(stock_transfer):
	# A "return" isn't a special document - it's just a normal Stock Transfer
	# in the opposite direction, using whatever was actually confirmed as
	# received (not what was originally dispatched, in case a discrepancy
	# meant less arrived). The suggested destination is where it came from,
	# but that's an ordinary editable field - it can just as easily go
	# onward to a different warehouse instead of back to the source.
	original = frappe.get_doc("Stock Transfer", stock_transfer)
	if original.status != "Confirmed":
		frappe.throw(_("Only a Confirmed Stock Transfer has stock on hand to return."))

	items = []
	for row in original.items:
		qty = flt(row.qty_confirmed)
		if qty <= 0:
			continue
		items.append(
			{
				"item": row.item,
				"item_name": row.item_name,
				"batch": row.batch,
				"qty_dispatched": qty,
				"qty_confirmed": qty,
				"unit_of_measure": row.unit_of_measure,
			}
		)

	return {
		"from_warehouse": original.to_warehouse,
		"to_warehouse": original.from_warehouse,
		"against_transfer": original.name,
		"items": items,
	}


@frappe.whitelist()
def get_pending_items_for_transfer(stock_indent):
	# Only what's still outstanding is worth pulling in - if part of the
	# indent was already fulfilled by an earlier Stock Transfer, that portion
	# must not be offered again here.
	indent = frappe.get_doc("Stock Indent", stock_indent)
	rows = []
	for indent_row in indent.items:
		pending_qty = flt(indent_row.qty_requested) - flt(indent_row.qty_issued)
		if pending_qty <= 0:
			continue
		unit_of_measure = frappe.db.get_value("Item", indent_row.item, "stock_uom") or ""
		# Rows added by this button skip the Item field's own change event
		# (they're inserted directly, not picked by hand), so the batch
		# auto-fetch that runs on a manual pick never fires here - fetched
		# explicitly instead, reusing the same lookup either way.
		batch = get_latest_batch_for_item(indent_row.item)
		rows.append(
			{
				"item": indent_row.item,
				"item_name": indent_row.item_name or frappe.db.get_value("Item", indent_row.item, "item_name") or "",
				"batch": batch.name if batch else "",
				"qty_requested": indent_row.qty_requested,
				"qty_dispatched": pending_qty,
				# Confirmed defaults alongside Dispatched, same as a manually
				# added row - see the JS qty_dispatched trigger for why.
				"qty_confirmed": pending_qty,
				"unit_of_measure": unit_of_measure,
				# The Indent's own name, not the internal child-row ID - that
				# hash means nothing to a person reading the grid.
				"indent_row_reference": stock_indent,
			}
		)
	return rows
