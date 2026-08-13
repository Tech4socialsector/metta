# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.metta.doctype.patient_registration.patient_registration import calculate_age


class NurseInterventions(Document):
	def validate(self):
		self.update_age()
		self.update_bmi()
		self.validate_completion()

	def update_age(self):
		dob = frappe.db.get_value("Patient Registration", self.patient_unique_id, "dob") if self.patient_unique_id else None
		age = calculate_age(dob)
		self.age = age if age is not None else None

	def update_bmi(self):
		# BMI = weight(kg) / height(m)^2 - Height is captured in cm, so it
		# needs converting before the formula applies.
		if not (self.height and self.weight):
			self.bmi = ""
			self.bmi_category = ""
			return
		height_m = flt(self.height) / 100
		bmi = flt(self.weight) / (height_m**2)
		self.bmi = f"{bmi:.1f}"
		if bmi < 18.5:
			self.bmi_category = "Underweight"
		elif bmi < 25:
			self.bmi_category = "Normal"
		elif bmi < 30:
			self.bmi_category = "Overweight"
		else:
			self.bmi_category = "Obese"

	def validate_completion(self):
		# "Pending" is what makes this a reliable triage worklist - an
		# intervention marked Completed with no vitals actually recorded would
		# silently defeat that.
		if self.status != "Completed":
			return
		required_vitals = {
			"temperature": _("Temperature"),
			"pulse": _("Pulse"),
			"blood_pressure_mmhg": _("Blood Pressure"),
		}
		missing = [label for fieldname, label in required_vitals.items() if not self.get(fieldname)]
		if missing:
			frappe.throw(
				_("Cannot mark this Completed - the following vitals are still missing: {0}.").format(
					", ".join(missing)
				),
				title=_("Vitals Missing"),
			)


def get_permission_query_conditions(user=None):
	# patient_registration is actually a Link to Patient Visit (the
	# visit), not Patient Registration (the person) - despite the field name -
	# so a Doctor's own patients are found the same way as on that doctype.
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Nurse" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabNurse Interventions`.patient_registration in (
		select name from `tabPatient Visit` where doctor_name = {frappe.db.escape(doctor)}
	)"""


def has_permission(doc, ptype, user):
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Nurse" in roles or "Doctor" not in roles:
		return True

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return False
	visit_doctor = frappe.db.get_value("Patient Visit", doc.patient_registration, "doctor_name")
	return visit_doctor == doctor
