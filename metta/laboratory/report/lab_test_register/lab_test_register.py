# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, now_datetime, time_diff_in_hours


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Test ID"), "fieldname": "name", "fieldtype": "Link", "options": "Diagnostic Test", "width": 140},
		{"label": _("Ordered On"), "fieldname": "ordered_on", "fieldtype": "Datetime", "width": 150},
		{"label": _("Patient"), "fieldname": "patient_name", "fieldtype": "Data", "width": 150},
		{"label": _("Visit"), "fieldname": "patient_visit", "fieldtype": "Link", "options": "Patient Visit", "width": 130},
		{"label": _("Test"), "fieldname": "item_name", "fieldtype": "Data", "width": 150},
		{"label": _("Department"), "fieldname": "department", "fieldtype": "Data", "width": 120},
		{"label": _("Sample ID"), "fieldname": "lab_sample", "fieldtype": "Link", "options": "Lab Sample", "width": 130},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 120},
		{"label": _("Paid"), "fieldname": "is_paid", "fieldtype": "Check", "width": 60},
		{"label": _("Collected On"), "fieldname": "sample_collected_on", "fieldtype": "Datetime", "width": 150},
		{"label": _("Reported On"), "fieldname": "reported_on", "fieldtype": "Datetime", "width": 150},
		{"label": _("TAT (Hours)"), "fieldname": "tat_hours", "fieldtype": "Float", "precision": 1, "width": 100},
		{"label": _("Late"), "fieldname": "late", "fieldtype": "Data", "width": 70},
		{"label": _("Verified By"), "fieldname": "verified_by", "fieldtype": "Link", "options": "User", "width": 150},
	]


def get_data(filters):
	conditions = {}
	if filters.from_date and filters.to_date:
		conditions["ordered_on"] = ["between", [f"{filters.from_date} 00:00:00", f"{filters.to_date} 23:59:59"]]
	elif filters.from_date:
		conditions["ordered_on"] = [">=", f"{filters.from_date} 00:00:00"]
	elif filters.to_date:
		conditions["ordered_on"] = ["<=", f"{filters.to_date} 23:59:59"]
	for key in ("status", "test_type"):
		if filters.get(key):
			conditions[key] = filters.get(key)

	# get_list, not get_all: the Doctor-only-own-patients rule and role
	# permissions apply here exactly as on the Diagnostic Test list.
	rows = frappe.get_list(
		"Diagnostic Test",
		filters=conditions,
		fields=[
			"name", "ordered_on", "patient_name", "patient_visit", "item_name", "lab_test_template", "lab_sample",
			"status", "is_paid", "sample_collected_on", "reported_on", "due_on", "verified_by",
		],
		order_by="ordered_on desc",
		limit_page_length=0,
	)
	templates = {r.lab_test_template for r in rows if r.lab_test_template}
	dept_of = dict(
		frappe.get_all("Lab Test Template", filters={"name": ["in", list(templates)]}, fields=["name", "department"], as_list=True)
	) if templates else {}

	now = now_datetime()
	out = []
	for r in rows:
		r.department = dept_of.get(r.lab_test_template)
		if r.sample_collected_on and r.reported_on:
			r.tat_hours = flt(time_diff_in_hours(r.reported_on, r.sample_collected_on), 1)
		# Late = reported after its due time, or still not reported once due.
		late = False
		if r.due_on and r.status != "Cancelled":
			done = get_datetime(r.reported_on) if r.reported_on else None
			late = (done or now) > get_datetime(r.due_on)
		r.late = _("Yes") if late else ""
		if filters.late_only and not late:
			continue
		out.append(r)
	return out
