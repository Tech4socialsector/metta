// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Quality Inspection", {
	setup(frm) {
		frm.set_query("item", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
});
