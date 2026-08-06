// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Supplier", {
	contact_number(frm) {
		if (!frm.doc.contact_number) return;
		const digits = frm.doc.contact_number.replace(/\D/g, "").slice(0, 10);
		if (digits !== frm.doc.contact_number) frm.set_value("contact_number", digits);
	},
});
