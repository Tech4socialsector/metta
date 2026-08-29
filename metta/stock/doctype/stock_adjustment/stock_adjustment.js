// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Adjustment", {
	setup(frm) {
		frm.set_query("item", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]], is_active: 1 },
		}));
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.adjusted_by) {
			frm.set_value("adjusted_by", frappe.session.user);
		}
	},
});
