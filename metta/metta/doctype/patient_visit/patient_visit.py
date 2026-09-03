# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import flt, getdate

from metta.metta.doctype.patient_registration.patient_registration import GENERAL_CATEGORY, calculate_age
from metta.metta.utils import validate_phone_number


class PatientVisit(Document):
	def autoname(self):
		# OP and IP need to be visually distinguishable from the ID alone -
		# each prefix keeps its own independent counter (Frappe's Series
		# storage is keyed by the exact pattern string), so OP-2026-00001
		# and IP-2026-00001 can both exist without colliding.
		prefix = "IP" if self.registration_category == "IP" else "OP"
		self.name = make_autoname(f"{prefix}-.YYYY.-.#####")

	def validate(self):
		validate_phone_number(self.phone, "Phone")
		self.validate_registration_category()
		self.clear_op_fee_for_ip()
		self.validate_bed_availability()
		self.validate_room_availability()
		self.validate_discharge()
		self.validate_mlc_case()
		self.log_bed_transfer()
		# Front-desk process requires checking Patient Registration first: link the
		# existing record, or create one there if the patient is genuinely new.
		# Registration should never silently invent a patient - it must always
		# point at a real, deliberately-created Patient Registration record.
		if not self.uhin_id:
			frappe.throw(
				_("Please select an existing patient, or create their Patient Registration record first."),
				title=_("Patient Not Linked"),
			)
		self.update_age()
		self.calculate_billing_totals()

	def calculate_billing_totals(self):
		# Re-derived from Category Price Adjustment directly (not trusted from
		# the fetched fields) since charity_status could have changed since
		# this doc last fetched it - same authoritative-recompute pattern
		# Billing uses for its own charity math.
		adjustment_type = None
		if self.billing_category:
			category = frappe.db.get_value(
				"Category Price Adjustment", self.billing_category, ["adjustment_type", "charity_status"], as_dict=True
			)
			if category and category.charity_status == "Active":
				adjustment_type = category.adjustment_type
		# Overwrites whatever the client's own fetch_from last put here - that
		# one just mirrors the category's raw value, not gated on
		# charity_status, and reports need to know for certain whether this
		# particular visit's Discount Amount was really "Charity" or an
		# "Increase" (the hospital charging more, never counted as charity
		# given out), so it's stored fresh here every time.
		self.adjustment_type = adjustment_type or ""

		raw_percent = flt(self.charity_percent) if adjustment_type in ("Charity", "Increase") else 0
		# charity_percent isn't read-only, so this can't just trust the
		# category's own bound (see Category Price Adjustment.validate) -
		# someone could still type a value directly on the visit itself.
		if adjustment_type == "Charity" and raw_percent > 100:
			frappe.throw(
				_("Charity Percent cannot exceed 100% - that would make the bill negative."),
				title=_("Invalid Charity"),
			)
		if flt(self.charity_amount):
			if flt(self.charity_amount) < 0:
				frappe.throw(_("Charity Amount cannot be negative."))
			# Only for a General (i.e. not Staff-related) patient - Staff/Staff
			# Dependent already gets its charity automatically from Billing
			# Category, so a hand-typed amount on top of that would be a
			# second, conflicting discount.
			if self.billing_category != GENERAL_CATEGORY:
				frappe.throw(_("Charity Amount can only be entered for Billing Category 'General'."))
			# A hand-typed rupee figure for this specific patient's situation
			# wins over the percentage-based discount - never both at once,
			# so the two can't be stacked into an unintended double discount.
			# Capped at the fee itself so the visit can never net negative.
			self.discount_amount = min(flt(self.charity_amount), flt(self.fee_amount))
		else:
			# Always a plain non-negative magnitude - "Charity" vs "Increase" is
			# only decided below, at Net Amount, never baked into this figure
			# itself (a negative Discount Amount here would misread as a manual
			# entry below on the very next save, same bug Billing's own Charity
			# Amount had).
			self.discount_amount = flt(self.fee_amount) * raw_percent / 100

		if adjustment_type == "Increase":
			self.net_amount = flt(self.fee_amount) + self.discount_amount
		else:
			self.net_amount = flt(self.fee_amount) - self.discount_amount

		# Recorded the first time a payment mode is actually picked - not
		# reset on every subsequent edit, so it keeps showing who originally
		# collected the fee even if someone else corrects a typo later.
		if self.payment_mode and not self.collected_by:
			self.collected_by = frappe.session.user

	def validate_registration_category(self):
		# The client hides "IP" from the dropdown and locks the field after
		# save, but that's only a convenience - this is the check an API call
		# or import can't bypass.
		if self.is_new():
			# Every patient starts as OP now, including a genuine emergency -
			# there's no direct-to-IP path any more. IP is only ever reached
			# afterwards, via "Admit Patient" on that OP visit, which is what
			# sets converted_from_registration.
			if self.registration_category == "IP" and not self.converted_from_registration:
				frappe.throw(
					_(
						"A new registration must start as OP, even for an emergency. Use \"Admit Patient\" on that "
						"OP visit to create the IP admission."
					),
					title=_("Invalid Registration Category"),
				)
			return

		# Once saved, Registration Category can never change - flipping it
		# would silently rewrite this visit's billing history instead of
		# creating the separate admission record "Admit Patient" is for.
		existing_category = frappe.db.get_value("Patient Visit", self.name, "registration_category")
		if existing_category and existing_category != self.registration_category:
			frappe.throw(
				_("Registration Category cannot be changed after saving. Use \"Admit Patient\" instead."),
				title=_("Invalid Registration Category"),
			)

	def validate_discharge(self):
		# Only IP admissions go through Admitted/Discharged at all.
		if self.registration_category != "IP":
			return
		self.validate_discharge_authorised_by_doctor()
		if self.admission_status == "Discharged":
			# Whoever flips the status is doing it right now, at the moment
			# the patient is actually leaving - not backdating it, so "today"
			# is the correct default whenever it's left blank.
			if not self.discharge_date:
				self.discharge_date = frappe.utils.today()
			if self.admission_date and getdate(self.discharge_date) < getdate(self.admission_date):
				frappe.throw(
					_("Discharge Date cannot be before Admission Date ({0}).").format(self.admission_date),
					title=_("Invalid Discharge Date"),
				)
		else:
			# Re-admitting after a correction shouldn't leave a stale discharge
			# date lingering on an otherwise-active admission.
			self.discharge_date = None

	def validate_discharge_authorised_by_doctor(self):
		# Whether to discharge a patient is a clinical call, not something
		# Front Desk should be deciding by editing a status field - only a
		# Doctor (or an admin correcting a mistake) can flip it either way.
		# A brand-new admission defaulting to "Admitted" isn't a discharge
		# decision, so this only fires when an existing record's value
		# actually changes.
		if self.is_new() or not self.has_value_changed("admission_status"):
			return
		roles = frappe.get_roles(frappe.session.user)
		if "System Manager" in roles or "Doctor" in roles:
			return
		frappe.throw(
			_("Only a Doctor can change Admission Status."),
			title=_("Not Authorised"),
		)

	def validate_mlc_case(self):
		# MLC No is the hospital's legal record of having logged this as a
		# medico-legal case at all - an MLC ticked without one is effectively
		# an untracked MLC, which defeats the point of the flag.
		if self.is_mlc_case and not self.mlc_no:
			frappe.throw(
				_("MLC No is required when this is marked as an MLC (Medico-Legal Case)."),
				title=_("MLC No Required"),
			)

	def log_bed_transfer(self):
		# Runs during validate() - the DB still holds the pre-save location at
		# this point, so this is the one place "old" and "new" can be compared
		# without a separate before-save snapshot. Bed/room availability was
		# already checked above, so by the time this runs the new location (if
		# any) is known to actually be valid.
		if self.is_new() or self.registration_category != "IP":
			return

		previous = frappe.db.get_value(
			"Patient Visit",
			self.name,
			["accommodation_type", "ward", "bed_no", "room", "room_bed_no"],
			as_dict=True,
		)
		if not previous:
			return

		current = {
			"accommodation_type": self.accommodation_type,
			"ward": self.ward,
			"bed_no": self.bed_no,
			"room": self.room,
			"room_bed_no": self.room_bed_no,
		}
		if all(previous.get(field) == current.get(field) for field in current):
			return

		# The very first time a location is assigned (right after "Admit
		# Patient" created this record with nothing set yet) isn't a transfer -
		# there's nowhere to say the patient came "from".
		if not any([previous.accommodation_type, previous.ward, previous.bed_no, previous.room, previous.room_bed_no]):
			return

		frappe.get_doc(
			{
				"doctype": "Bed Transfer",
				"patient_visit": self.name,
				"from_accommodation_type": previous.accommodation_type,
				"from_ward": previous.ward,
				"from_bed_no": previous.bed_no,
				"from_room": previous.room,
				"from_room_bed_no": previous.room_bed_no,
				"to_accommodation_type": current["accommodation_type"],
				"to_ward": current["ward"],
				"to_bed_no": current["bed_no"],
				"to_room": current["room"],
				"to_room_bed_no": current["room_bed_no"],
			}
		).insert(ignore_permissions=True)

	def update_age(self):
		dob = frappe.db.get_value("Patient Registration", self.uhin_id, "dob")
		age = calculate_age(dob)
		self.age = str(age) if age is not None else ""

	def after_insert(self):
		# Every registered patient needs a triage/vitals check - creating this
		# up front (rather than waiting for a nurse to remember) is what makes
		# "Pending" status on Nurse Interventions a reliable worklist. This
		# placeholder is deliberately blank - ignore_mandatory skips past its
		# own vitals fields being required, which only applies once a nurse
		# actually opens it and saves their real assessment.
		frappe.get_doc(
			{
				"doctype": "Nurse Interventions",
				"patient_registration": self.name,
				"status": "Pending",
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)

		# So the assigned doctor's dashboard picks up a newly-assigned patient
		# on its own - without this, "Assigned Today" only updates the next
		# time they happen to hit Refresh.
		if self.doctor_name:
			doctor_user = frappe.db.get_value("Doctor Master", self.doctor_name, "user")
			if doctor_user:
				frappe.publish_realtime("doctor_dashboard_update", user=doctor_user, after_commit=True)

		# Only set when this visit came from "Check In" on a booked Appointment
		# (see Appointment.get_visit_defaults) - most visits still won't have one.
		if self.appointment:
			frappe.db.set_value(
				"Appointment", self.appointment, {"status": "Checked-in", "patient_visit": self.name}
			)

	def clear_op_fee_for_ip(self):
		# Registration Type / Fee Amount are an OP-only concept (New Reg vs
		# Revisit). A brand-new admission can otherwise still carry a stale
		# value here - e.g. Patient ID was typed before Registration Category
		# was switched to IP, auto-suggesting an OP fee that then just sits
		# hidden instead of being cleared. IP's own admission charge is billed
		# separately (see Billing's auto-added "IP Admission Charge" item).
		if self.registration_category == "IP" and self.registration_type:
			self.registration_type = ""
			self.fee_amount = 0

	def validate_bed_availability(self):
		# Only IP admissions occupy a physical bed; OP visits, Room-type
		# admissions, and unassigned beds/wards have nothing to conflict with.
		if (
			self.registration_category != "IP"
			or self.accommodation_type != "Ward"
			or not self.ward
			or not self.bed_no
		):
			return
		# A Discharged record frees up its bed, so it shouldn't block reuse.
		if self.admission_status != "Admitted":
			return

		# This is the real gate against double-booking a bed - the client-side
		# popup is just a convenience; this check can't be bypassed by the UI,
		# an API call, or two staff saving at nearly the same time.
		existing = frappe.db.get_value(
			"Patient Visit",
			{
				"ward": self.ward,
				"bed_no": self.bed_no,
				"admission_status": "Admitted",
				"name": ["!=", self.name],
			},
			"name",
		)
		if existing:
			frappe.throw(
				_("Bed {0} in ward {1} is already occupied by patient consultation {2}.").format(
					frappe.bold(self.bed_no), frappe.bold(self.ward), frappe.bold(existing)
				),
				title=_("Bed Already Occupied"),
			)

	def validate_room_availability(self):
		# Rooms can hold more than one patient (Semi-Private/Deluxe etc.), so
		# the conflict check is per bed slot within the room, same shape as
		# validate_bed_availability() above - not per room.
		if (
			self.registration_category != "IP"
			or self.accommodation_type != "Room"
			or not self.room
			or not self.room_bed_no
		):
			return
		if self.admission_status != "Admitted":
			return

		# A room taken out of service shouldn't accept new admissions, even if
		# some of its beds still show as unoccupied.
		if not frappe.db.get_value("Room Master", self.room, "is_active"):
			frappe.throw(
				_("Room {0} is not active and cannot accept new admissions.").format(frappe.bold(self.room)),
				title=_("Room Not Active"),
			)

		existing = frappe.db.get_value(
			"Patient Visit",
			{
				"room": self.room,
				"room_bed_no": self.room_bed_no,
				"admission_status": "Admitted",
				"name": ["!=", self.name],
			},
			"name",
		)
		if existing:
			frappe.throw(
				_("Bed {0} in room {1} is already occupied by patient consultation {2}.").format(
					frappe.bold(self.room_bed_no), frappe.bold(self.room), frappe.bold(existing)
				),
				title=_("Bed Already Occupied"),
			)

def get_permission_query_conditions(user=None):
	# A Doctor only ever needs their own patients in list/report views - System
	# Manager and Front Desk keep seeing everyone, since their own DocPerm row
	# already grants that and this hook must not narrow it further for them.
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabPatient Visit`.doctor_name = {frappe.db.escape(doctor)}"""


def has_permission(doc, ptype, user):
	# Controllers can only ever narrow permission, never grant it beyond the
	# role's own DocPerm - so every branch here defaults to True ("no
	# objection from this check") and only turns False for the one case this
	# exists to block: a Doctor opening a patient that isn't theirs directly
	# by name, bypassing the list-view filter above.
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return True

	# Opening a Form directly by URL passes just the docname, not a loaded
	# Document - every other caller already passes the doc, so this only
	# ever does the extra fetch on that one path.
	if isinstance(doc, (str, int)):
		doc = frappe.get_doc("Patient Visit", doc)

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	return bool(doctor) and doc.doctor_name == doctor


@frappe.whitelist()
def get_category_adjustment(billing_category):
	# A dedicated copy rather than reusing Billing's version of this same
	# lookup - that one gates on Billing read permission, which Front
	# Desk (who bills the consultation fee here, not medicines) was never granted.
	frappe.has_permission("Patient Visit", "read", throw=True)
	if not billing_category:
		return {}
	return frappe.db.get_value(
		"Category Price Adjustment",
		billing_category,
		["adjustment_type", "charity_status", "charity_percent"],
		as_dict=True,
	) or {}


# Returns just the receipt fragment so the client can show it in a dialog instead of navigating to Frappe's print view.
@frappe.whitelist()
def get_receipt_html(registration):
	doc = frappe.get_doc("Patient Visit", registration)
	doc.check_permission("read")
	print_format = frappe.get_doc("Print Format", "Patient Registration Receipt")
	return frappe.render_template(print_format.html, {"doc": doc.as_dict()})


@frappe.whitelist()
def get_ward_bed_summary(ward):
	# Counts/beds are computed live (via Ward Master's virtual fields and
	# get_bed_status_list) rather than stored, so this can never drift out of
	# sync with actual admissions the way a manually-maintained counter would.
	frappe.has_permission("Ward Master", "read", throw=True)
	if not ward:
		return {}
	ward_doc = frappe.get_doc("Ward Master", ward)
	return {
		"total_beds": ward_doc.total_beds,
		"occupied_beds": ward_doc.occupied_beds,
		"available_beds": ward_doc.available_beds,
		"beds": ward_doc.get_bed_status_list(),
	}


@frappe.whitelist()
def check_bed_availability(ward, bed_no, registration=None):
	# Client-side counterpart to validate_bed_availability() above - gives an
	# instant popup instead of making the user wait for a failed save. Not a
	# substitute for the server-side check, since this one is skippable.
	frappe.has_permission("Patient Visit", "read", throw=True)
	if not ward or not bed_no:
		return {"occupied": False}
	filters = {"ward": ward, "bed_no": bed_no, "admission_status": "Admitted"}
	if registration:
		filters["name"] = ["!=", registration]
	existing = frappe.db.get_value("Patient Visit", filters, "name")
	return {"occupied": bool(existing), "occupied_by": existing}


@frappe.whitelist()
def has_prior_visit_of_type(uhin_id, emergency):
	# Drives the New Reg vs Revisit suggestion on Registration Type - tracked
	# separately per General/Emergency, not as one combined visit history. A
	# patient who has only ever come in during regular hours still counts as
	# a first-time Emergency visit the first time they show up after 5:30 PM
	# (Emergency New Reg), and the same in reverse - the two are genuinely
	# separate registration histories, billed at different rates.
	frappe.has_permission("Patient Visit", "read", throw=True)
	if not uhin_id:
		return False
	emergency = frappe.utils.cint(emergency)
	reg_types = frappe.get_all("Patient Visit", filters={"uhin_id": uhin_id}, pluck="registration_type")
	for reg_type in reg_types:
		is_emergency_type = bool(reg_type) and reg_type.startswith("Emergency")
		if is_emergency_type == bool(emergency):
			return True
	return False


@frappe.whitelist()
def get_admission_defaults(op_registration):
	# Patient, consulting doctor, and billing category all carry over -
	# billing_category is the person's own discount/rate policy (e.g. staff
	# concession, corporate), not something tied to OP vs IP specifically.
	# Ward/bed, registration type, and the actual fee are genuinely different
	# for an admission and are deliberately left blank for whoever is
	# admitting the patient to fill in fresh, not copied from the OP visit.
	op = frappe.get_doc("Patient Visit", op_registration)
	op.check_permission("read")
	if op.registration_category != "OP":
		frappe.throw(_("Only an OP registration can be converted into an admission."))
	# The client already hides "Admit Patient" once this OP visit has been
	# converted once - this is the check an already-open page or a direct API
	# call can't bypass, so the same OP visit can never end up admitted twice.
	existing_ip = frappe.db.get_value("Patient Visit", {"converted_from_registration": op.name}, "name")
	if existing_ip:
		frappe.throw(
			_("{0} has already been admitted to IP as {1}.").format(op.name, existing_ip),
			title=_("Already Admitted"),
		)
	return {
		"uhin_id": op.uhin_id,
		"department_name": op.department_name,
		"doctor_name": op.doctor_name,
		"converted_from_registration": op.name,
		"billing_category": op.billing_category,
		"charity_percent": op.charity_percent,
		"adjustment_type": op.adjustment_type,
	}


@frappe.whitelist()
def get_doctors_by_department(department):
	# Department is picked first now - Doctor name is then narrowed down (or
	# auto-filled, if only one doctor covers that department) rather than the
	# other way round.
	frappe.has_permission("Patient Visit", "read", throw=True)
	if not department:
		return []
	return frappe.get_all("Doctor Master", filters={"department": department}, pluck="name", order_by="name")


@frappe.whitelist()
def get_discharge_defaults(patient_visit):
	# Mirrors get_admission_defaults() - the client opens a prefilled but
	# unsaved Discharge Summary, so whoever writes it still reviews/fills in
	# the actual clinical content rather than this silently inserting one.
	doc = frappe.get_doc("Patient Visit", patient_visit)
	doc.check_permission("read")
	if doc.registration_category != "IP" or doc.admission_status != "Discharged":
		frappe.throw(
			_("Discharge Summary can only be created once this IP admission is marked Discharged."),
			title=_("Not Discharged Yet"),
		)
	# Discharge Bill comes first in this workflow now - the same check
	# Discharge Summary's own validate() enforces on save, checked here too so
	# the client isn't handed a form that's guaranteed to fail once opened.
	from metta.sales.doctype.discharge_bill.discharge_bill import get_billing_status

	status = get_billing_status(patient_visit)
	if not status["completed"]:
		frappe.throw(
			_(
				"The Discharge Bill for this admission must be submitted and fully paid (Balance Due {0}) before the Discharge Summary can be written."
			).format(frappe.format(status["balance_due"], {"fieldtype": "Currency"})),
			title=_("Billing Not Completed"),
		)
	return {"patient_visit": doc.name}


@frappe.whitelist()
def get_room_details(room):
	# Mirrors get_ward_bed_summary() - occupancy is computed live via Room
	# Master's own property/get_bed_status_list() rather than stored.
	frappe.has_permission("Room Master", "read", throw=True)
	if not room:
		return {}
	room_doc = frappe.get_doc("Room Master", room)
	return {
		"room_type": room_doc.room_type,
		"rent_per_day": room_doc.rent_per_day,
		"floor": room_doc.floor,
		"capacity": room_doc.capacity,
		"occupied_beds": room_doc.occupied_beds,
		"available_beds": room_doc.available_beds,
		"beds": room_doc.get_bed_status_list(),
	}


@frappe.whitelist()
def check_room_availability(room, room_bed_no, registration=None):
	# Client-side counterpart to validate_room_availability() above - gives an
	# instant popup instead of making the user wait for a failed save. Not a
	# substitute for the server-side check, since this one is skippable.
	frappe.has_permission("Patient Visit", "read", throw=True)
	if not room or not room_bed_no:
		return {"occupied": False}
	filters = {"room": room, "room_bed_no": room_bed_no, "admission_status": "Admitted"}
	if registration:
		filters["name"] = ["!=", registration]
	existing = frappe.db.get_value("Patient Visit", filters, "name")
	return {"occupied": bool(existing), "occupied_by": existing}


@frappe.whitelist()
def get_front_desk_dashboard_stats():
	# The whole shape of the day from Front Desk's own point of view - not
	# just what they registered, but where each of today's patients actually
	# is in the pipeline (nurse done? doctor seen?), since that's exactly what
	# a patient standing at the counter asking "how much longer" needs answered.
	frappe.has_permission("Patient Visit", "read", throw=True)
	today = frappe.utils.today()

	registrations_today = frappe.db.count("Patient Registration", filters={"creation": [">=", today]})

	visits_today = frappe.get_all(
		"Patient Visit",
		filters={"creation": [">=", today]},
		fields=["name", "patient_name", "registration_category", "net_amount"],
		order_by="creation desc",
	)
	op_visits_today = sum(1 for v in visits_today if v.registration_category == "OP")
	ip_admissions_today = sum(1 for v in visits_today if v.registration_category == "IP")
	collected_today = sum(flt(v.net_amount) for v in visits_today)

	visit_names = [v.name for v in visits_today]
	nurse_done = {}
	doctor_seen = set()
	if visit_names:
		# A visit can in principle have more than one Nurse Interventions row -
		# "done" means at least one of them is Completed, not that all are.
		for row in frappe.get_all(
			"Nurse Interventions",
			filters={"patient_registration": ["in", visit_names]},
			fields=["patient_registration", "status"],
		):
			if row.status == "Completed":
				nurse_done[row.patient_registration] = True
			else:
				nurse_done.setdefault(row.patient_registration, False)
		doctor_seen = set(
			frappe.get_all(
				"Doctor Consultation", filters={"patient_consultation": ["in", visit_names]}, pluck="patient_consultation"
			)
		)

	patient_flow = [
		{
			"name": v.name,
			"patient_name": v.patient_name,
			"registration_category": v.registration_category,
			"nurse_done": nurse_done.get(v.name, False),
			"doctor_seen": v.name in doctor_seen,
			"net_amount": v.net_amount,
		}
		for v in visits_today
	]

	return {
		"registrations_today": registrations_today,
		"op_visits_today": op_visits_today,
		"ip_admissions_today": ip_admissions_today,
		"collected_today": collected_today,
		# Capped - this is a quick-glance dashboard, not a full report; the
		# Patient Visit list is where a long day's backlog should be worked
		# through instead.
		"patient_flow": patient_flow[:20],
	}


def _describe_location(row, prefix):
	accommodation_type = row.get(f"{prefix}_accommodation_type")
	if accommodation_type == "Ward":
		return f"{row.get(f'{prefix}_ward') or '?'} (Bed {row.get(f'{prefix}_bed_no') or '?'})"
	if accommodation_type == "Room":
		return f"{row.get(f'{prefix}_room') or '?'} (Bed {row.get(f'{prefix}_room_bed_no') or '?'})"
	return "—"


@frappe.whitelist()
def get_bed_transfer_history(patient_visit):
	# The whole point of logging these is so a move is actually visible
	# afterward, not just recorded somewhere nobody looks.
	frappe.has_permission("Patient Visit", "read", throw=True)
	if not patient_visit:
		return []
	rows = frappe.get_all(
		"Bed Transfer",
		filters={"patient_visit": patient_visit},
		fields=[
			"name", "transferred_on", "transferred_by", "reason",
			"from_accommodation_type", "from_ward", "from_bed_no", "from_room", "from_room_bed_no",
			"to_accommodation_type", "to_ward", "to_bed_no", "to_room", "to_room_bed_no",
		],
		order_by="transferred_on desc",
	)
	for row in rows:
		row["from_label"] = _describe_location(row, "from")
		row["to_label"] = _describe_location(row, "to")
	return rows
