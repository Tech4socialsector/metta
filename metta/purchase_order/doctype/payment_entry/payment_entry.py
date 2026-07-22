# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.purchase_order.doctype.purchase_bill.purchase_bill import update_amount_paid


class PaymentEntry(Document):
	def validate(self):
		if not self.purchase_bill:
			return
		balance_due = frappe.db.get_value("Purchase Bill", self.purchase_bill, "balance_due")
		if flt(self.amount_paid) > flt(balance_due):
			frappe.throw(
				_("Amount Paid ({0}) cannot exceed the Balance Due ({1}) on {2}.").format(
					self.amount_paid, balance_due, self.purchase_bill
				)
			)

	def on_submit(self):
		update_amount_paid(self.purchase_bill, self.amount_paid)

	def on_cancel(self):
		update_amount_paid(self.purchase_bill, -flt(self.amount_paid))
