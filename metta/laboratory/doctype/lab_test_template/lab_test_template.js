// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Lab Test Template", {
	setup(frm) {
		// Only active Service items can be billed as a lab test.
		frm.set_query("item", () => ({
			filters: { item_type: "Service", is_active: 1 },
		}));
		frm.set_query("sample_type", () => ({
			filters: { is_active: 1 },
		}));
	},

	item(frm) {
		// Save typing: most tests are named after their billing item.
		if (frm.doc.item && !frm.doc.test_name) {
			frappe.db.get_value("Item", frm.doc.item, "item_name").then(({ message }) => {
				if (message && !frm.doc.test_name) frm.set_value("test_name", message.item_name);
			});
		}
	},
});
