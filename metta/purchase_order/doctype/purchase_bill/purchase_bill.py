# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, flt, now_datetime

from metta.master.doctype.item.item import record_purchase_price_history
from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
)


class PurchaseBill(Document):
	def validate(self):
		# JS keeps this live while editing, but validate() is the authoritative
		# recompute, same as Purchase Order's amount/total_amount.
		if not self.entered_by:
			# Set once, on first save - never overwritten afterwards, same as
			# "who created this" shouldn't change on a later edit by someone else.
			self.entered_by = frappe.session.user

		subtotal = 0
		discount_total = 0
		gst_total = 0
		for row in self.items:
			row.qty = flt(row.packing) * flt(row.no_of_unit)

			# P Rate is entered per single tablet/unit directly (not per
			# strip) - Free strips are converted to tablets so they can be
			# netted out of Qty in the same units.
			free_qty = flt(row.free) * flt(row.packing)
			billable_qty = flt(row.qty) - free_qty
			row.amount = billable_qty * flt(row.purchase_rate)

			# GST is calculated on the Amount net of Discount, same as the
			# supplier invoice - Amount itself still shows the full gross
			# value (matches the invoice's own Taxable Amount column), but the
			# tax is worked out on what's actually being paid for it.
			taxable_value = row.amount - flt(row.discount)
			row.gst_amount = taxable_value * flt(row.gst_percent) / 100
			row.cgst_rate = flt(row.gst_percent) / 2
			row.sgst_rate = flt(row.gst_percent) / 2
			row.cgst_amount = row.gst_amount / 2
			row.sgst_amount = row.gst_amount / 2
			# IGST isn't wired up yet (inter-state purchases, add later) - kept
			# at 0 so Total Amount's formula already accounts for it once it is.
			row.igst_amount = flt(row.igst_amount)
			row.total_amount = taxable_value + row.cgst_amount + row.sgst_amount + row.igst_amount

			# Landed cost per tablet/unit, net of discount, including GST -
			# same net taxable value the row's own GST was just computed on,
			# divided back out to a per-unit figure.
			discount_per_unit = flt(row.discount) / flt(row.qty) if row.qty else 0
			net_rate = flt(row.purchase_rate) - discount_per_unit
			row.purchase_cost = net_rate * (1 + flt(row.gst_percent) / 100)

			subtotal += row.amount
			discount_total += flt(row.discount)
			gst_total += row.gst_amount

			# Selling side - what the hospital will charge the patient per
			# tablet/unit, computed here so Selling Rate never has to be typed
			# a second time on the Item itself (see approve_bill()). Selling
			# GST % always mirrors GST % above - entered once, never typed twice.
			row.selling_gst_percent = flt(row.gst_percent)
			row.packing_mrp = flt(row.mrp) * flt(row.packing)
			row.single_tablet_price = flt(row.mrp)
			row.selling_gst_amount = row.single_tablet_price * flt(row.selling_gst_percent) / 100
			row.selling_cgst_amount = row.selling_gst_amount / 2
			row.selling_sgst_amount = row.selling_gst_amount / 2
			row.final_selling_price = row.single_tablet_price + row.selling_gst_amount

		self.subtotal = subtotal
		self.discount = discount_total
		self.gst_amount = gst_total

		net_before_round = (
			subtotal - discount_total + flt(self.tax_on_free) + gst_total
		)
		self.round_off = round(net_before_round) - net_before_round
		self.total_amount = net_before_round + self.round_off

		if self.supplier_invoice_date and self.payment_terms_days:
			self.due_date = add_days(self.supplier_invoice_date, int(self.payment_terms_days))

		self.balance_due = flt(self.total_amount) - flt(self.amount_paid)
		if flt(self.amount_paid) <= 0:
			self.payment_status = "Unpaid"
		elif flt(self.amount_paid) < flt(self.total_amount):
			self.payment_status = "Partially Paid"
		else:
			self.payment_status = "Paid"

	def before_update_after_submit(self):
		# Frappe calls this instead of validate() when saving an already-
		# submitted document, so without it a correction made after submit
		# (e.g. fixing a wrong GST %) would leave the GST/discount/subtotal/
		# total fields stale instead of recomputing them.
		self.validate()

	def on_submit(self):
		# Status is code-driven from here, same as Purchase Order - stock isn't
		# added yet at this point, only once a second person approves it below.
		self.db_set("status", "Pending Approval", update_modified=False)

	def on_update(self):
		self.refresh_purchase_receipt_link()

	def on_cancel(self):
		# Only an Approved bill ever added stock - Pending/Rejected never did,
		# so there's nothing to reverse for those.
		if self.status == "Approved":
			reverse_stock_ledger_entries("Purchase Bill", self.name)
		self.refresh_purchase_receipt_link()

	def on_trash(self):
		self.refresh_purchase_receipt_link()

	@frappe.whitelist()
	def approve_bill(self):
		validate_can_approve()
		if self.status != "Pending Approval":
			frappe.throw(_("Only a bill Pending Approval can be approved."))
		if not self.purchase_receipt:
			frappe.throw(
				_("This bill isn't linked to a Purchase Receipt - link one before approving, so the "
				  "batch/expiry of what's being added to stock is known."),
				title=_("Purchase Receipt Required"),
			)

		receipt = frappe.get_doc("Purchase Receipt", self.purchase_receipt)
		for row in receipt.items:
			# The Receipt already knows exactly what physically arrived - which
			# batch, how much in stock-UOM terms - so stock is added from its
			# rows, not the Bill's (the Bill has no batch/conversion_factor of
			# its own, only price).
			batch_name = f"{row.item}-{row.batch_no}"
			create_stock_ledger_entry(
				item=row.item,
				warehouse=receipt.receiving_warehouse,
				batch_no=batch_name,
				posting_datetime=receipt.receipt_date_time,
				voucher_type="Purchase Bill",
				voucher_no=self.name,
				qty_change=row.stock_qty,
			)

		self.db_set("status", "Approved", update_modified=False)
		self.db_set("approved_by", frappe.session.user, update_modified=False)
		self.db_set("approved_date_time", now_datetime(), update_modified=False)

		for row in self.items:
			# Price lives on the Batch, not the Item - cost varies bill to bill
			# (different suppliers, different times), so a single Item-level
			# price would get silently overwritten by whichever bill was
			# approved most recently, even while older/cheaper-batch stock is
			# still on the shelf being sold at the wrong price. Billing looks
			# up the rate from the specific batch being dispensed.
			if not row.item or not row.batch_no:
				continue
			batch_name = f"{row.item}-{row.batch_no}"
			if not frappe.db.exists("Batch", batch_name):
				continue
			# Single Tablet Price is the pre-GST base rate - Billing already adds
			# GST on top of it at the point of sale, so storing Final Selling
			# Price here would tax the patient twice.
			if row.single_tablet_price:
				frappe.db.set_value(
					"Batch", batch_name, "selling_rate", row.single_tablet_price, update_modified=False
				)
			if row.purchase_cost:
				frappe.db.set_value(
					"Batch", batch_name, "purchase_rate", row.purchase_cost, update_modified=False
				)
			# Item-level Standard Purchase Rate stays as a "what did we last pay
			# for this, in general" reference only (shown on the next bill for
			# comparison) - not used for any actual pricing or billing decision,
			# so it's fine for this one to just reflect the most recent bill.
			if row.purchase_rate:
				frappe.db.set_value(
					"Item", row.item, "standard_purchase_rate", row.purchase_rate, update_modified=False
				)
				# One permanent history row per approved bill - unlike the
				# single reference field above, this is never overwritten, so
				# staff can see how this item's price has moved bill to bill.
				record_purchase_price_history(
					item_code=row.item,
					rate=row.purchase_rate,
					qty=row.qty,
					date=self.supplier_invoice_date,
					supplier=self.supplier,
					purchase_bill=self.name,
				)

	@frappe.whitelist()
	def cancel_approval(self):
		# Undoes just the approval - reverses the stock it added and puts the
		# bill back to Pending Approval - without cancelling the Purchase Bill
		# document itself, which would also unlink it from the Purchase Receipt
		# and disrupt any Payment Entry already made against it. Use this for
		# "the approver made a mistake approving this" - use the document's own
		# Cancel for "this whole bill is void."
		validate_can_approve()
		if self.status != "Approved":
			frappe.throw(_("Only an Approved bill's approval can be cancelled."))

		reverse_stock_ledger_entries("Purchase Bill", self.name)

		self.db_set("status", "Pending Approval", update_modified=False)
		self.db_set("approved_by", None, update_modified=False)
		self.db_set("approved_date_time", None, update_modified=False)

	@frappe.whitelist()
	def reject_bill(self, reason):
		validate_can_approve()
		if self.status != "Pending Approval":
			frappe.throw(_("Only a bill Pending Approval can be rejected."))
		if not reason:
			frappe.throw(_("Rejection Reason is mandatory to reject a bill."))
		self.db_set("status", "Rejected", update_modified=False)
		self.db_set("rejection_reason", reason, update_modified=False)
		self.db_set("approved_by", frappe.session.user, update_modified=False)
		self.db_set("approved_date_time", now_datetime(), update_modified=False)

	def refresh_purchase_receipt_link(self):
		# Keeps the Purchase Receipt list's "Linked Purchase Bill" column
		# accurate regardless of how this was created, cancelled, or deleted -
		# not just when it happened via the receipt's own button.
		if not self.purchase_receipt:
			return
		existing = get_existing_bill_for_purchase_receipt(self.purchase_receipt)
		# update_modified=False - this is a side effect of saving a *different*
		# document, not something someone editing this Purchase Receipt did;
		# bumping its timestamp would wrongly collide with their own edit.
		frappe.db.set_value(
			"Purchase Receipt",
			self.purchase_receipt,
			"linked_purchase_bill",
			existing or "",
			update_modified=False,
		)


