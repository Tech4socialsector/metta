// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Bed Transfer", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Print"), () => metta.print_preview.show(frm, "Bed Transfer Print"));
		}
	},
});
