// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Patient Registration", {
	dob(frm) {
		update_age_preview(frm);
	},
	phone(frm) {
		if (!frm.doc.phone) return;
		const digits = frm.doc.phone.replace(/\D/g, "").slice(0, 10);
		if (digits !== frm.doc.phone) {
			frm.set_value("phone", digits);
			return;
		}
		check_duplicate_phone(frm);
	},
});

function update_age_preview(frm) {
	// Mirrors calculate_age() in patient_registration.py exactly - a live
	// preview so Front Desk sees Age the moment DOB is picked, without having
	// to Save first; validate() on the server is still the authoritative value.
	if (!frm.doc.dob) {
		frm.set_value("age", "");
		return;
	}
	const dob = frappe.datetime.str_to_obj(frm.doc.dob);
	const today = frappe.datetime.str_to_obj(frappe.datetime.now_date());
	let age = today.getFullYear() - dob.getFullYear();
	const birthday_passed =
		today.getMonth() > dob.getMonth() ||
		(today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
	if (!birthday_passed) age -= 1;
	frm.set_value("age", age);
}

function check_duplicate_phone(frm) {
	if (!frm.doc.phone) return;
	frappe.call({
		method: "metta.metta.doctype.patient_registration.patient_registration.find_possible_duplicates",
		args: { phone: frm.doc.phone, exclude: frm.doc.name },
		callback(r) {
			const matches = r.message || [];
			if (!matches.length) return;
			// A warning, not a block - two people can share one phone number,
			// so Front Desk decides whether this is really the same patient.
			const list = matches
				.map((m) => `<li>${frappe.utils.escape_html(m.patient_name || m.name)} (${frappe.utils.escape_html(m.uid || m.name)})</li>`)
				.join("");
			frappe.msgprint({
				title: __("Possible Duplicate Patient"),
				indicator: "orange",
				message: __("A patient with this phone number is already registered:") + `<ul>${list}</ul>` + __("Please confirm this isn't the same person before continuing."),
			});
		},
	});
}
