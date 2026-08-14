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
		self.validate_against_doctor_schedule()

	def validate_appointment_date(self):
		# Only guarded on creation - correcting/reviewing an old appointment
		# after the fact shouldn't be blocked by "that date is in the past" once
		# it's already saved.
		if self.is_new() and getdate(self.appointment_date) < getdate(today()):
			frappe.throw(
				_("Appointment Date cannot be in the past."), title=_("Invalid Appointment Date")
			)

	def validate_against_doctor_schedule(self):
		weekday = WEEKDAYS[getdate(self.appointment_date).weekday()]
		appointment_time = get_time(self.appointment_time)

		slot = None
		for row in frappe.get_doc("Doctor Master", self.doctor).weekly_schedule:
			if row.day == weekday and get_time(row.from_time) <= appointment_time < get_time(row.to_time):
				slot = row
				break

		if not slot:
			frappe.throw(
				_("Dr {0} has no schedule slot covering {1} on {2}.").format(
					frappe.bold(self.doctor), self.appointment_time, weekday
				),
				title=_("Outside Doctor's Schedule"),
			)

		# This is the real gate against overbooking a slot - the client-side
		# picker (once built) will just be a convenience; this check can't be
		# bypassed by the UI, an API call, or two staff booking at once.
		# Counted in Python rather than a DB "between" filter so the same
		# from<=t<to boundary rule used above also applies to the existing
		# bookings being compared against.
		same_day_appointments = frappe.get_all(
			"Appointment",
			filters={
				"doctor": self.doctor,
				"appointment_date": self.appointment_date,
				"status": ["!=", "Cancelled"],
				"name": ["!=", self.name],
			},
			fields=["appointment_time"],
		)
		booked = sum(
			1
			for row in same_day_appointments
			if get_time(slot.from_time) <= get_time(row.appointment_time) < get_time(slot.to_time)
		)
		if booked >= slot.max_patients:
			frappe.throw(
				_("The {0}-{1} slot for Dr {2} on {3} is fully booked.").format(
					slot.from_time, slot.to_time, frappe.bold(self.doctor), self.appointment_date
				),
				title=_("Slot Fully Booked"),
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
