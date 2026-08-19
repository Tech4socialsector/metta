# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

from metta.sales.report.collection_report.collection_report import execute as get_collection_report_data


@frappe.whitelist()
def get_data(from_date, to_date):
	# Reuses Collection Report's own execute() - same permission checks, same
	# get_data() logic - so this page and the underlying Script Report can
	# never drift apart into showing two different numbers for the same period.
	# Phase 1 only covers User Wise Details; later phases will add their own
	# sections here without touching this call.
	_columns, user_wise_details = get_collection_report_data({"from_date": from_date, "to_date": to_date})
	return {
		"user_wise_details": user_wise_details,
		"advances": get_advances(from_date, to_date),
	}


def get_advances(from_date, to_date):
	frappe.has_permission("Patient Advance", "read", throw=True)

	advances = frappe.db.sql(
		"""
		SELECT name, patient_visit, patient_name, amount, payment_mode,
			received_by, received_on, remarks
		FROM `tabPatient Advance`
		WHERE received_on BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY received_on
		""",
		{"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"},
		as_dict=True,
	)

	full_names = _get_full_names({row.received_by for row in advances if row.received_by})
	for row in advances:
		# patient_name is a fetch_from that can be blank on an older record
		# whose Patient Visit has no demographics (uhin_id) linked yet - fall
		# back to the Visit ID so the row is never blank.
		row["patient_label"] = row.patient_name or row.patient_visit
		row["received_by_name"] = full_names.get(row.received_by, row.received_by)

	return {"rows": advances, "total": sum(flt(row.amount) for row in advances)}


def _get_full_names(users):
	users = [u for u in users if u]
	if not users:
		return {}
	rows = frappe.get_all("User", filters={"name": ["in", users]}, fields=["name", "full_name"])
	return {row.name: row.full_name or row.name for row in rows}
