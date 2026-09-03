// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Discharge Summary", {
// 	refresh(frm) {

// 	},
// });

// A child table doctype's own .js file is never loaded by Frappe (istable
// doctypes skip add_code() entirely) - this has to live in each parent's own
// script instead. Same logic as Doctor Consultation's copy of this handler.
frappe.ui.form.on("Prescription Item", {
	dosage(frm, cdt, cdn) {
		calculate_prescription_qty(cdt, cdn);
	},
	duration(frm, cdt, cdn) {
		calculate_prescription_qty(cdt, cdn);
	},
});

function calculate_prescription_qty(cdt, cdn) {
	// Dosage is Morning-Afternoon-Night (e.g. "1-0-1") - doses per day is
	// just those three numbers added up. Mirrors the server's own
	// validate() exactly - a live preview only, save is what's authoritative.
	const row = locals[cdt][cdn];
	if (!row.dosage || !row.duration) return;
	const doses_per_day = row.dosage
		.split("-")
		.reduce((total, part) => total + (cint(part) || 0), 0);
	frappe.model.set_value(cdt, cdn, "qty", doses_per_day * cint(row.duration));
}
