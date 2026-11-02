# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.metta.doctype.patient_registration.patient_registration import calculate_age

# The lowest and highest value each vital can possibly have - wide enough
# for newborns and very ill patients, so it only stops typing mistakes
# (a height of 1000, a pulse of 7000), never a real reading. The Vue form
# (frontend/src/data/nurseRules.js VITAL_RANGES) shows the same limits.
VITAL_RANGES = {
	"temperature": (_("Temperature"), 90, 110, "°F"),
	"pulse": (_("Pulse"), 30, 220, "beats/min"),
	"respiration": (_("Respiration"), 5, 60, "/min"),
	"saturation": (_("SpO2"), 50, 100, "%"),
	"height": (_("Height"), 30, 250, "cm"),
	"weight": (_("Weight"), 0.5, 300, "kg"),
}
SYSTOLIC_RANGE = (50, 260)
DIASTOLIC_RANGE = (30, 160)
BP_PATTERN = re.compile(r"^\s*(\d{2,3})\s*/\s*(\d{2,3})\s*$")


class NurseInterventions(Document):
	def validate(self):
		self.validate_vital_ranges()
		self.update_age()
		self.update_bmi()
		# Saving this form WITH the actual vitals filled in is what
		# "completed" means here - the blank placeholder Patient Visit
		# creates up front (see its after_insert(), which deliberately
		# bypasses these same fields' own Mandatory check) stays Pending
		# until a nurse actually records a real assessment.
		if self.temperature:
			self.status = "Completed"
		self.notify_doctor_dashboard_if_ready()

	def validate_vital_ranges(self):
		# Empty values are skipped: the blank placeholder Patient Visit
		# creates (see notes in validate()) has none yet, and Mandatory
		# already covers a missing reading on a real save.
		errors = []
		for fieldname, (label, low, high, unit) in VITAL_RANGES.items():
			value = self.get(fieldname)
			if value in (None, "") or (fieldname in ("height", "weight") and not flt(value)):
				continue
			try:
				number = float(str(value).strip())
			except ValueError:
				errors.append(_("{0} must be a number").format(label))
				continue
			if not low <= number <= high:
				errors.append(_("{0} must be between {1} and {2} {3}").format(label, low, high, unit))

		bp = (self.blood_pressure_mmhg or "").strip()
		if bp:
			match = BP_PATTERN.match(bp)
			if not match:
				errors.append(_("Blood Pressure must be like 120/80"))
			else:
				systolic, diastolic = int(match.group(1)), int(match.group(2))
				if not SYSTOLIC_RANGE[0] <= systolic <= SYSTOLIC_RANGE[1]:
					errors.append(_("Systolic BP must be between {0} and {1} mmHg").format(*SYSTOLIC_RANGE))
				if not DIASTOLIC_RANGE[0] <= diastolic <= DIASTOLIC_RANGE[1]:
					errors.append(_("Diastolic BP must be between {0} and {1} mmHg").format(*DIASTOLIC_RANGE))
				if systolic <= diastolic:
					errors.append(_("Systolic BP (first number) must be higher than diastolic"))

		if errors:
			frappe.throw("<br>".join(errors), title=_("Please check the vitals"))

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


@frappe.whitelist()
def get_previous_vitals(name):
	"""This patient's last completed vitals before this record, for the
	"Last:" hint beside each field on the Vue vitals form. get_list, so a
	Doctor still only sees their own patients' readings."""
	frappe.has_permission("Nurse Interventions", "read", doc=name, throw=True)
	patient, date = frappe.db.get_value("Nurse Interventions", name, ["patient_unique_id", "date"])
	if not patient:
		return None
	filters = {"patient_unique_id": patient, "status": "Completed", "name": ["!=", name]}
	if date:
		filters["date"] = ["<", date]
	rows = frappe.get_list(
		"Nurse Interventions",
		filters=filters,
		fields=["name", "date", "temperature", "pulse", "respiration", "saturation", "blood_pressure_mmhg", "height", "weight"],
		order_by="date desc",
		limit_page_length=1,
	)
	return rows[0] if rows else None


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
