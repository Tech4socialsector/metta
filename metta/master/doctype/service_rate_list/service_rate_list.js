// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Service Rate List", {
	setup(frm) {
		frm.set_query("item", () => ({ filters: { item_type: "Service" } }));
	},
	refresh(frm) {
		if (frm.is_new()) return;
		// The only way Current Rate is meant to change - archives the old
		// rate into history first, so nobody has to remember to do that
		// step themselves by editing the table directly.
		frm.add_custom_button(__("Update Rate"), () => {
			frappe.prompt(
				[
					{
						fieldname: "new_rate",
						fieldtype: "Currency",
						label: __("New Rate"),
						reqd: 1,
					},
					{
						fieldname: "new_start_date",
						fieldtype: "Date",
						label: __("Start Date"),
						default: frappe.datetime.get_today(),
						reqd: 1,
					},
				],
				(values) => {
					frappe.call({
						method: "metta.master.doctype.service_rate_list.service_rate_list.update_rate",
						args: { name: frm.doc.name, new_rate: values.new_rate, new_start_date: values.new_start_date },
						freeze: true,
						callback: () => frm.reload_doc(),
					});
				},
				__("Update Rate"),
				__("Update")
			);
		});
	},
});
