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


class SalesBill(Document):
	def validate(self):
		# mandatory_depends_on only blocks the Save button in the browser -
		# it isn't checked by Frappe's server-side mandatory-field validation,
		# so API calls/imports could skip this without a check here.
		if self.payment_mode == "Credit - Corporate" and not self.corporate_customer:
			frappe.throw(
				_("Corporate Customer is mandatory when Payment Mode is Credit - Corporate."),
				title=_("Corporate Customer Required"),
			)

		# JS keeps this live while editing, but validate() is the authoritative
		# recompute, same as Purchase Bill's subtotal/gst/total.
		discount_percent = flt(self.discount_percent)
		subtotal = 0
		gst_total = 0
		for row in self.items:
			row.amount = flt(row.qty) * flt(row.rate)
			taxable_value = row.amount * (1 - discount_percent / 100)
			row.gst_amount = taxable_value * flt(row.gst_percent) / 100
			subtotal += row.amount
			gst_total += row.gst_amount
		self.subtotal = subtotal
		self.discount_amount = subtotal * discount_percent / 100
		self.gst_amount = gst_total
		self.net_amount = subtotal - self.discount_amount + gst_total

	def on_submit(self):
		for row in self.items:
			row.stock_qty = flt(row.qty) * flt(row.conversion_factor or 1)
			row.db_set("stock_qty", row.stock_qty, update_modified=False)
			validate_sufficient_stock(row.item, self.warehouse, row.stock_qty)

			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.warehouse,
				batch_no=row.batch_no,
				posting_datetime=self.sale_datetime,
				voucher_type="Sales Bill",
				voucher_no=self.name,
				qty_change=-row.stock_qty,
			)

	def on_cancel(self):
		reverse_stock_ledger_entries("Sales Bill", self.name)
