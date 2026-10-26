# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

# Server methods for the Vue IP / ward / front-desk screens (frontend/src/pages/Ward).
# Desk keeps working exactly as before - nothing here replaces a Desk form.

import frappe
from frappe import _

from metta.api import _clean, _insert_op_visit


@frappe.whitelist(methods=["POST"])
def check_in_appointment(appointment, visit):
	"""Appointment "Check In": the new OP Patient Visit, linked to the appointment.

	Why a method of its own: Desk's Check In opens a new Patient Visit with
	Appointment pre-set (a read-only field nobody can type). The Vue screen
	saves through metta.api's OP-visit insert instead, so the link has to be
	set here, on the server, from the appointment itself - never trusted from
	the browser. get_visit_defaults() is the same call Desk's button makes: it
	checks read permission and refuses anything but a Scheduled appointment.
	Patient Visit's own after_insert then flips the appointment to Checked-in.
	"""
	from metta.metta.doctype.appointment.appointment import get_visit_defaults

	defaults = get_visit_defaults(appointment)
	# Desk hides Check In from anyone who can't create a Patient Visit.
	frappe.has_permission("Patient Visit", "create", throw=True)

	reg = frappe.get_doc("Patient Registration", defaults["uhin_id"])
	reg.check_permission("read")

	values = _clean(frappe.parse_json(visit), "Patient Visit")
	values["appointment"] = defaults["appointment"]
	# Desk starts the form with the booked doctor; Front Desk may still change it.
	if not values.get("doctor_name"):
		values["doctor_name"] = defaults["doctor_name"]

	pv = _insert_op_visit(reg, values, visit_has_own_category=True)
	return {"patient_registration": reg.name, "patient_visit": pv.name}


@frappe.whitelist()
def get_bed_board():
	"""Every ward and room with its beds, for the Vue bed board (/hmis/wards). Read-only.

	Why a method of its own: Desk only ever shows one ward's (or room's) grid
	at a time, via get_ward_bed_summary()/get_room_details(), and those return
	bare Available/Occupied - no patient. The board needs every ward at once
	plus who is in each bed, so this reuses the very same occupancy logic
	(Ward Master / Room Master get_bed_status_list(), which count only
	Admitted IP visits) and adds the admitted visits on top.
	"""
	from frappe.utils import date_diff, today

	can_wards = frappe.has_permission("Ward Master", "read")
	can_rooms = frappe.has_permission("Room Master", "read")
	if not can_wards and not can_rooms:
		frappe.throw(_("Not permitted to view wards or rooms."), frappe.PermissionError)

	# get_list (not get_all) so Patient Visit's own permission rules apply -
	# a Doctor sees names only for their own patients; other occupied beds
	# still show as Occupied, from get_bed_status_list() below.
	visits = []
	if frappe.has_permission("Patient Visit", "read"):
		visits = frappe.get_list(
			"Patient Visit",
			filters={"registration_category": "IP", "admission_status": "Admitted"},
			fields=[
				"name", "patient_name", "uhin_id", "admission_date", "doctor_name",
				"accommodation_type", "ward", "bed_no", "room", "room_bed_no",
			],
			order_by="admission_date asc",
			limit_page_length=0,
		)
	now = today()
	for v in visits:
		v["days"] = date_diff(now, v.admission_date) if v.admission_date else None

	by_ward_bed, by_room_bed = {}, {}
	for v in visits:
		if v.ward:
			by_ward_bed.setdefault((v.ward, v.bed_no or ""), v)
		if v.room:
			by_room_bed.setdefault((v.room, v.room_bed_no or ""), v)

	def place_beds(doc, index, field, bed_field):
		beds = []
		listed = set()
		for bed in doc.get_bed_status_list():
			listed.add(bed["bed_no"])
			bed["visit"] = index.get((doc.name, bed["bed_no"])) if bed["status"] == "Occupied" else None
			beds.append(bed)
		# Admitted patients whose bed isn't on the master's list (no beds
		# enumerated yet, or a bed number typed by hand) - shown rather than
		# hidden, since nobody admitted should be missing from the board.
		unlisted = [v for v in visits if v.get(field) == doc.name and (v.get(bed_field) or "") not in listed]
		return beds, unlisted

	wards = []
	if can_wards:
		for name in frappe.get_all("Ward Master", pluck="name", order_by="name asc"):
			doc = frappe.get_doc("Ward Master", name)
			beds, unlisted = place_beds(doc, by_ward_bed, "ward", "bed_no")
			wards.append(
				{
					"name": doc.name,
					"total_beds": doc.total_beds or 0,
					"occupied_beds": doc.occupied_beds,
					"available_beds": doc.available_beds,
					"beds": beds,
					"unlisted": unlisted,
				}
			)

	rooms = []
	if can_rooms:
		for name in frappe.get_all("Room Master", pluck="name", order_by="name asc"):
			doc = frappe.get_doc("Room Master", name)
			beds, unlisted = place_beds(doc, by_room_bed, "room", "room_bed_no")
			rooms.append(
				{
					"name": doc.name,
					"room_type": doc.room_type,
					"floor": doc.floor,
					"is_active": doc.is_active,
					"capacity": doc.capacity or 0,
					"occupied_beds": doc.occupied_beds,
					"available_beds": doc.available_beds,
					"beds": beds,
					"unlisted": unlisted,
				}
			)

	# Admitted but no ward or room picked yet (fresh from "Admit Patient").
	unassigned = [v for v in visits if not v.ward and not v.room]
	return {"wards": wards, "rooms": rooms, "unassigned": unassigned}
