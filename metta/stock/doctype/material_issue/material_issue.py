# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_stock,
)


class MaterialIssue(Document):
	def on_submit(self):
		for row in self.items:
			validate_sufficient_stock(row.item, self.warehouse, row.qty)
			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.warehouse,
				batch_no=row.batch_no,
				posting_datetime=self.issue_date_time,
				voucher_type="Material Issue",
				voucher_no=self.name,
				qty_change=-row.qty,
			)

	def on_cancel(self):
		reverse_stock_ledger_entries("Material Issue", self.name)
