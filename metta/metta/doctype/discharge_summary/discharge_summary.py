# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DischargeSummary(Document):
	def validate(self):
		self.validate_visit_is_discharged()
		self.validate_single_summary_per_visit()
		if not self.prepared_by:
			self.prepared_by = frappe.session.user

	def validate_visit_is_discharged(self):
		# A discharge summary only makes sense for a completed IP discharge -
		# writing one earlier would describe an outcome that hasn't happened yet.
		visit = frappe.db.get_value(
			"Patient Visit", self.patient_visit, ["registration_category", "admission_status"], as_dict=True
		)
		if not visit or visit.registration_category != "IP" or visit.admission_status != "Discharged":
			frappe.throw(
				_("Discharge Summary can only be created for a Patient Visit that is an IP admission and has already been marked Discharged."),
				title=_("Visit Not Discharged"),
			)

	def validate_single_summary_per_visit(self):
		existing = frappe.db.get_value(
			"Discharge Summary", {"patient_visit": self.patient_visit, "name": ["!=", self.name]}, "name"
		)
		if existing:
			frappe.throw(
				_("Visit {0} already has a Discharge Summary ({1}).").format(self.patient_visit, existing),
				title=_("Already Discharged"),
			)


def get_permission_query_conditions(user=None):
	# Same shape as Doctor Consultation's Doctor-scoping - a Doctor only ever
	# needs their own patients' discharge summaries; every other role with
	# read access here (Nurse, Front Desk) sees everyone's, matching their
	# own DocPerm row already granting that.
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Nurse" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabDischarge Summary`.patient_visit in (
		select name from `tabPatient Visit` where doctor_name = {frappe.db.escape(doctor)}
	)"""


def has_permission(doc, ptype, user):
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Nurse" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return True

	# Opening a Form directly by URL passes just the docname, not a loaded
	# Document - every other caller already passes the doc, so this only
	# ever does the extra fetch on that one path.
	if isinstance(doc, (str, int)):
		doc = frappe.get_doc("Discharge Summary", doc)

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return False
	visit_doctor = frappe.db.get_value("Patient Visit", doc.patient_visit, "doctor_name")
	return visit_doctor == doctor
