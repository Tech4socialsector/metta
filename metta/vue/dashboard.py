# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

# Server method for the Vue Hospital Dashboard (/hmis/dashboard): one day of
# the whole hospital on one screen, for Admin and Management only.

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime, nowdate

from metta.metta.page.hospital_overview.hospital_overview import (
	_billing,
	_clinical_flow,
	_doctor_table,
	_dt_between,
	_expiry_rows,
	_low_stock_count,
)

DASHBOARD_ROLES = ("System Manager", "Management")


@frappe.whitelist()
def get_hospital_dashboard(date=None):
	"""Every department's figures for one day (default today), in one call.

	Why get_all (not get_list) throughout: the Management role is given no
	doctype permissions of its own - it only reads these totals. The role
	check below is the gate instead, so a Management user doesn't need read
	access to Patient Visit, Billing, Stock Balance ... just to see counts.
	The sums reuse the Hospital Overview helpers, so both screens agree.
	"""
	if not set(DASHBOARD_ROLES) & set(frappe.get_roles()):
		frappe.throw(_("Only Admin and Management can open the Hospital Dashboard."), frappe.PermissionError)

	day = getdate(date) if date else getdate(nowdate())
	flow = _clinical_flow(day, day, None)
	return {
		"date": str(day),
		"front_desk": _front_desk(day, flow),
		"doctors": _doctors(day, flow),
		"ward": _ward(day),
		"lab": _lab(day),
		"billing": _billing_day(day),
		"pharmacy": _pharmacy(),
	}


def _front_desk(day, flow):
	visits = frappe.get_all(
		"Patient Visit", filters=[_dt_between("creation", day, day)], fields=["name", "registration_category"]
	)
	op_visits = [v.name for v in visits if v.registration_category == "OP"]
	# "Waiting" = an OP visit of that day with no Doctor Consultation yet -
	# the same rule as the Front Desk list's Seen / Waiting pill.
	seen = set()
	if op_visits:
		seen = set(
			frappe.get_all(
				"Doctor Consultation", filters={"patient_consultation": ["in", op_visits]}, pluck="patient_consultation"
			)
		)
	waiting = [v for v in op_visits if v not in seen]
	return {
		"registrations": frappe.db.count("Patient Registration", filters=[_dt_between("creation", day, day)]),
		"op_visits": len(op_visits),
		"ip_visits": len(visits) - len(op_visits),
		"waiting_for_doctor": len(waiting),
		# Names for the card's drill-down: "no consultation yet" isn't a
		# stored field, so the list is opened with `name in [...]`.
		"waiting_visits": waiting[:200],
		"vitals_pending": flow["nurse_pending"],
	}


def _doctors(day, flow):
	return {
		"consultations": flow["seen_count"],
		"visits": flow["seen_total"],
		"seen_pct": flow["seen_pct"],
		"referrals": flow["referral_count"],
		"by_doctor": _doctor_table(day, day),
	}


def _ward(day):
	admitted = frappe.get_all(
		"Patient Visit",
		filters={"registration_category": "IP", "admission_status": "Admitted"},
		fields=["name", "ward", "bed_no", "room", "room_bed_no"],
	)
	# Beds come from the masters' own totals (Ward: total_beds, Room:
	# capacity of active rooms). A bed is in use only when the visit names
	# both the ward/room and the bed number; anyone admitted without a bed
	# yet is counted apart, so "occupied" never runs past the total.
	ward_beds = sum(frappe.get_all("Ward Master", pluck="total_beds")) or 0
	room_beds = sum(frappe.get_all("Room Master", filters={"is_active": 1}, pluck="capacity")) or 0
	in_bed = [a for a in admitted if (a.ward and a.bed_no) or (a.room and a.room_bed_no)]
	no_bed = [a.name for a in admitted if a not in in_bed]
	return {
		"admitted": len(admitted),
		"beds_total": ward_beds + room_beds,
		"beds_occupied": len(in_bed),
		"not_in_bed": len(no_bed),
		"not_in_bed_visits": no_bed[:200],
		"admissions": frappe.db.count("Patient Visit", filters={"admission_date": day}),
		"discharges": frappe.db.count(
			"Patient Visit", filters={"admission_status": "Discharged", "discharge_date": day}
		),
	}


def _lab(day):
	# Open work is counted as of now (not just that day's orders), since a
	# sample still pending from yesterday is still pending today.
	open_tests = frappe.get_all(
		"Diagnostic Test",
		filters={"status": ["in", ["Ordered", "Sample Collected", "Result Entered"]]},
		fields=["name", "status", "due_on"],
	)
	now = now_datetime()
	late = [t.name for t in open_tests if t.due_on and t.due_on < now]
	return {
		"ordered": frappe.db.count("Diagnostic Test", filters=[_dt_between("ordered_on", day, day)]),
		"awaiting_sample": len([t for t in open_tests if t.status == "Ordered"]),
		"in_progress": len([t for t in open_tests if t.status != "Ordered"]),
		"late": len(late),
		"late_tests": late[:200],
		"reported": frappe.db.count("Diagnostic Test", filters=[_dt_between("reported_on", day, day)]),
	}


def _billing_day(day):
	billing = _billing(day, day, None)
	unpaid = frappe.get_all(
		"Discharge Bill", filters={"docstatus": 1, "balance_due": [">", 0]}, pluck="balance_due"
	)
	return {
		"total_collected": billing["total_collected"],
		"by_mode": billing["collected_by_mode"],
		"advance_amount": billing["advance_collected_amount"],
		"advance_count": billing["advance_collected_count"],
		"discharge_due_count": len(unpaid),
		"discharge_due_amount": sum(flt(x) for x in unpaid),
	}


def _pharmacy():
	# Stock is "as of now" whatever day is picked - there is no stored
	# history of reorder levels or expiry status to look back on.
	expiry = _expiry_rows()
	low_stock = _low_stock_count()
	return {
		"low_stock": len(low_stock),
		"low_stock_names": low_stock[:200],
		"expiring_soon": len([r for r in expiry if r["status"] == "Expiring Soon"]),
		"expired": len([r for r in expiry if r["status"] == "Expired"]),
	}
