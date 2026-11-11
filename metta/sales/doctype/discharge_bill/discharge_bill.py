# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.sales.doctype.patient_advance.patient_advance import get_advance_balance


class DischargeBill(Document):
	def validate(self):
		self.validate_is_ip_and_discharged()
		self.validate_single_bill_per_admission()
		self.compile_from_billing()

	def before_submit(self):
		self.validate_no_draft_bills()

	def validate_no_draft_bills(self):
		# A draft Billing keeps the advance figure it took when it was made; if
		# other bills were submitted since, that figure is stale and the advance
		# gets counted twice (seen on UAT: advance used > advance paid,
		# 2026-11-11). Submitting the draft re-checks it against the real
		# balance, so the final bill waits until every bill is submitted.
		drafts = frappe.get_all(
			"Billing", filters={"patient": self.ip_id, "docstatus": 0}, pluck="name", order_by="name"
		)
		if drafts:
			frappe.throw(
				_("Submit or delete these draft bills for this admission before submitting the Discharge Bill: {0}").format(
					", ".join(drafts)
				),
				title=_("Draft Bills Pending"),
			)

	def validate_is_ip_and_discharged(self):
		if not self.ip_id:
			return
		validate_ip_discharged(self.ip_id)

	def validate_single_bill_per_admission(self):
		existing = frappe.db.get_value(
			"Discharge Bill",
			{"ip_id": self.ip_id, "name": ["!=", self.name], "docstatus": ["!=", 2]},
			"name",
		)
		if existing:
			frappe.throw(
				_("This admission already has a Discharge Bill ({0}).").format(existing),
				title=_("Already Generated"),
			)

	def compile_from_billing(self):
		# Rebuilt fresh from every non-cancelled Billing raised for this
		# admission every time this is saved - never hand-entered, so it can
		# never drift from what was actually billed day by day during the stay.
		self.set("bill_items", [])
		compiled = compile_discharge_bill(self.ip_id) if self.ip_id else None
		if not compiled:
			self.total_billed = 0
			self.advance_paid = 0
			self.advance_balance = 0
			self.advance_adjusted = 0
			self.amount_collected = 0
			self.balance_due = 0
			return

		for row in compiled["bill_items"]:
			self.append("bill_items", row)
		self.total_billed = compiled["total_billed"]
		self.advance_paid = compiled["advance_paid"]
		self.advance_balance = compiled["advance_balance"]
		self.advance_adjusted = compiled["advance_adjusted"]
		self.amount_collected = compiled["amount_collected"]
		self.balance_due = compiled["balance_due"]


def validate_ip_discharged(ip_id):
	# The Discharge Bill now comes first in this workflow - it only ever
	# needs the admission itself marked Discharged, not a completed Discharge
	# Summary (see Discharge Summary's own validate_billing_is_completed(),
	# which is what now runs the other way around: no Discharge Summary until
	# this bill is submitted).
	visit = frappe.db.get_value(
		"Patient Visit", ip_id, ["registration_category", "admission_status"], as_dict=True
	)
	if not visit or visit.registration_category != "IP" or visit.admission_status != "Discharged":
		frappe.throw(
			_("Discharge Bill can only be created for an IP admission that has already been marked Discharged."),
			title=_("Not Discharged Yet"),
		)


