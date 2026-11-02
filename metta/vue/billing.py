# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

# Server method for the Vue Billing home (frontend/src/pages/Billing/BillingList.vue):
# today's doctor's orders still waiting to be paid at the Billing counter, as
# two queues - medicines (Pharmacy hands over only after payment) and lab tests
# (Lab takes the sample only after payment). Read-only; the bill itself is still
# made in BillingForm from the consultation, exactly as in Desk.

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate, now_datetime, nowdate, time_diff_in_seconds


@frappe.whitelist()
def get_billing_queue(date=None):
	"""Consultations on `date` (default today) whose medicines or tests are not paid yet, oldest first."""
	if not frappe.has_permission("Billing", "read"):
		frappe.throw(_("Not permitted to read Billing"), frappe.PermissionError)

	day = getdate(date or nowdate())
	# frappe.db (not get_list) because Billing Staff only need the counts and
	# names here, not read access to every consultation and visit field.
	consultations = frappe.db.get_all(
		"Doctor Consultation",
		filters={"consultation_datetime": ["between", [f"{day} 00:00:00", f"{day} 23:59:59"]]},
		fields=["name", "patient_consultation", "patient_name", "doctor", "consultation_datetime", "creation"],
		order_by="consultation_datetime asc",
	)
	if not consultations:
		return {"medicines": [], "lab": []}
	names = [c.name for c in consultations]

	medicines = {}
	for row in frappe.db.get_all(
		"Prescription Item", filters={"parenttype": "Doctor Consultation", "parent": ["in", names]}, fields=["parent"]
	):
		medicines[row.parent] = medicines.get(row.parent, 0) + 1

	tests = {}
	for row in frappe.db.get_all(
		"Suggested Test",
		filters={"parenttype": "Doctor Consultation", "parent": ["in", names]},
		fields=["parent", "item_name"],
		order_by="idx",
	):
		tests.setdefault(row.parent, []).append(row.item_name)

	# Paid = a submitted bill made from the consultation. A draft bill still
	# counts as waiting: the patient has not paid until it is submitted.
	paid, drafts = set(), {}
	for bill in frappe.db.get_all(
		"Billing",
		filters={"doctor_consultation": ["in", names], "docstatus": ["<", 2]},
		fields=["name", "doctor_consultation", "docstatus"],
	):
		if bill.docstatus == 1:
			paid.add(bill.doctor_consultation)
		else:
			drafts.setdefault(bill.doctor_consultation, bill.name)

	# Tests can also be paid by a bill made from the patient rather than the
	# consultation; Billing.on_submit then marks the Diagnostic Tests paid, so
	# a consultation whose ordered tests are all paid is not waiting for lab.
	test_paid = {}
	for dt in frappe.db.get_all(
		"Diagnostic Test",
		filters={"doctor_consultation": ["in", names], "status": ["!=", "Cancelled"]},
		fields=["doctor_consultation", "is_paid"],
	):
		test_paid[dt.doctor_consultation] = test_paid.get(dt.doctor_consultation, True) and bool(dt.is_paid)

	visits = {
		v.name: v
		for v in frappe.db.get_all(
			"Patient Visit",
			filters={"name": ["in", list({c.patient_consultation for c in consultations if c.patient_consultation})]},
			fields=["name", "uhin_id", "registration_category", "ward", "bed_no", "room", "room_bed_no"],
		)
	}

	now = now_datetime()
	med_rows, lab_rows = [], []
	for c in consultations:
		if c.name in paid:
			continue
		n_med = medicines.get(c.name, 0)
		lab_tests = [] if test_paid.get(c.name) else tests.get(c.name, [])
		if not n_med and not lab_tests:
			continue

		visit = visits.get(c.patient_consultation) or frappe._dict()
		ordered_at = get_datetime(c.consultation_datetime or c.creation)
		row = {
			"consultation": c.name,
			"visit": c.patient_consultation,
			"patient_name": c.patient_name,
			"uhin": visit.uhin_id,
			"doctor": c.doctor,
			"is_ip": visit.registration_category == "IP",
			"bed": visit.bed_no or visit.room_bed_no or visit.ward or visit.room or "",
			"ordered_at": ordered_at,
			"waiting_min": max(0, int(time_diff_in_seconds(now, ordered_at) // 60)),
			"medicines": n_med,
			"tests": lab_tests,
			"draft": drafts.get(c.name),
		}
		if n_med:
			med_rows.append(row)
		if lab_tests:
			lab_rows.append(row)

	return {"medicines": med_rows, "lab": lab_rows}
