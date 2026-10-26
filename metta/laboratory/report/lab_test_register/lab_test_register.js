// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.query_reports["Lab Test Register"] = {
	filters: [
		{ fieldname: "from_date", label: __("From Date"), fieldtype: "Date", default: frappe.datetime.month_start() },
		{ fieldname: "to_date", label: __("To Date"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "status", label: __("Status"), fieldtype: "Select", options: "\nOrdered\nSample Collected\nResult Entered\nReported\nCancelled" },
		{ fieldname: "test_type", label: __("Type"), fieldtype: "Select", options: "\nLab Test\nX-Ray\nScan\nOther" },
		{ fieldname: "late_only", label: __("Late Only"), fieldtype: "Check" },
	],
};
