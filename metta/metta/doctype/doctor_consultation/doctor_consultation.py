# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DoctorConsultation(Document):
	def validate(self):
		self.validate_doctor_matches_session_user()
		self.validate_visit_assigned_to_doctor()

	def on_update(self):
		self.route_referral()

	def route_referral(self):
		# A doctor's dashboard queue is driven entirely by Patient Visit.doctor_name -
		# reassigning it here is what actually routes the patient to the referred
		# doctor's queue on Save, the same field change front desk would otherwise
		# make by hand. Skipped for a self-referral (picking your own name), and
		# skipped once the visit is already assigned there, so a later unrelated
		# edit to this same note doesn't keep re-triggering it pointlessly.
		if not self.referred_to or self.referred_to == self.doctor:
			return
		current_doctor = frappe.db.get_value("Patient Visit", self.patient_consultation, "doctor_name")
		if current_doctor == self.referred_to:
			return
		frappe.db.set_value("Patient Visit", self.patient_consultation, "doctor_name", self.referred_to)

		# Same signal Patient Visit.after_insert() uses for a fresh assignment -
		# an already-open dashboard for the referred doctor picks up the new
		# "Referred to Me" entry right away, instead of only on their next
		# manual Refresh.
		doctor_user = frappe.db.get_value("Doctor Master", self.referred_to, "user")
		if doctor_user:
			frappe.publish_realtime("doctor_dashboard_update", user=doctor_user, after_commit=True)

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
		#
		# Only enforced on creation - a referral (see route_referral below)
		# reassigns the visit to another doctor right after this note is saved,
		# so re-editing your own already-written note afterwards would
		# otherwise start failing this check even though it's still your note.
		if not self.is_new():
			return

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
	# A referral makes the note visible to the doctor it was referred to as
	# well as its own author - without the OR, "Referred to Me" on the
	# dashboard would link to a consultation the receiving doctor can't
	# actually open.
	escaped_doctor = frappe.db.escape(doctor)
	return f"""(`tabDoctor Consultation`.doctor = {escaped_doctor} OR `tabDoctor Consultation`.referred_to = {escaped_doctor})"""


def has_permission(doc, ptype, user):
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Doctor" not in roles:
		return True

	# Opening a Form directly by URL passes just the docname, not a loaded
	# Document - every other caller already passes the doc, so this only
	# ever does the extra fetch on that one path.
	if isinstance(doc, (str, int)):
		doc = frappe.get_doc("Doctor Consultation", doc)

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	return bool(doctor) and (doc.doctor == doctor or doc.referred_to == doctor)


