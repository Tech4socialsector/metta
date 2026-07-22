// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Adjustment", {
	refresh(frm) {
		if (frm.is_new() && !frm.doc.adjusted_by) {
			frm.set_value("adjusted_by", frappe.session.user);
		}
	},
});
