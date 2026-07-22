// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Material Issue", {
	setup(frm) {
		// Issuing to a patient only ever means dispensing medicine or
		// consumable stock - never a service or a fixed asset.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]] },
		}));
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.issued_by) {
			frm.set_value("issued_by", frappe.session.user);
		}
	},
});
