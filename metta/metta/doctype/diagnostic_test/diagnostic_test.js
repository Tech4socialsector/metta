// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Diagnostic Test", {
	setup(frm) {
		// A suggested test has to be a real, priced Service item - same
		// constraint as suggested_tests on Doctor Consultation.
		frm.set_query("item", () => ({
			filters: { item_type: "Service", is_active: 1 },
		}));
	},
});
