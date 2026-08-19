# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DoctorConsultation(Document):
	def validate(self):
		self.validate_doctor_matches_session_user()
		self.validate_visit_assigned_to_doctor()

	def validate_doctor_matches_session_user(self):
		# Without this, a Doctor could set `doctor` to someone else's Doctor
		# Master record and write a note that shows up as if that other
		# doctor authored it - the field alone (see get_permission_query_conditions
		# below) isn't enough to stop that, only an explicit check is.
		roles = frappe.get_roles(frappe.session.user)
		if "System Manager" in roles:
			return

		own_doctor = frappe.db.get_value("Doctor Master", {"user": frappe.session.user}, "name")
		if not own_doctor:
			frappe.throw(
				_("Your account isn't linked to a Doctor Master record - contact an administrator."),
				title=_("Not Linked to a Doctor"),
			)
		if self.doctor != own_doctor:
			frappe.throw(
				_("You can only create a consultation note as yourself ({0}), not as another doctor.").format(
					own_doctor
				),
				title=_("Not Your Record"),
			)

	def validate_visit_assigned_to_doctor(self):
		# The check above only proves `doctor` is really this session's own
		# Doctor Master record - it says nothing about whether the *visit*
		# being consulted on was ever assigned to that doctor. Without this, a
		# Doctor could still open any patient's visit (read access to Patient
		# Visit isn't restricted the same way) and write a consultation note
		# for someone else's patient.
		roles = frappe.get_roles(frappe.session.user)
		if "System Manager" in roles:
			return

		assigned_doctor = frappe.db.get_value("Patient Visit", self.patient_consultation, "doctor_name")
		if assigned_doctor != self.doctor:
			frappe.throw(
				_("This visit ({0}) is assigned to a different doctor - you can only consult on your own patients.").format(
					self.patient_consultation
				),
				title=_("Not Your Patient"),
			)


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabDoctor Consultation`.doctor = {frappe.db.escape(doctor)}"""


def has_permission(doc, ptype, user):
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Doctor" not in roles:
		return True

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	return bool(doctor) and doc.doctor == doctor


# Returns just the prescription fragment so the client can show it in a dialog instead of navigating to Frappe's print view - mirrors get_receipt_html() on Patient Visit.
@frappe.whitelist()
def get_prescription_html(consultation):
	doc = frappe.get_doc("Doctor Consultation", consultation)
	doc.check_permission("read")
	print_format = frappe.get_doc("Print Format", "Doctor Consultation Prescription")
	return frappe.render_template(print_format.html, {"doc": doc.as_dict()})


@frappe.whitelist()
def get_vitals_status(patient_consultation):
	# A doctor is still allowed to consult without waiting for the nurse
	# (urgent cases, or the doctor checking vitals themselves) - this only
	# powers a client-side heads-up, never a hard block on saving.
	frappe.has_permission("Doctor Consultation", "read", throw=True)
	if not patient_consultation:
		return {"completed": False}
	statuses = frappe.get_all(
		"Nurse Interventions", filters={"patient_registration": patient_consultation}, pluck="status"
	)
	return {"completed": "Completed" in statuses}


@frappe.whitelist()
def get_latest_vitals(patient_consultation):
	# Unlike get_vitals_status above (a plain True/False that never leaves
	# frappe.get_all's bypassed row-permissions), this returns the actual
	# clinical readings - so it uses frappe.get_list, which does apply Nurse
	# Interventions' own permission rules (a Doctor only ever sees their own
	# assigned patients' vitals, same restriction that already governs that
	# doctype everywhere else it's read).
	frappe.has_permission("Nurse Interventions", "read", throw=True)
	if not patient_consultation:
		return None
	rows = frappe.get_list(
		"Nurse Interventions",
		filters={"patient_registration": patient_consultation, "status": "Completed"},
		fields=[
			"temperature",
			"pulse",
			"respiration",
			"saturation",
			"height",
			"weight",
			"bmi",
			"bmi_category",
			"blood_pressure_mmhg",
			"rbg_level",
			"blood_sugar_status",
			"hemoglobin_level",
			"anemia_status",
			"piccle",
			"primary_diagnosis",
		],
		order_by="date desc",
		limit_page_length=1,
	)
	return rows[0] if rows else None


@frappe.whitelist()
def get_own_doctor():
	# Lets the client default the `doctor` field to whoever is actually
	# logged in, instead of leaving it blank for them to fill in by hand
	# (and potentially pick someone else's name).
	return frappe.db.get_value("Doctor Master", {"user": frappe.session.user}, "name")


@frappe.whitelist()
def get_patient_history(patient_consultation, exclude=None):
	# Continuity of care needs the patient's FULL history, not just this
	# doctor's own past notes for them - a deliberate exception to the
	# "own patients only" restriction that governs the list view, which is
	# why this uses frappe.get_all (bypasses the row filter) behind its own
	# explicit permission check, rather than frappe.get_list.
	frappe.has_permission("Doctor Consultation", "read", throw=True)

	uhin_id = frappe.db.get_value("Patient Visit", patient_consultation, "uhin_id")
	if not uhin_id:
		return []

	past_visits = frappe.get_all("Patient Visit", filters={"uhin_id": uhin_id}, pluck="name")
	if not past_visits:
		return []

	filters = {"patient_consultation": ["in", past_visits]}
	if exclude:
		filters["name"] = ["!=", exclude]

	rows = frappe.get_all(
		"Doctor Consultation",
		filters=filters,
		fields=["name", "patient_consultation", "doctor", "consultation_datetime", "diagnosis", "clinical_notes"],
		order_by="consultation_datetime desc",
	)
	for row in rows:
		# Doctor Master has no separate display-name field - its own `name`
		# (row.doctor here) already is the doctor's identity/label.
		row["prescribed_items"] = frappe.get_all(
			"Prescription Item",
			filters={"parent": row.name},
			fields=["item_name", "dosage", "duration"],
			order_by="idx",
		)
		row["suggested_tests"] = frappe.get_all(
			"Suggested Test",
			filters={"parent": row.name},
			fields=["item_name", "test_type", "remarks"],
			order_by="idx",
		)
		# A suggested test only turns into a Diagnostic Test once someone clicks
		# "Order Diagnostic Tests" - so this can be empty even when suggested_tests
		# isn't, and that's fine, it just means nothing's been ordered yet.
		row["diagnostic_tests"] = frappe.get_all(
			"Diagnostic Test",
			filters={"doctor_consultation": row.name},
			fields=["item_name", "test_type", "status", "result", "reported_on"],
			order_by="creation",
		)
	return rows


@frappe.whitelist()
def create_diagnostic_tests(consultation):
	# One Diagnostic Test per suggested_tests row not already converted -
	# checked by (doctor_consultation, item) rather than a stored flag on the
	# child row, so this can safely be called again later if new tests get
	# added to the same consultation without duplicating the earlier ones.
	frappe.has_permission("Doctor Consultation", "read", throw=True)

	already_converted = set(
		frappe.get_all(
			"Diagnostic Test", filters={"doctor_consultation": consultation}, pluck="item"
		)
	)

	created = []
	for row in frappe.get_all(
		"Suggested Test",
		filters={"parent": consultation},
		fields=["item", "test_type"],
		order_by="idx",
	):
		if row.item in already_converted:
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Diagnostic Test",
				"doctor_consultation": consultation,
				"item": row.item,
				"test_type": row.test_type,
			}
		)
		doc.insert()
		created.append(doc.name)

	return created


@frappe.whitelist()
def get_my_dashboard_stats():
	# "Visited" is defined as "this same doctor has already written a
	# consultation note for this visit" - the only signal available today,
	# since there's no separate visit-status field tracking the pipeline.
	doctor = frappe.db.get_value("Doctor Master", {"user": frappe.session.user}, "name")
	if not doctor:
		return {
			"linked": False,
			"assigned": 0,
			"visited": 0,
			"ready": 0,
			"waiting": 0,
			"assigned_visits": [],
			"visited_visits": [],
			"ready_visits": [],
			"waiting_visits": [],
		}

	assigned_visits = frappe.get_all(
		"Patient Visit",
		filters={"doctor_name": doctor},
		fields=["name", "patient_name", "registration_category"],
		order_by="creation desc",
	)
	assigned_names = [v.name for v in assigned_visits]

	consultation_by_visit = {}
	nurse_status_by_visit = {}
	nurse_intervention_by_visit = {}
	if assigned_names:
		consultation_by_visit = {
			c.patient_consultation: c.name
			for c in frappe.get_all(
				"Doctor Consultation",
				filters={"patient_consultation": ["in", assigned_names], "doctor": doctor},
				fields=["name", "patient_consultation"],
			)
		}
		# patient_registration on Nurse Interventions actually links to the
		# visit (see the field's own comment) - a visit can in principle have
		# more than one Nurse Interventions row, so "ready" means at least
		# one of them is Completed, not that all of them are. The Completed
		# one is preferred as the record to link to - it's the one with
		# actual vitals filled in, not a still-Pending placeholder.
		for row in frappe.get_all(
			"Nurse Interventions",
			filters={"patient_registration": ["in", assigned_names]},
			fields=["name", "patient_registration", "status"],
		):
			if row.status == "Completed":
				nurse_status_by_visit[row.patient_registration] = True
				nurse_intervention_by_visit[row.patient_registration] = row.name
			else:
				nurse_status_by_visit.setdefault(row.patient_registration, False)
				nurse_intervention_by_visit.setdefault(row.patient_registration, row.name)

	visited_names = set(consultation_by_visit.keys())
	not_yet_visited = [v for v in assigned_visits if v.name not in visited_names]
	ready_visits = [v for v in not_yet_visited if nurse_status_by_visit.get(v.name)]
	waiting_visits = [v for v in not_yet_visited if not nurse_status_by_visit.get(v.name)]
	visited_visits = [v for v in assigned_visits if v.name in visited_names]

	for v in ready_visits:
		v["nurse_intervention"] = nurse_intervention_by_visit.get(v.name)
	for v in visited_visits:
		v["consultation"] = consultation_by_visit.get(v.name)

	return {
		"linked": True,
		"assigned": len(assigned_visits),
		"visited": len(visited_names),
		"ready": len(ready_visits),
		"waiting": len(waiting_visits),
		# Capped - this is a quick-glance dashboard, not a full report; the
		# Patient Visit list (already filtered to this doctor) is where a
		# long backlog should actually be worked through.
		"assigned_visits": assigned_visits[:20],
		"visited_visits": visited_visits[:20],
		"ready_visits": ready_visits[:20],
		"waiting_visits": waiting_visits[:20],
	}
