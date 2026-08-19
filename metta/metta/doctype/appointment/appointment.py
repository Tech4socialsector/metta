# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import get_time, getdate, today

# Index 0 = Monday, matching date.weekday() - kept as our own fixed list
# rather than strftime("%a") so the mapping can't drift with server locale.
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class Appointment(Document):
	def autoname(self):
		self.name = make_autoname("APT-.YYYY.-.#####")

	def validate(self):
		self.validate_appointment_date()
		self.validate_doctor_not_on_leave()
		self.validate_against_doctor_schedule()

	def validate_appointment_date(self):
		# Only guarded on creation - correcting/reviewing an old appointment
		# after the fact shouldn't be blocked by "that date is in the past" once
		# it's already saved.
		if self.is_new() and getdate(self.appointment_date) < getdate(today()):
			frappe.throw(
				_("Appointment Date cannot be in the past."), title=_("Invalid Appointment Date")
			)

	def validate_doctor_not_on_leave(self):
		# Checked ahead of validate_against_doctor_schedule() - a leave day
		# should surface as "on leave", not get masked by (or double-reported
		# alongside) the more generic "no schedule slot" message.
		if _is_on_leave(self.doctor, self.appointment_date):
			leave = frappe.db.get_value(
				"Doctor Leave",
				{
					"doctor": self.doctor,
					"from_date": ["<=", self.appointment_date],
					"to_date": [">=", self.appointment_date],
				},
				"reason",
			)
			frappe.throw(
				_("Dr {0} is on leave on {1}{2}.").format(
					frappe.bold(self.doctor), self.appointment_date, f" ({leave})" if leave else ""
				),
				title=_("Doctor On Leave"),
			)

	def validate_against_doctor_schedule(self):
		weekday = WEEKDAYS[getdate(self.appointment_date).weekday()]
		appointment_time = get_time(self.appointment_time)

		slot = _find_matching_slot(self.doctor, weekday, appointment_time)
		if not slot:
			frappe.throw(
				_("Dr {0} has no schedule slot covering {1} on {2}.").format(
					frappe.bold(self.doctor), self.appointment_time, weekday
				),
				title=_("Outside Doctor's Schedule"),
			)

		# This is the real gate against overbooking a slot - the client-side
		# picker is just a convenience; this check can't be bypassed by the
		# UI, an API call, or two staff booking at once.
		if _count_booked_in_slot(self.doctor, self.appointment_date, slot, exclude=self.name) >= slot.max_patients:
			frappe.throw(
				_("The {0}-{1} slot for Dr {2} on {3} is fully booked.").format(
					slot.from_time, slot.to_time, frappe.bold(self.doctor), self.appointment_date
				),
				title=_("Slot Fully Booked"),
			)


def _is_on_leave(doctor, appointment_date):
	return bool(
		frappe.db.exists(
			"Doctor Leave",
			{"doctor": doctor, "from_date": ["<=", appointment_date], "to_date": [">=", appointment_date]},
		)
	)


def _find_matching_slot(doctor, weekday, appointment_time):
	# Counted in Python rather than a DB query so the same from<=t<to
	# boundary rule is applied consistently everywhere a slot is looked up.
	for row in frappe.get_doc("Doctor Master", doctor).weekly_schedule:
		if row.day == weekday and get_time(row.from_time) <= appointment_time < get_time(row.to_time):
			return row
	return None


def _count_booked_in_slot(doctor, appointment_date, slot, exclude=None):
	filters = {"doctor": doctor, "appointment_date": appointment_date, "status": ["!=", "Cancelled"]}
	if exclude:
		filters["name"] = ["!=", exclude]
	rows = frappe.get_all("Appointment", filters=filters, fields=["appointment_time"])
	return sum(
		1 for row in rows if get_time(slot.from_time) <= get_time(row.appointment_time) < get_time(slot.to_time)
	)


def get_permission_query_conditions(user=None):
	# A Doctor only ever needs their own appointments in list/report views -
	# System Manager and Front Desk keep seeing everyone, matching the same
	# scoping Patient Visit uses.
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabAppointment`.doctor = {frappe.db.escape(doctor)}"""


def has_permission(doc, ptype, user):
	# Only ever narrows permission, never grants beyond the role's own
	# DocPerm - defaults to True ("no objection") and turns False only for
	# the case this exists to block: a Doctor opening an appointment that
	# isn't theirs directly by name, bypassing the list-view filter above.
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return True

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	return bool(doctor) and doc.doctor == doctor


@frappe.whitelist()
def get_visit_defaults(appointment):
	# Mirrors get_admission_defaults() on Patient Visit - the client opens a
	# prefilled but unsaved Patient Visit form with these, rather than this
	# silently inserting one itself, so Front Desk still reviews/completes
	# billing category etc. before it's actually created.
	doc = frappe.get_doc("Appointment", appointment)
	doc.check_permission("read")
	if doc.status != "Scheduled":
		frappe.throw(
			_("Only a Scheduled appointment can be checked in - this one is {0}.").format(doc.status),
			title=_("Cannot Check In"),
		)
	return {
		"uhin_id": doc.patient,
		"doctor_name": doc.doctor,
		"registration_category": "OP",
		"appointment": doc.name,
	}


@frappe.whitelist()
def get_available_doctors(appointment_date, appointment_time, exclude_appointment=None):
	# Anyone who can create an Appointment can see who's available to book -
	# this is exactly the picker they're choosing from, nothing more sensitive
	# (no leave reasons, no other patients' details are returned).
	frappe.has_permission("Appointment", "create", throw=True)

	if not appointment_date or not appointment_time:
		return []

	appointment_date = getdate(appointment_date)
	appointment_time = get_time(appointment_time)
	if appointment_date < getdate(today()):
		return []

	weekday = WEEKDAYS[appointment_date.weekday()]
	available = []
	for doctor in frappe.get_all("Doctor Master", pluck="name"):
		if _is_on_leave(doctor, appointment_date):
			continue
		slot = _find_matching_slot(doctor, weekday, appointment_time)
		if not slot:
			continue
		if _count_booked_in_slot(doctor, appointment_date, slot, exclude=exclude_appointment) >= slot.max_patients:
			continue
		available.append(doctor)
	return available


@frappe.whitelist()
def get_front_desk_dashboard_stats():
	frappe.has_permission("Appointment", "read", throw=True)
	day = getdate(today())

	appointments = frappe.get_all(
		"Appointment",
		filters={"appointment_date": day},
		fields=["name", "patient_name", "doctor", "appointment_time", "status"],
		order_by="appointment_time",
	)
	# "Completed" counts as checked-in too - that status only ever follows
	# from having been checked in first, it doesn't mean they never came.
	checkedin_appointments = [a for a in appointments if a.status in ("Checked-in", "Completed")]

	op_visits = frappe.get_all(
		"Patient Visit",
		filters={"registration_category": "OP", "date": day},
		fields=["name", "patient_name", "doctor_name"],
		order_by="creation desc",
	)
	ip_visits = frappe.get_all(
		"Patient Visit",
		filters={"registration_category": "IP", "admission_date": day},
		fields=["name", "patient_name", "doctor_name"],
		order_by="creation desc",
	)

	return {
		"appointments": len(appointments),
		"checkedin": len(checkedin_appointments),
		"op": len(op_visits),
		"ip": len(ip_visits),
		"appointments_list": appointments,
		"checkedin_list": checkedin_appointments,
		"op_list": op_visits,
		"ip_list": ip_visits,
	}
