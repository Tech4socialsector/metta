# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class DiagnosticTest(Document):
	def validate(self):
		# Recorded the first time status actually reaches Reported - not reset
		# on later edits, so it keeps showing who originally reported it even
		# if someone else corrects a typo in the result afterwards. Same
		# "stamp once" pattern as collected_by on Patient Visit.
		if self.status == "Reported" and not self.reported_by:
			self.reported_by = frappe.session.user
			self.reported_on = now_datetime()


def get_permission_query_conditions(user=None):
	# A Doctor only ever needs tests ordered from their own consultations -
	# Lab Staff and System Manager see everything, same shape as the
	# Doctor-scoping already used on Patient Visit/Doctor Consultation/Appointment.
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Lab Staff" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabDiagnostic Test`.doctor_consultation in (
		select name from `tabDoctor Consultation` where doctor = {frappe.db.escape(doctor)}
	)"""


def has_permission(doc, ptype, user):
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Lab Staff" in roles or "Doctor" not in roles:
		return True

	# Opening a Form directly by URL passes just the docname, not a loaded
	# Document - every other caller already passes the doc, so this only
	# ever does the extra fetch on that one path.
	if isinstance(doc, (str, int)):
		doc = frappe.get_doc("Diagnostic Test", doc)

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return False
	consultation_doctor = frappe.db.get_value("Doctor Consultation", doc.doctor_consultation, "doctor")
	return consultation_doctor == doctor
