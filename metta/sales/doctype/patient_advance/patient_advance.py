# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.metta.doctype.patient_visit.patient_visit import add_advance_tracking_entry

# Once this much of a patient's collected advance has been used against
# bills, billing staff get a warning to ask the patient's relative for a
# top-up, rather than only finding out once the balance is fully exhausted.
ADVANCE_LOW_BALANCE_THRESHOLD = 80


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

		self.validate_not_below_used()

	def validate_not_below_used(self):
		# This doctype isn't submittable, so an advance can still be edited
		# after bills have used it. Lowering it (or moving it to another
		# admission) below what submitted bills already used would leave the
		# bills claiming advance that was never paid (UAT, 2026-11-11).
		if self.is_new():
			return
		before = self.get_doc_before_save()
		if not before:
			return
		if before.patient_visit == self.patient_visit:
			removed = flt(before.amount) - flt(self.amount)
		else:
			removed = flt(before.amount)
		if removed > 0:
			check_advance_still_covers_bills(before.patient_visit, removed, _("reduced"))

	def on_trash(self):
		check_advance_still_covers_bills(self.patient_visit, flt(self.amount), _("deleted"))

	def after_insert(self):
		# Only on genuine creation - this doctype isn't submittable, so a
		# later correction (e.g. fixing a typo'd Remarks) goes through
		# validate() again but must never add a second "Advance Collected"
		# entry for the same deposit.
		add_advance_tracking_entry(self.patient_visit, "Advance Collected", self.amount)


def check_advance_still_covers_bills(patient_visit, removed, action):
	# Raises if taking `removed` off this admission's advance would leave less
	# than the submitted bills have already used from it.
	info = get_advance_balance(patient_visit)
	left = flt(info["balance"]) - flt(removed)
	if left < -0.005:
		frappe.throw(
			_(
				"This advance can't be {0}: {1} of the advance for {2} is already used by submitted bills, "
				"so only {3} can be taken off. To give money back, cancel the bills that used it first."
			).format(
				action,
				frappe.format(info["total_adjusted"], {"fieldtype": "Currency"}),
				patient_visit,
				frappe.format(max(flt(info["balance"]), 0), {"fieldtype": "Currency"}),
			),
			title=_("Advance Already Used"),
		)


@frappe.whitelist()
def get_advance_balance(patient_visit, exclude_billing=None):
	frappe.has_permission("Patient Advance", "read", throw=True)

	total_collected = flt(
		frappe.db.sql("select sum(amount) from `tabPatient Advance` where patient_visit=%s", patient_visit)[0][0]
	)
	# Only submitted bills reduce the advance - a draft is still being worked
	# on (and may never be submitted), so it must not show the patient's
	# advance as used up. Billing's validate() re-checks the balance at
	# submit, so two drafts both auto-applying the same advance can't both
	# go through.
	# exclude_billing leaves out the bill currently open in the form, so its
	# own Advance Adjusted isn't counted here AND subtracted again by the form.
	total_adjusted = flt(
		frappe.db.sql(
			"select sum(advance_adjusted) from `tabBilling` where patient=%s and docstatus = 1 and name != %s",
			(patient_visit, exclude_billing or ""),
		)[0][0]
	)
	percent_used = (total_adjusted / total_collected * 100) if total_collected else 0
	return {
		"total_collected": total_collected,
		"total_adjusted": total_adjusted,
		"balance": total_collected - total_adjusted,
		"percent_used": percent_used,
		"is_low": percent_used >= ADVANCE_LOW_BALANCE_THRESHOLD,
	}
