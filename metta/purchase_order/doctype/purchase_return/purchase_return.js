// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Return", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.status === "Submitted") {
			frm.add_custom_button(__("Mark Credit Received"), () => {
				frm.call("mark_credit_received").then(() => frm.reload_doc());
			}).addClass("btn-primary");
		}
	},
});