# Returns just the prescription fragment so the client can show it in a dialog instead of navigating to Frappe's print view - mirrors get_receipt_html() on Patient Visit.
@frappe.whitelist()
def get_prescription_html(consultation):
	doc = frappe.get_doc("Doctor Consultation", consultation)
	doc.check_permission("read")
	# Print Format itself is locked down to System Manager only (its HTML/Jinja
	# isn't meant for general browsing) - get_cached_doc skips that check,
	# same as Frappe's own print rendering does, since the check that
	# actually matters here already happened above on the Consultation itself.
	print_format = frappe.get_cached_doc("Print Format", "Doctor Consultation Prescription")
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
			"referred": 0,
			"admitted": 0,
			"assigned_visits": [],
			"visited_visits": [],
			"ready_visits": [],
			"waiting_visits": [],
			"referred_visits": [],
			"admitted_visits": [],
			"discharge_pending_visits": [],
			"appointments_today": [],
			"referred_to_me": [],
			"leave": None,
		}

	today = frappe.utils.today()

	# Today's queue - the daily worklist, not an ever-growing all-time count.
	assigned_visits_today = frappe.get_all(
		"Patient Visit",
		filters={"doctor_name": doctor, "creation": [">=", today]},
		fields=["name", "patient_name", "registration_category"],
		order_by="creation desc",
	)

	# Referred to this doctor by another doctor - never date-scoped like the
	# queue above, since a referral nobody's actioned yet shouldn't just drop
	# out of view after today. `doctor_name = doctor` confirms the referral
	# actually took effect (and is still the current assignment, not since
	# moved on again) - kept out of assigned/waiting/ready below so a referred
	# patient shows in exactly one place, not double-counted in both.
	referred_visit_names = set(
		frappe.get_all("Doctor Consultation", filters={"referred_to": doctor}, pluck="patient_consultation")
	)
	referred_visits = []
	if referred_visit_names:
		referred_visits = frappe.get_all(
			"Patient Visit",
			filters={"name": ["in", list(referred_visit_names)], "doctor_name": doctor},
			fields=["name", "patient_name", "registration_category"],
			order_by="modified desc",
		)
	referred_names = {v.name for v in referred_visits}

	assigned_visits = [v for v in assigned_visits_today if v.name not in referred_names]
	assigned_names = [v.name for v in assigned_visits]

	consultation_by_visit = {}
	nurse_status_by_visit = {}
	nurse_intervention_by_visit = {}
	# Referred visits need to be checked too - once this doctor has actually
	# written their own note for one, it's no longer a pending referral.
	relevant_names = assigned_names + [n for n in referred_names if n not in assigned_names]
	if relevant_names:
		consultation_by_visit = {
			c.patient_consultation: c.name
			for c in frappe.get_all(
				"Doctor Consultation",
				filters={"patient_consultation": ["in", relevant_names], "doctor": doctor},
				fields=["name", "patient_consultation"],
			)
		}
	if assigned_names:
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
	# Drops off "Referred to Me" the moment this doctor finishes the
	# consultation - same "visited" signal used above, nothing extra to track.
	referred_visits = [v for v in referred_visits if v.name not in visited_names]

	for v in ready_visits:
		v["nurse_intervention"] = nurse_intervention_by_visit.get(v.name)
	for v in visited_visits:
		v["consultation"] = consultation_by_visit.get(v.name)

	# Admitted (IP) - a live census of who's currently under this doctor's
	# care, not scoped to today like the queue above.
	admitted_visits = frappe.get_all(
		"Patient Visit",
		filters={"doctor_name": doctor, "registration_category": "IP", "admission_status": "Admitted"},
		fields=["name", "patient_name", "registration_category"],
		order_by="admission_date desc",
	)

	# Discharged under this doctor but no Discharge Summary written yet.
	discharged_visits = frappe.get_all(
		"Patient Visit",
		filters={"doctor_name": doctor, "registration_category": "IP", "admission_status": "Discharged"},
		fields=["name", "patient_name", "discharge_date"],
		order_by="discharge_date desc",
	)
	has_summary = set()
	if discharged_visits:
		has_summary = set(
			frappe.get_all(
				"Discharge Summary",
				filters={"patient_visit": ["in", [v.name for v in discharged_visits]]},
				pluck="patient_visit",
			)
		)
	discharge_pending_visits = [v for v in discharged_visits if v.name not in has_summary]

	# Another doctor referred this patient to *this* doctor - `doctor` on
	# these rows is the referring doctor, not this one, so this has to be its
	# own frappe.get_all (bypassing the "doctor = own doctor" row filter),
	# same continuity-of-care exception get_patient_history already relies on.
	referred_to_me = frappe.get_all(
		"Doctor Consultation",
		filters={"referred_to": doctor},
		fields=["name", "patient_consultation", "patient_name", "doctor", "consultation_datetime", "diagnosis"],
		order_by="consultation_datetime desc",
	)

	appointments_today = frappe.get_all(
		"Appointment",
		filters={"doctor": doctor, "appointment_date": today, "status": ["!=", "Cancelled"]},
		fields=["name", "patient_name", "appointment_time", "status", "reason_for_visit", "patient_visit"],
		order_by="appointment_time asc",
	)

	# The nearest leave record that hasn't fully lapsed yet - covering today
	# or still upcoming - so the banner only shows when it's actually relevant.
	leave_rows = frappe.get_all(
		"Doctor Leave",
		filters={"doctor": doctor, "to_date": [">=", today]},
		fields=["from_date", "to_date"],
		order_by="from_date asc",
		limit=1,
	)
	leave = leave_rows[0] if leave_rows else None

	return {
		"linked": True,
		"assigned": len(assigned_visits),
		"visited": len(visited_names),
		"ready": len(ready_visits),
		"waiting": len(waiting_visits),
		"referred": len(referred_visits),
		"admitted": len(admitted_visits),
		# Capped - this is a quick-glance dashboard, not a full report; the
		# Patient Visit list (already filtered to this doctor) is where a
		# long backlog should actually be worked through.
		"assigned_visits": assigned_visits[:20],
		"visited_visits": visited_visits[:20],
		"ready_visits": ready_visits[:20],
		"waiting_visits": waiting_visits[:20],
		"referred_visits": referred_visits[:20],
		"admitted_visits": admitted_visits[:20],
		"discharge_pending_visits": discharge_pending_visits[:20],
		"appointments_today": appointments_today[:20],
		"referred_to_me": referred_to_me[:20],
		"leave": leave,
	}


