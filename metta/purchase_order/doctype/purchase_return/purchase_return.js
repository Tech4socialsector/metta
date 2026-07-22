// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Return", {
	setup(frm) {
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.status === "Submitted") {
			frm.add_custom_button(__("Mark Credit Received"), () => {
				frm.call("mark_credit_received").then(() => frm.reload_doc());
			}).addClass("btn-primary");
		}
	},
});

frappe.ui.form.on("Purchase Return Item", {
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
