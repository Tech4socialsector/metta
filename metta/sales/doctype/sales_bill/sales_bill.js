// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Bill", {
	setup(frm) {
		// A patient is billed for medicine, consumables used on them, or a
		// service (consultation, procedure) - never for a fixed asset.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Service"]] },
		}));
	},
});