def validate_can_approve():
	# Same reasoning as Purchase Order's own validate_can_approve() - Account
	# Staff needs "write" on Purchase Bill for the rest of the billing flow,
	# which would otherwise be enough on its own to call this same whitelisted
	# method. A plain DocPerm can't express "write, but not this one action",
	# so approval rights are enforced here instead.
	user_roles = frappe.get_roles(frappe.session.user)
	if "Purchase Approver" not in user_roles and "System Manager" not in user_roles:
		frappe.throw(
			_("Only a Purchase Approver can approve or reject a Purchase Bill."),
			frappe.PermissionError,
		)


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
def get_existing_bill_for_purchase_receipt(purchase_receipt):
	# One Purchase Receipt should only ever get one Purchase Bill - without
	# this, a "Create Purchase Bill" button on the receipt would keep
	# spawning duplicate bills for the same delivery.
	frappe.has_permission("Purchase Bill", "read", throw=True)
	if not purchase_receipt:
		return None
	return frappe.db.get_value(
		"Purchase Bill", {"purchase_receipt": purchase_receipt, "docstatus": ["!=", 2]}, "name"
	)


@frappe.whitelist()
def get_items_from_receipt(purchase_receipt):
	# Qty to bill comes from what was actually received (Purchase Receipt).
	# Rate is deliberately left blank for manual entry here - Purchase Order
	# no longer carries a real rate (no pricing happens at that stage), and
	# Purchase Receipt never has either, only the physical qty/batch/expiry.
	# Rows returned here are already fully computed (amount, gst_amount) -
	# bulk-adding rows via frm.add_child skips the field-change events that
	# would normally trigger those calculations client-side, the same issue
	# already hit on Purchase Order/Purchase Receipt's own fetch_from fields.
	frappe.has_permission("Purchase Bill", "read", throw=True)
	pr = frappe.get_doc("Purchase Receipt", purchase_receipt)
	rows = []
	for pr_row in pr.items:
		item_details = (
			frappe.db.get_value(
				"Item",
				pr_row.item,
				["gst_percent", "item_name", "standard_selling_rate", "standard_purchase_rate"],
				as_dict=True,
			)
			or {}
		)
		gst_percent = item_details.get("gst_percent") or 0
		rows.append(
			{
				"item": pr_row.item,
				"item_name": item_details.get("item_name") or "",
				"batch_no": pr_row.batch_no,
				"packing": flt(pr_row.packing),
				"no_of_unit": flt(pr_row.no_of_unit),
				"free": 0,
				"qty": flt(pr_row.qty_received),
				"purchase_rate": 0,
				"purchase_cost": 0,
				"last_purchase_cost": flt(item_details.get("standard_purchase_rate")),
				"amount": 0,
				"discount": 0,
				"gst_percent": gst_percent,
				"gst_amount": 0,
				"cgst_rate": flt(gst_percent) / 2,
				"cgst_amount": 0,
				"sgst_rate": flt(gst_percent) / 2,
				"sgst_amount": 0,
				"igst_rate": 0,
				"igst_amount": 0,
				"total_amount": 0,
				# Last known selling price is only a starting point here - staff
				# still confirm/update it from the strip's actual printed MRP.
				"mrp": flt(item_details.get("standard_selling_rate")),
				"packing_mrp": 0,
				"single_tablet_price": 0,
				"selling_gst_percent": gst_percent,
				"selling_gst_amount": 0,
				"selling_cgst_amount": 0,
				"selling_sgst_amount": 0,
				"final_selling_price": 0,
			}
		)
	return rows
