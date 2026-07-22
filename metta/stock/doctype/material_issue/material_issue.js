// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Material Issue", {
	refresh(frm) {
		if (frm.is_new() && !frm.doc.issued_by) {
			frm.set_value("issued_by", frappe.session.user);
		}
	},
});
