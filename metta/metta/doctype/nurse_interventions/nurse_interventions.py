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
		# Saving this form WITH the actual vitals filled in is what
		# "completed" means here - the blank placeholder Patient Visit
		# creates up front (see its after_insert(), which deliberately
		# bypasses these same fields' own Mandatory check) stays Pending
		# until a nurse actually records a real assessment.
		if self.temperature:
			self.status = "Completed"
		self.update_blood_sugar_history()
		self.notify_doctor_dashboard_if_ready()

	def notify_doctor_dashboard_if_ready(self):
		# Same event Patient Visit.after_insert() already fires for a newly
		# assigned patient - reused here so the doctor's "Ready to Consult"
		# tile picks up vitals the moment the nurse finishes them, instead of
		# only on the doctor's next manual Refresh.
		if self.status != "Completed" or not self.has_value_changed("status"):
			return
		doctor = frappe.db.get_value("Patient Visit", self.patient_registration, "doctor_name")
		doctor_user = frappe.db.get_value("Doctor Master", doctor, "user") if doctor else None
		if doctor_user:
			frappe.publish_realtime("doctor_dashboard_update", user=doctor_user, after_commit=True)

	def update_blood_sugar_history(self):
		# Rebuilt fresh on every save from this patient's own past readings -
		# never hand-entered. Each row links back to the Nurse Interventions
		# record it came from (Visit Record), so clicking through it in the
		# grid opens that original assessment directly.
		self.set("blood_sugar_history", [])
		if not self.patient_unique_id:
			return
		for row in get_blood_sugar_history_rows(self.patient_unique_id, exclude=self.name):
			self.append(
				"blood_sugar_history",
				{
					"nurse_intervention": row.name,
					"date": row.date,
					"rbg_level": row.rbg_level,
					"blood_sugar_status": row.blood_sugar_status,
				},
			)

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


def get_blood_sugar_history_rows(patient_unique_id, exclude=None):
	# Every past reading (Low/Normal/High), not just High ones - the nurse
	# taking a fresh reading sees the full trend, not only a High-only alert.
	# Not capped here - the Blood Sugar History child table's own grid_page_length
	# (see that doctype) shows 5 at a time with Frappe's native "load more",
	# so there's no need to truncate the underlying data itself.
	if not patient_unique_id:
		return []
	filters = {"patient_unique_id": patient_unique_id, "blood_sugar_status": ["!=", ""]}
	if exclude:
		filters["name"] = ["!=", exclude]
	return frappe.get_all(
		"Nurse Interventions",
		filters=filters,
		fields=["name", "date", "rbg_level", "blood_sugar_status"],
		order_by="date desc",
	)


@frappe.whitelist()
def get_blood_sugar_history(patient_unique_id, exclude=None):
	# Client-side live preview before the doc is actually saved (see
	# update_blood_sugar_history() above for the authoritative, server-side
	# version that actually gets stored).
	frappe.has_permission("Nurse Interventions", "read", throw=True)
	return get_blood_sugar_history_rows(patient_unique_id, exclude=exclude)


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

	# Opening a Form directly by URL passes just the docname, not a loaded
	# Document - every other caller already passes the doc, so this only
	# ever does the extra fetch on that one path.
	if isinstance(doc, (str, int)):
		doc = frappe.get_doc("Nurse Interventions", doc)

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return False
	visit_doctor = frappe.db.get_value("Patient Visit", doc.patient_registration, "doctor_name")
	return visit_doctor == doctor
