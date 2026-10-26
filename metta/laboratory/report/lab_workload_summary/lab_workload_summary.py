# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from metta.laboratory.report.lab_test_register.lab_test_register import get_data as register_rows

STATUSES = ("Ordered", "Sample Collected", "Result Entered", "Reported", "Cancelled")


def execute(filters=None):
	filters = frappe._dict(filters or {})
	group_by = filters.group_by or "Test"
	return get_columns(group_by), get_data(filters, group_by)


def get_columns(group_by):
	cols = [{"label": _(group_by), "fieldname": "group", "fieldtype": "Data", "width": 180}]
	cols += [{"label": _(s), "fieldname": frappe.scrub(s), "fieldtype": "Int", "width": 110} for s in STATUSES]
	cols += [
		{"label": _("Total"), "fieldname": "total", "fieldtype": "Int", "width": 80},
		{"label": _("Late"), "fieldname": "late", "fieldtype": "Int", "width": 70},
		{"label": _("Avg TAT (Hours)"), "fieldname": "avg_tat", "fieldtype": "Float", "precision": 1, "width": 120},
		{"label": _("Income"), "fieldname": "income", "fieldtype": "Currency", "width": 120},
	]
	return cols


def get_data(filters, group_by):
	# Same rows (and the same permissions) as the Lab Test Register, so the
	# two reports always agree; this one only counts them.
	rows = register_rows(frappe._dict(from_date=filters.from_date, to_date=filters.to_date))
	if not rows:
		return []

	sample_type_of = {}
	if group_by == "Sample Type":
		samples = {r.lab_sample for r in rows if r.lab_sample}
		sample_type_of = dict(
			frappe.get_all("Lab Sample", filters={"name": ["in", list(samples)]}, fields=["name", "sample_type"], as_list=True)
		) if samples else {}

	income_of = test_income([r.name for r in rows])

	groups = {}
	for r in rows:
		if group_by == "Department":
			key = r.department or _("No department")
		elif group_by == "Sample Type":
			key = sample_type_of.get(r.lab_sample) or _("No sample")
		else:
			key = r.item_name
		g = groups.setdefault(key, {"group": key, "total": 0, "late": 0, "income": 0, "_tat": []})
		g[frappe.scrub(r.status)] = g.get(frappe.scrub(r.status), 0) + 1
		g["total"] += 1
		g["late"] += 1 if r.late else 0
		g["income"] += income_of.get(r.name, 0)
		if r.tat_hours is not None:
			g["_tat"].append(r.tat_hours)

	out = []
	for g in sorted(groups.values(), key=lambda x: -x["total"]):
		tats = g.pop("_tat")
		g["avg_tat"] = flt(sum(tats) / len(tats), 1) if tats else None
		out.append(g)
	return out


def test_income(test_names):
	"""What was collected for each test: its bill's service row for the test's
	item. Only paid tests have a bill, so unpaid ones count as 0."""
	tests = frappe.get_all(
		"Diagnostic Test",
		filters={"name": ["in", test_names], "billing": ["is", "set"]},
		fields=["name", "billing", "item"],
	)
	if not tests:
		return {}
	amounts = {}
	for row in frappe.get_all(
		"Sales Bill Item",
		filters={"parenttype": "Billing", "parentfield": "service_items", "parent": ["in", list({t.billing for t in tests})]},
		fields=["parent", "item", "net_amount", "amount"],
	):
		amounts.setdefault((row.parent, row.item), flt(row.net_amount or row.amount))
	return {t.name: amounts.get((t.billing, t.item), 0) for t in tests}
