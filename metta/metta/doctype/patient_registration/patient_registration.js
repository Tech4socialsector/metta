// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Patient Registration", {
	refresh(frm) {
		// Autocomplete's own validate() blanks out anything typed that isn't
		// in the current options list - Village needs the opposite: the Pin
		// Code lookup's villages are suggestions to pick from, never a
		// restriction, since Front Desk must still be able to type a village
		// by hand when the lookup fails or simply wasn't used.
		frm.fields_dict.address.df.ignore_validation = 1;
	},
	dob(frm) {
		update_age_preview(frm);
		update_billing_category_preview(frm);
	},
	age(frm) {
		update_billing_category_preview(frm);
	},
	first_name(frm) {
		update_patient_name_preview(frm);
	},
	last_name(frm) {
		update_patient_name_preview(frm);
	},
	staff_status(frm) {
		update_billing_category_preview(frm);
	},
	billing_category(frm) {
		// Charity Amount only ever applies to a General patient - Staff/Staff
		// Dependent already gets its charity automatically, so any leftover
		// hand-typed amount from before switching away from General is
		// cleared rather than silently carried over.
		if (frm.doc.billing_category !== "General" && frm.doc.charity_amount) {
			frm.set_value("charity_amount", 0);
		}
	},
	dependent_relationship(frm) {
		update_billing_category_preview(frm);
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
	emergency_phone_number(frm) {
		if (!frm.doc.emergency_phone_number) return;
		const digits = frm.doc.emergency_phone_number.replace(/\D/g, "").slice(0, 10);
		if (digits !== frm.doc.emergency_phone_number) {
			frm.set_value("emergency_phone_number", digits);
		}
	},
	pin_code(frm) {
		// Only look up once a full 6-digit Pin Code is actually entered - not
		// on every keystroke while it's still being typed.
		const pincode = String(frm.doc.pin_code || "");
		if (!/^\d{6}$/.test(pincode)) return;

		frappe.call({
			method: "metta.metta.doctype.patient_registration.patient_registration.get_location_by_pincode",
			args: { pincode },
			freeze: true,
			callback(r) {
				const data = r.message;
				if (!data) return;
				frm.set_value("state", data.state || "");
				frm.set_value("district", data.district || "");

				const villages = data.villages || [];
				// Always refresh the Village field's dropdown suggestions to
				// this Pin Code's villages - Awesomplete only offers them as
				// a picker, so typing something else is still fine. The
				// control only rebuilds its suggestion list from set_data() -
				// set_df_property("options", ...) alone doesn't reach the
				// already-initialized Awesomplete instance.
				frm.set_df_property("address", "options", villages);
				frm.fields_dict.address.set_data(villages);
				if (villages.length === 1) {
					// Only one village under this Pin Code - safe to fill in
					// directly, same as State/District.
					frm.set_value("address", villages[0]);
				} else if (villages.length > 1) {
					// A hilly Pin Code like this hospital's own commonly covers
					// several villages - Front Desk picks the right one from
					// the dropdown rather than guessing which name to keep.
					frm.set_value("address", "");
				}
			},
		});
	},
});

function update_patient_name_preview(frm) {
	// Mirrors calculate_full_name() in patient_registration.py exactly - a
	// live preview so Front Desk sees Full Name fill in as they type, without
	// having to Save first; validate() on the server is still the
	// authoritative value.
	const parts = [frm.doc.first_name, frm.doc.last_name].filter(Boolean);
	frm.set_value("patient_name", parts.join(" "));
}

function update_age_preview(frm) {
	// Mirrors calculate_age() in patient_registration.py exactly - a live
	// preview so Front Desk sees Age the moment DOB is picked, without having
	// to Save first; validate() on the server is still the authoritative value.
	// No DOB - Age is Front Desk's own manual entry (DOB isn't known), so it's
	// left alone rather than blanked out.
	if (!frm.doc.dob) return;
	const dob = frappe.datetime.str_to_obj(frm.doc.dob);
	const today = frappe.datetime.str_to_obj(frappe.datetime.now_date());
	let age = today.getFullYear() - dob.getFullYear();
	const birthday_passed =
		today.getMonth() > dob.getMonth() ||
		(today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
	if (!birthday_passed) age -= 1;
	frm.set_value("age", age);
}

// Mirrors CHILD_RELATIONSHIPS / DEPENDENT_CHILD_AGE_LIMIT / calculate_billing_category()
// in patient_registration.py exactly - a live preview so Front Desk sees
// Billing Category fill in as they pick Staff Status, without having to Save
// first; validate() on the server is still the authoritative value.
const CHILD_RELATIONSHIPS = ["Son", "Daughter"];
const DEPENDENT_CHILD_AGE_LIMIT = 21;

function update_billing_category_preview(frm) {
	let category = null;
	if (frm.doc.staff_status === "Staff") {
		category = "Staff";
	} else if (frm.doc.staff_status === "Staff Dependent") {
		const aged_out =
			CHILD_RELATIONSHIPS.includes(frm.doc.dependent_relationship) &&
			frm.doc.age != null &&
			frm.doc.age !== "" &&
			frm.doc.age >= DEPENDENT_CHILD_AGE_LIMIT;
		category = aged_out ? "General" : "Staff Dependent";
	}
	// Not Staff-related - Billing Category stays exactly whatever Front Desk
	// picked by hand, same as the server-side rule this mirrors.
	if (category) {
		frm.set_value("billing_category", category);
	}
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
