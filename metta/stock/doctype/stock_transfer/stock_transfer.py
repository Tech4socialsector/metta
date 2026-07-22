# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime

from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_stock,
)


class StockTransfer(Document):
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
		self.db_set("status", "Dispatched", update_modified=False)

	def on_cancel(self):
		reverse_stock_ledger_entries("Stock Transfer", self.name)
		self.db_set("status", "Cancelled", update_modified=False)

	@frappe.whitelist()
	def confirm_receipt(self):
		if self.docstatus != 1:
			frappe.throw(_("Only a dispatched Stock Transfer can be confirmed."))
		if self.status == "Confirmed":
			frappe.throw(_("This Stock Transfer has already been confirmed."))

		has_discrepancy = False
		for row in self.items:
			# Qty Confirmed defaults to Qty Dispatched when the receiving side
			# doesn't change it - only what's actually confirmed enters the
			# destination's stock, so a short delivery doesn't get overcounted.
			qty_confirmed = flt(row.qty_confirmed) if row.qty_confirmed else flt(row.qty_dispatched)
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
