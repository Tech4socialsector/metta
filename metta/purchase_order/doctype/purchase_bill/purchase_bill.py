# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, flt


class PurchaseBill(Document):
	def validate(self):
		# JS keeps this live while editing, but validate() is the authoritative
		# recompute, same as Purchase Order's amount/total_amount.
		subtotal = 0
		gst_total = 0
		for row in self.items:
			row.amount = flt(row.qty) * flt(row.rate)
			row.gst_amount = row.amount * flt(row.gst_percent) / 100
			subtotal += row.amount
			gst_total += row.gst_amount
		self.subtotal = subtotal
		self.gst_amount = gst_total
		self.total_amount = subtotal + gst_total + flt(self.other_tax_amount)

		if self.supplier_invoice_date and self.payment_terms_days:
			self.due_date = add_days(self.supplier_invoice_date, int(self.payment_terms_days))

		self.balance_due = flt(self.total_amount) - flt(self.amount_paid)
		if flt(self.amount_paid) <= 0:
			self.payment_status = "Unpaid"
		elif flt(self.amount_paid) < flt(self.total_amount):
			self.payment_status = "Partially Paid"
		else:
			self.payment_status = "Paid"


def update_amount_paid(purchase_bill_name, delta):
	# Payment Entry calls this on submit/cancel instead of going through a
	# normal .save() - the bill may already be Submitted by the time a
	# payment is made against it, so this writes the three affected fields
	# directly rather than re-running the whole submitted-doc save pipeline.
	bill = frappe.get_doc("Purchase Bill", purchase_bill_name)
	new_amount_paid = flt(bill.amount_paid) + flt(delta)
	balance_due = flt(bill.total_amount) - new_amount_paid

	if new_amount_paid <= 0:
		status = "Unpaid"
	elif new_amount_paid < flt(bill.total_amount):
		status = "Partially Paid"
	else:
		status = "Paid"

	bill.db_set("amount_paid", new_amount_paid, update_modified=False)
	bill.db_set("balance_due", balance_due, update_modified=False)
	bill.db_set("payment_status", status, update_modified=False)


@frappe.whitelist()
def get_items_from_receipt(purchase_receipt):
	# Qty to bill comes from what was actually received (Purchase Receipt),
	# but Rate comes from the Purchase Order - Purchase Receipt never records
	# a price, only the physical quantity/batch/expiry.
	# Rows returned here are already fully computed (amount, gst_amount) -
	# bulk-adding rows via frm.add_child skips the field-change events that
	# would normally trigger those calculations client-side, the same issue
	# already hit on Purchase Order/Purchase Receipt's own fetch_from fields.
	pr = frappe.get_doc("Purchase Receipt", purchase_receipt)
	rows = []
	for pr_row in pr.items:
		rate = 0
		if pr.purchase_order:
			rate = (
				frappe.db.get_value(
					"Purchase Order Item", {"parent": pr.purchase_order, "item": pr_row.item}, "rate"
				)
				or 0
			)
		gst_percent = frappe.db.get_value("Medicine Item", pr_row.item, "gst_percent") or 0
		qty = flt(pr_row.qty_received)
		amount = qty * flt(rate)
		rows.append(
			{
				"item": pr_row.item,
				"qty": qty,
				"rate": rate,
				"amount": amount,
				"gst_percent": gst_percent,
				"gst_amount": amount * flt(gst_percent) / 100,
			}
		)
	return rows
