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


class StockReconciliation(Document):
	def on_submit(self):
		# System Qty/Difference are recomputed here from the live Stock
		# Balance rather than trusting whatever the client last showed - stock
		# can move between opening this form and submitting it.
		for row in self.items:
			system_qty = get_current_stock_qty(row.item, self.warehouse)
			difference = flt(row.physical_qty) - system_qty
			row.db_set("system_qty", system_qty, update_modified=False)
			row.db_set("difference", difference, update_modified=False)

			if difference and not row.reason:
				# mandatory_depends_on only blocks Save in the browser, not the
				# server - so this has to be checked explicitly here too.
				frappe.throw(
					_("Row #{0}: Reason is mandatory when Physical Qty differs from System Qty.").format(
						row.idx
					)
				)

			if difference:
				create_stock_ledger_entry(
					item=row.item,
					warehouse=self.warehouse,
					batch_no=row.batch_no,
					posting_datetime=self.reconciliation_date,
					voucher_type="Stock Reconciliation",
					voucher_no=self.name,
					qty_change=difference,
				)
		self.db_set("status", "Submitted", update_modified=False)

	def on_cancel(self):
		reverse_stock_ledger_entries("Stock Reconciliation", self.name)
		self.db_set("status", "Cancelled", update_modified=False)


@frappe.whitelist()
def get_current_stock_qty(item, warehouse):
	from metta.stock.doctype.stock_balance.stock_balance import get_or_create_stock_balance

	return flt(get_or_create_stock_balance(item, warehouse).actual_qty)


@frappe.whitelist()
def get_batches_for_item(item):
	# A Batch belongs to exactly one Item (its name is literally "{item}-{batch_no}"),
	# so a row counting a different item's batch by mistake is always a data error,
	# not a legitimate case - the Batch field is restricted to this list client-side.
	if not item:
		return []
	return frappe.get_all("Batch", filters={"item": item, "disabled": 0}, pluck="name")
