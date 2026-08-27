# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
)

# Only these reasons mean the medicine is still sealed/unused and safe to
# re-enter dispensable stock. Any other reason (allergy, damage, contamination)
# is disposal-only - the return is still recorded for audit purposes, but
# nothing goes back into stock, since it was already in a patient's possession.
RESTOCK_ELIGIBLE_REASONS = {"Not Required", "Discontinued by Doctor", "Excess Dispensed"}


class SalesReturn(Document):
	def validate(self):
		# Without a real source document behind it, a return has no proof the
		# item was ever actually dispensed to this patient - anyone could
		# otherwise submit a fabricated return and add unverified qty to stock.
		if not (self.against_sales_bill or self.against_material_issue):
			frappe.throw(
				_("Please link either Against Billing or Against Material Issue - a return needs a source document."),
				title=_("Source Document Required"),
			)

		# JS keeps this live while editing, but validate() is the authoritative
		# recompute, same as every other total in this app.
		total = 0
		for row in self.items:
			row.amount = flt(row.qty_returned) * flt(row.rate)
			total += row.amount
		self.total_value = total

	def before_update_after_submit(self):
		# Only a post-submit save can possibly be reverting an already-received
		# return (nothing's been restocked yet before first submit) - checked
		# here specifically because validate() is never called on this save
		# path, only before_update_after_submit is.
		if not self.has_value_changed("is_received"):
			return
		previous = frappe.db.get_value("Sales Return", self.name, "is_received")
		if previous and not self.is_received:
			frappe.throw(
				_("\"Item Physically Received\" cannot be unchecked once it has been marked received."),
				title=_("Not Allowed"),
			)

	def on_submit(self):
		if self.is_received:
			self.restock_items()
		self.db_set("status", "Submitted", update_modified=False)

	def on_update_after_submit(self):
		# Covers the case where this was submitted while NOT yet received
		# (logged over the phone, say) and someone now confirms the item has
		# actually been handed back at the counter - stock only goes back in
		# at that point, not when it was first logged.
		if not self.has_value_changed("is_received") or not self.is_received:
			return
		self.restock_items()

	def restock_items(self):
		for row in self.items:
			# Disposal-only reasons deliberately create no ledger entry - the
			# quantity was already deducted from stock when originally
			# dispensed, and it isn't safe to add back, so it just stays gone.
			if row.return_reason not in RESTOCK_ELIGIBLE_REASONS:
				continue
			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.to_warehouse,
				batch_no=row.batch,
				posting_datetime=self.return_date_time,
				voucher_type="Sales Return",
				voucher_no=self.name,
				qty_change=flt(row.qty_returned),
			)

	def on_cancel(self):
		reverse_stock_ledger_entries("Sales Return", self.name)
		self.db_set("status", "Cancelled", update_modified=False)
