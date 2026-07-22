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

frappe.ui.form.on("Material Issue Item", {
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "item_name", "");
			return;
		}
		frappe.db.get_value("Item", row.item, "item_name", (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
	},
});
