# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, now_datetime, today

# Statuses reached only after Approved - a Purchase Receipt can move the
# order forward through these, but must never touch a Rejected/Cancelled/
# Closed order or one still waiting on approval.
RECEIVING_STATUSES = ("Approved", "Sent to Dealer", "Partially Received", "Received")


class PurchaseOrder(Document):
	def validate(self):
		# JS keeps this live while editing, but validate() is the authoritative
		# recompute so amount/total_amount are always correct even if the doc
		# is saved via the API or the client script didn't run.
		total = 0
		for row in self.items:
			row.amount = flt(row.qty_ordered) * flt(row.rate)
			total += row.amount
		self.total_amount = total
		self.validate_expected_delivery()

	def validate_expected_delivery(self):
		# A delivery date that's already passed (or is today) isn't a real
		# future commitment from the supplier. The client blocks this the
		# moment it's picked, but that's only a convenience - this is the
		# check an API call or import can't bypass.
		if self.expected_delivery and getdate(self.expected_delivery) <= getdate(today()):
			frappe.throw(
				_("Expected Delivery must be a date after today."),
				title=_("Invalid Expected Delivery Date"),
			)

	def on_submit(self):
		# Status is fully code-driven from here on - nobody types it in, it
		# only ever moves forward through Approve/Reject/Mark Sent/receiving.
		self.db_set("status", "Pending Approval", update_modified=False)

	def on_cancel(self):
		self.db_set("status", "Cancelled", update_modified=False)

	@frappe.whitelist()
	def approve_order(self):
		if self.status != "Pending Approval":
			frappe.throw(_("Only an order Pending Approval can be approved."))
		self.db_set("status", "Approved", update_modified=False)
		self.db_set("approved_by", frappe.session.user, update_modified=False)
		self.db_set("approved_date_time", now_datetime(), update_modified=False)

	@frappe.whitelist()
	def reject_order(self, reason):
		if self.status != "Pending Approval":
			frappe.throw(_("Only an order Pending Approval can be rejected."))
		if not reason:
			frappe.throw(_("Rejection Reason is mandatory to reject an order."))
		self.db_set("status", "Rejected", update_modified=False)
		self.db_set("rejection_reason", reason, update_modified=False)
		self.db_set("approved_by", frappe.session.user, update_modified=False)
		self.db_set("approved_date_time", now_datetime(), update_modified=False)

	@frappe.whitelist()
	def mark_sent_to_dealer(self):
		if self.status != "Approved":
			frappe.throw(_("Only an Approved order can be marked as Sent to Dealer."))
		self.db_set("status", "Sent to Dealer", update_modified=False)

	@frappe.whitelist()
	def close_order(self):
		if self.status != "Received":
			frappe.throw(_("Only a fully Received order can be closed."))
		self.db_set("status", "Closed", update_modified=False)


def refresh_receiving_status(purchase_order_name):
	# Called by Purchase Receipt after it updates qty_received, so the order's
	# status always reflects reality without anyone touching it by hand.
	po = frappe.get_doc("Purchase Order", purchase_order_name)
	if po.status not in RECEIVING_STATUSES:
		return

	total_ordered = sum(flt(row.qty_ordered) for row in po.items)
	total_received = sum(flt(row.qty_received) for row in po.items)

	if total_received <= 0:
		# Nothing received (yet, or reversed back to nothing) - leave "Approved"/
		# "Sent to Dealer" as-is rather than guessing which one applies.
		return
	new_status = "Received" if total_received >= total_ordered else "Partially Received"

	if new_status != po.status:
		po.db_set("status", new_status, update_modified=False)
