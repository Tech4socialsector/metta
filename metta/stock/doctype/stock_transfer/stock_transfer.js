// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Transfer", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.status === "Dispatched") {
			frm.add_custom_button(__("Confirm Receipt"), () => {
				frappe.confirm(
					__("Confirm the quantities received at {0}? This will add them to that warehouse's stock.", [
						frm.doc.to_warehouse,
					]),
					() => {
						frm.call("confirm_receipt").then(() => frm.reload_doc());
					}
				);
			}).addClass("btn-primary");
		}
	},
});