def compile_discharge_bill(ip_id):
	# Shared by the server-side authoritative recompute (Document.validate())
	# and the client-side live preview (preview_discharge_bill() below) - one
	# formula, so the preview can never show a number the actual save won't.
	bills = frappe.get_all(
		"Billing",
		filters={"patient": ip_id, "docstatus": ["!=", 2]},
		fields=["name", "sale_datetime", "payable_amount", "advance_adjusted", "amount_collected"],
		order_by="sale_datetime asc",
	)

	items = []
	total_billed = 0
	total_adjusted = 0
	total_collected = 0
	for bill in bills:
		line_items = frappe.get_all(
			"Sales Bill Item",
			filters={"parent": bill.name},
			fields=["item_name", "qty", "uom", "rate", "amount"],
			order_by="idx",
		)
		for item in line_items:
			items.append(
				{
					"bill": bill.name,
					"sale_datetime": bill.sale_datetime,
					"item_name": item.item_name,
					"qty": item.qty,
					"uom": item.uom,
					"rate": item.rate,
					"amount": item.amount,
				}
			)
		total_billed += flt(bill.payable_amount)
		total_adjusted += flt(bill.advance_adjusted)
		total_collected += flt(bill.amount_collected)

	advance = get_advance_balance(ip_id)
	advance_paid = flt(advance["total_collected"], 2)
	total_billed = flt(total_billed, 2)
	# The bills can't have used more advance than the patient actually paid.
	# If they claim more (a stale draft, or an advance reduced after use),
	# only what was paid counts; the rest stays in Balance Due so it is
	# collected, instead of showing a negative Advance Balance and ₹0 due.
	advance_adjusted = flt(min(total_adjusted, advance_paid), 2)
	amount_collected = flt(total_collected, 2)
	return {
		"bill_items": items,
		"total_billed": total_billed,
		"advance_paid": advance_paid,
		# What's left of the advance after the bills listed above adjusted
		# their share - computed from those same bills (drafts included),
		# not get_advance_balance()'s submitted-only balance, so the two
		# figures on this bill always agree. Never below zero (see above).
		"advance_balance": flt(advance_paid - advance_adjusted, 2),
		"advance_adjusted": advance_adjusted,
		"amount_collected": amount_collected,
		# Whatever's left unpaid after both the advance and what's already
		# been collected bill-by-bill - the actual amount still owed.
		"balance_due": flt(total_billed - advance_adjusted - amount_collected, 2),
	}


@frappe.whitelist()
def get_print_html(discharge_bill):
	# Same "dialog with a Print button" pattern already used for Patient
	# Visit's Receipt Preview / Doctor Consultation's Print Prescription,
	# rendering the same "Discharge Bill" Print Format used if printed via
	# Frappe's own native Print button too - one layout, either route.
	doc = frappe.get_doc("Discharge Bill", discharge_bill)
	doc.check_permission("read")
	print_format = frappe.get_doc("Print Format", "Discharge Bill")
	return frappe.render_template(print_format.html, {"doc": doc.as_dict()})


@frappe.whitelist()
def get_billing_status(ip_id):
	# "Billing completed" means the patient doesn't owe anything more, not
	# just that a Discharge Bill document happens to have been submitted - a
	# submitted bill can still have a real Balance Due sitting on it. Used
	# both to gate Discharge Summary (see Discharge Summary's own
	# validate_billing_is_completed(), and Patient Visit's "Discharge
	# Summary" button) and to show Front Desk/the Doctor a plain answer to
	# "is this patient done with billing" - not just a hidden/shown button
	# they have to guess the reason for.
	frappe.has_permission("Discharge Bill", "read", throw=True)
	if not ip_id:
		return {"completed": False, "discharge_bill": None, "balance_due": 0}

	bill = frappe.db.get_value(
		"Discharge Bill", {"ip_id": ip_id, "docstatus": 1}, ["name", "balance_due"], as_dict=True
	)
	if not bill:
		return {"completed": False, "discharge_bill": None, "balance_due": 0}

	balance_due = flt(bill.balance_due)
	return {"completed": balance_due <= 0, "discharge_bill": bill.name, "balance_due": balance_due}


def billing_not_completed_message(status):
	# The old single message said "Balance Due ₹0.00" even when no Discharge
	# Bill existed at all, which read as "already paid". Say what is actually
	# missing: the bill itself, or the money still due on it.
	if not status["discharge_bill"]:
		return _(
			"Billing has not submitted a Discharge Bill for this admission yet. The Discharge Summary can be written once the Discharge Bill is submitted and fully paid."
		)
	return _("{0} is still due on Discharge Bill {1}. The Discharge Summary can be written once it is fully paid.").format(
		frappe.format(status["balance_due"], {"fieldtype": "Currency"}), status["discharge_bill"]
	)


@frappe.whitelist()
def preview_discharge_bill(ip_id):
	# Live preview before the doc is actually saved, same reasoning as
	# Billing's own quick-add/admission-charge previews - validate() on save
	# is still the authoritative recompute.
	frappe.has_permission("Discharge Bill", "read", throw=True)
	if not ip_id:
		return None
	validate_ip_discharged(ip_id)
	return compile_discharge_bill(ip_id)