@frappe.whitelist()
def get_my_profile():
	# Read-only, self-service - a Doctor looking at their own dashboard sees
	# exactly what's on file for them, nothing more.
	return frappe.db.get_value(
		"Doctor Master",
		{"user": frappe.session.user},
		["name", "department", "specialization", "qualification", "registration_number", "mobile", "email"],
		as_dict=True,
	)


@frappe.whitelist()
def apply_my_leave(from_date, to_date, reason=None):
	# Self-service - always against the caller's own Doctor Master record,
	# never one they pass in, so a Doctor can only ever apply leave for
	# themselves.
	doctor = frappe.db.get_value("Doctor Master", {"user": frappe.session.user}, "name")
	if not doctor:
		frappe.throw(_("Your account isn't linked to a Doctor Master record."))

	leave = frappe.get_doc(
		{
			"doctype": "Doctor Leave",
			"doctor": doctor,
			"from_date": from_date,
			"to_date": to_date,
			"reason": reason,
		}
	)
	leave.insert()
	return {"name": leave.name}


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def prescribable_item_query(doctype, txt, searchfield, start, page_len, filters):
	# Same "must actually be in stock" rule as the search widget above,
	# applied to the Prescription table's own Item Link field too, so typing
	# directly into a row can't slip past the same check.
	frappe.has_permission("Doctor Consultation", "read", throw=True)
	from metta.sales.doctype.billing.billing import get_pharmacy_warehouse

	warehouse = get_pharmacy_warehouse()
	if not warehouse:
		return []

	return frappe.db.sql(
		"""
		SELECT DISTINCT i.name, i.item_name
		FROM `tabItem` i
		INNER JOIN `tabStock Balance` sb ON sb.item = i.name AND sb.warehouse = %(warehouse)s AND sb.actual_qty > 0
		WHERE i.item_type = 'Medicine' AND i.is_active = 1 AND i.item_name LIKE %(txt)s
		ORDER BY i.item_name
		LIMIT %(page_len)s OFFSET %(start)s
		""",
		{"warehouse": warehouse, "txt": f"%{txt}%", "start": start, "page_len": page_len},
	)


@frappe.whitelist()
def search_services_for_consultation(search_term=""):
	# Same "must be a real, priced Service item" rule as suggested_tests' own
	# Link query filter - services aren't stock-tracked like Medicine, so
	# there's no warehouse/qty check here, just item_type and is_active.
	frappe.has_permission("Doctor Consultation", "read", throw=True)

	values = {"limit": 20}
	search_condition = ""
	if search_term:
		search_condition = "AND item_name LIKE %(search_term)s"
		values["search_term"] = f"%{search_term}%"

	return frappe.db.sql(
		f"""
		SELECT name AS item_code, item_name
		FROM `tabItem`
		WHERE item_type = 'Service' AND is_active = 1
		{search_condition}
		ORDER BY item_name
		LIMIT %(limit)s
		""",
		values,
		as_dict=True,
	)


@frappe.whitelist()
def search_pharmacy_items_for_prescription(search_term=""):
	# A Doctor should only ever be offered what Pharmacy can actually hand
	# over right now - prescribing something with nothing left in stock just
	# pushes the problem downstream to Billing/Pharmacy discovering it later.
	# Only Medicine belongs on a prescription (see prescribed_items' own
	# query filter) - Consumables are dispensed separately, not prescribed.
	frappe.has_permission("Doctor Consultation", "read", throw=True)
	from metta.sales.doctype.billing.billing import get_pharmacy_warehouse

	warehouse = get_pharmacy_warehouse()
	if not warehouse:
		return []

	values = {"warehouse": warehouse, "limit": 20}
	search_condition = ""
	if search_term:
		search_condition = "AND i.item_name LIKE %(search_term)s"
		values["search_term"] = f"%{search_term}%"

	return frappe.db.sql(
		f"""
		SELECT DISTINCT i.name AS item_code, i.item_name, sb.actual_qty AS avail_qty, %(warehouse)s AS warehouse
		FROM `tabItem` i
		INNER JOIN `tabStock Balance` sb ON sb.item = i.name AND sb.warehouse = %(warehouse)s AND sb.actual_qty > 0
		WHERE i.item_type = 'Medicine' AND i.is_active = 1
		{search_condition}
		ORDER BY i.item_name
		LIMIT %(limit)s
		""",
		values,
		as_dict=True,
	)
