# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

from metta.metta.doctype.patient_registration.patient_registration import calculate_age


class NurseInterventions(Document):
	def validate(self):
		self.update_age()
		self.update_bmi()
		self.update_blood_sugar_status()
		self.update_anemia_status()

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

	def update_blood_sugar_status(self):
		# Random Blood Glucose, not fasting - thresholds are for a random
		# reading (mg/dL, despite the field's own "gm/dl" label - a
		# pre-existing mislabel, glucose is never actually measured in gm/dl).
		if not self.rbg_level:
			self.blood_sugar_status = ""
			return
		rbg = flt(self.rbg_level)
		if rbg < 70:
			self.blood_sugar_status = "Low"
		elif rbg < 140:
			self.blood_sugar_status = "Normal"
		else:
			self.blood_sugar_status = "High"

	def update_anemia_status(self):
		# WHO cutoffs differ by sex (Male 13 g/dL, Female/unspecified 12 g/dL)
		# - a simplification, since these also vary further by age and
		# pregnancy status, neither of which this doctype captures.
		if not self.hemoglobin_level:
			self.anemia_status = ""
			return
		threshold = 13.0 if self.gender == "Male" else 12.0
		self.anemia_status = "Normal" if flt(self.hemoglobin_level) >= threshold else "Anemic"


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
