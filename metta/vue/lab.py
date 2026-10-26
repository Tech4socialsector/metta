# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

# Server methods for the Vue Lab screens (frontend/src/pages/Lab). Desk's
# Diagnostic Test form is untouched; nothing here saves anything - saving
# still goes through frappe.client so DiagnosticTest.validate() runs as in Desk.

import frappe


@frappe.whitelist()
def get_test_context(test=None, consultation=None):
	"""Who the test is for and who ordered it, for the lab test screen.

	Why this exists: Lab Staff can read Diagnostic Test but not Doctor
	Consultation or Patient Visit, so they can't look up the ordering doctor,
	visit, age or sex themselves. Access is checked on the test itself (which
	also applies the Doctor-only-own-patients hook); the doctor's diagnosis
	and notes are added only when the user may read the consultation.
	"""
	if test:
		doc = frappe.get_doc("Diagnostic Test", test)
		doc.check_permission("read")
		consultation = doc.doctor_consultation
	elif consultation:
		# An unsaved test has nothing to check yet - fall back to the
		# consultation's own permission (Doctor / System Manager).
		frappe.has_permission("Doctor Consultation", "read", doc=consultation, throw=True)
	if not consultation:
		return {}

	# get_value (not get_doc) on purpose: read access was settled above.
	dc = frappe.db.get_value(
		"Doctor Consultation",
		consultation,
		["name", "patient_consultation", "doctor", "consultation_datetime", "diagnosis", "clinical_notes"],
		as_dict=True,
	)
	if not dc:
		return {}

	visit = {}
	if dc.patient_consultation:
		visit = (
			frappe.db.get_value(
				"Patient Visit", dc.patient_consultation, ["uhin_id", "sex", "age"], as_dict=True
			)
			or {}
		)

	out = {
		"consultation": dc.name,
		"visit": dc.patient_consultation,
		"uhin_id": visit.get("uhin_id"),
		"sex": visit.get("sex"),
		"age": visit.get("age"),
		"doctor": dc.doctor,
		"consultation_datetime": dc.consultation_datetime,
		"can_read_consultation": False,
		"can_read_visit": bool(
			dc.patient_consultation
			and frappe.has_permission("Patient Visit", "read", doc=dc.patient_consultation)
		),
	}
	if frappe.has_permission("Doctor Consultation", "read", doc=dc.name):
		out.update(
			{
				"can_read_consultation": True,
				"diagnosis": dc.diagnosis,
				"clinical_notes": dc.clinical_notes,
			}
		)
	return out
