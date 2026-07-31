# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from metta.metta.doctype.patient_details.patient_details import calculate_age


class PatientRegistration(Document):
	def validate(self):
		self.validate_registration_category()
		self.validate_bed_availability()
		self.validate_room_availability()
		# Front-desk process requires checking Patient Details first: link the
		# existing record, or create one there if the patient is genuinely new.
		# Registration should never silently invent a patient - it must always
		# point at a real, deliberately-created Patient Details record.
		if not self.uhin_id:
			frappe.throw(
				_("Please select an existing patient, or create their Patient Details record first."),
				title=_("Patient Not Linked"),
			)
		self.update_age()

	def validate_registration_category(self):
		# The client hides "IP" from the dropdown and locks the field after
		# save, but that's only a convenience - this is the check an API call
		# or import can't bypass.
		if self.is_new():
			# A brand-new IP registration is only ever valid coming from
			# "Admit Patient" on an existing OP visit, never picked from
			# scratch - that's what converted_from_registration proves.
			if self.registration_category == "IP" and not self.converted_from_registration:
				frappe.throw(
					_("A new registration must start as OP. Use \"Admit Patient\" on an existing OP visit to create an IP admission."),
					title=_("Invalid Registration Category"),
				)
			return

		# Once saved, Registration Category can never change - flipping it
		# would silently rewrite this visit's billing history instead of
		# creating the separate admission record "Admit Patient" is for.
		existing_category = frappe.db.get_value("Patient Registration", self.name, "registration_category")
		if existing_category and existing_category != self.registration_category:
			frappe.throw(
				_("Registration Category cannot be changed after saving. Use \"Admit Patient\" instead."),
				title=_("Invalid Registration Category"),
			)

	def update_age(self):
		dob = frappe.db.get_value("Patient Details", self.uhin_id, "dob")
		age = calculate_age(dob)
		self.age = str(age) if age is not None else ""

	def after_insert(self):
		# Every registered patient needs a triage/vitals check - creating this
		# up front (rather than waiting for a nurse to remember) is what makes
		# "Pending" status on Nurse Interventions a reliable worklist.
		frappe.get_doc(
			{
				"doctype": "Nurse Interventions",
				"patient_registration": self.name,
				"status": "Pending",
			}
		).insert(ignore_permissions=True)

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
			"Patient Registration",
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
				_("Bed {0} in ward {1} is already occupied by patient registration {2}.").format(
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
			"Patient Registration",
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
				_("Bed {0} in room {1} is already occupied by patient registration {2}.").format(
					frappe.bold(self.room_bed_no), frappe.bold(self.room), frappe.bold(existing)
				),
				title=_("Bed Already Occupied"),
			)

# Returns just the receipt fragment so the client can show it in a dialog instead of navigating to Frappe's print view.
@frappe.whitelist()
def get_receipt_html(registration):
	doc = frappe.get_doc("Patient Registration", registration)
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
	frappe.has_permission("Patient Registration", "read", throw=True)
	if not ward or not bed_no:
		return {"occupied": False}
	filters = {"ward": ward, "bed_no": bed_no, "admission_status": "Admitted"}
	if registration:
		filters["name"] = ["!=", registration]
	existing = frappe.db.get_value("Patient Registration", filters, "name")
	return {"occupied": bool(existing), "occupied_by": existing}


@frappe.whitelist()
def get_admission_defaults(op_registration):
	# Only the patient and consulting doctor carry over automatically - ward/
	# bed, registration type, and billing are genuinely different for an
	# admission and are deliberately left blank for whoever is admitting the
	# patient to fill in fresh, not copied from the OP visit.
	op = frappe.get_doc("Patient Registration", op_registration)
	op.check_permission("read")
	if op.registration_category != "OP":
		frappe.throw(_("Only an OP registration can be converted into an admission."))
	return {
		"uhin_id": op.uhin_id,
		"doctor_name": op.doctor_name,
		"converted_from_registration": op.name,
	}


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
	frappe.has_permission("Patient Registration", "read", throw=True)
	if not room or not room_bed_no:
		return {"occupied": False}
	filters = {"room": room, "room_bed_no": room_bed_no, "admission_status": "Admitted"}
	if registration:
		filters["name"] = ["!=", registration]
	existing = frappe.db.get_value("Patient Registration", filters, "name")
	return {"occupied": bool(existing), "occupied_by": existing}
