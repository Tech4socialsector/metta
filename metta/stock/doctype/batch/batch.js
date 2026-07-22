// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Batch", {
	setup(frm) {
		// Assets are tracked individually via serial_no, not lot/expiry
		// batches - only Medicine and Consumable ever get a Batch record.
		frm.set_query("item", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]] },
		}));
	},
});
