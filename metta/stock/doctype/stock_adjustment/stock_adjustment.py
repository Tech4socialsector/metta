# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import flt

from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_stock,
)


class StockAdjustment(Document):
	def on_submit(self):
		# Every Reason option (Breakage, Expired, Spillage, Contamination,
		# Other) is stock being written off, never found - so qty always
		# reduces the balance regardless of the sign the user typed.
		qty = abs(flt(self.qty))
		validate_sufficient_stock(self.item, self.warehouse, qty)
		create_stock_ledger_entry(
			item=self.item,
			warehouse=self.warehouse,
			batch_no=self.batch_no,
			posting_datetime=self.adjustment_date_time,
			voucher_type="Stock Adjustment",
			voucher_no=self.name,
			qty_change=-qty,
		)

	def on_cancel(self):
		reverse_stock_ledger_entries("Stock Adjustment", self.name)
