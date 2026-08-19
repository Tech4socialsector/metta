# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe

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
	}
