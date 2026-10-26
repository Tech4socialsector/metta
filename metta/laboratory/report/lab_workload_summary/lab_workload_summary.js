// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.query_reports["Lab Workload Summary"] = {
	filters: [
		{ fieldname: "from_date", label: __("From Date"), fieldtype: "Date", default: frappe.datetime.month_start() },
		{ fieldname: "to_date", label: __("To Date"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "group_by", label: __("Group By"), fieldtype: "Select", options: "Test\nDepartment\nSample Type", default: "Test" },
	],
};
