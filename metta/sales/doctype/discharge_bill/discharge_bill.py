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

	def validate_is_ip_and_discharged(self):
		if not self.ip_id:
			return
		validate_ip_discharged_with_summary(self.ip_id)

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


def validate_ip_discharged_with_summary(ip_id):
	visit = frappe.db.get_value(
		"Patient Visit", ip_id, ["registration_category", "admission_status"], as_dict=True
	)
	if not visit or visit.registration_category != "IP" or visit.admission_status != "Discharged":
		frappe.throw(
			_("Discharge Bill can only be created for an IP admission that has already been marked Discharged."),
			title=_("Not Discharged Yet"),
		)
	if not frappe.db.exists("Discharge Summary", {"patient_visit": ip_id}):
		frappe.throw(
			_("The doctor must complete the Discharge Summary before the Discharge Bill can be generated."),
			title=_("Discharge Summary Required"),
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
	total_billed = flt(total_billed, 2)
	advance_adjusted = flt(total_adjusted, 2)
	amount_collected = flt(total_collected, 2)
	return {
		"bill_items": items,
		"total_billed": total_billed,
		"advance_paid": flt(advance["total_collected"], 2),
		# What's left of the advance after this admission's own bills already
		# adjusted their share against it - get_advance_balance() itself is
		# already scoped to just this one ip_id, same as advance_adjusted
		# below, so the two agree by construction.
		"advance_balance": flt(advance["balance"], 2),
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
def preview_discharge_bill(ip_id):
	# Live preview before the doc is actually saved, same reasoning as
	# Billing's own quick-add/admission-charge previews - validate() on save
	# is still the authoritative recompute.
	frappe.has_permission("Discharge Bill", "read", throw=True)
	if not ip_id:
		return None
	validate_ip_discharged_with_summary(ip_id)
	return compile_discharge_bill(ip_id)
