# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.metta.doctype.patient_visit.patient_visit import add_advance_tracking_entry


class PatientAdvance(Document):
	def validate(self):
		if flt(self.amount) <= 0:
			frappe.throw(_("Amount must be greater than zero."))

		registration_category = frappe.db.get_value("Patient Visit", self.patient_visit, "registration_category")
		if registration_category != "IP":
			frappe.throw(
				_("An advance can only be collected against an IP admission."), title=_("Not an IP Visit")
			)

		if not self.received_by:
			self.received_by = frappe.session.user

	def after_insert(self):
		# Only on genuine creation - this doctype isn't submittable, so a
		# later correction (e.g. fixing a typo'd Remarks) goes through
		# validate() again but must never add a second "Advance Collected"
		# entry for the same deposit.
		add_advance_tracking_entry(self.patient_visit, "Advance Collected", self.amount)


@frappe.whitelist()
def get_advance_balance(patient_visit):
	frappe.has_permission("Patient Advance", "read", throw=True)

	total_collected = flt(
		frappe.db.sql("select sum(amount) from `tabPatient Advance` where patient_visit=%s", patient_visit)[0][0]
	)
	# docstatus != 2 (not cancelled) - draft bills count too, so a second
	# draft Billing against the same visit sees a balance that already
	# accounts for the first draft's provisional adjustment, rather than
	# letting both drafts independently think the full amount is available.
	total_adjusted = flt(
		frappe.db.sql(
			"select sum(advance_adjusted) from `tabBilling` where patient=%s and docstatus != 2", patient_visit
		)[0][0]
	)
	return {
		"total_collected": total_collected,
		"total_adjusted": total_adjusted,
		"balance": total_collected - total_adjusted,
	}
