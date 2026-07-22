# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_stock,
)


class PurchaseReturn(Document):
	def on_submit(self):
		for row in self.items:
			validate_sufficient_stock(row.item, self.from_warehouse, row.qty_returned)
			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.from_warehouse,
				batch_no=row.batch,
				posting_datetime=self.return_date_time,
				voucher_type="Purchase Return",
				voucher_no=self.name,
				qty_change=-row.qty_returned,
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
