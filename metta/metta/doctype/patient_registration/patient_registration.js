// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

// The only Billing Categories ever picked without a Company behind them -
// everything else (Corporate, Woodstock Corporate, Wynbrg, any future
// company's own record) is company-driven and tracks corporate_customer.
const FIXED_BILLING_CATEGORIES = ["General", "Staff", "Staff Dependent"];

frappe.ui.form.on("Patient Registration", {
	refresh(frm) {
		// Autocomplete's own validate() blanks out anything typed that isn't
		// in the current options list - Village needs the opposite: the Pin
		// Code lookup's villages are suggestions to pick from, never a
		// restriction, since Front Desk must still be able to type a village
		// by hand when the lookup fails or simply wasn't used.
		frm.fields_dict.address.df.ignore_validation = 1;
		update_charity_percent_label(frm);
	},
	dob(frm) {
		update_age_preview(frm);
		check_dependent_aged_out_preview(frm);
	},
	age(frm) {
		check_dependent_aged_out_preview(frm);
	},
	first_name(frm) {
		update_patient_name_preview(frm);
	},
	last_name(frm) {
		update_patient_name_preview(frm);
	},
	corporate_customer(frm) {
		// Billing Category's own fetch_from (see the field's "fetch_from":
		// "corporate_customer.billing_category" in the doctype) handles
		// filling it in the moment a Company is picked - same mechanism as
		// Pin Code -> State/District. That only ever fires on a real pick
		// though, never on clearing one, so clearing Company back out still
		// needs to be handled here by hand.
		if (!frm.doc.corporate_customer) {
			// Company Staff Code only ever means something against a real
			// Company - stale otherwise, so cleared the same moment Company
			// Name itself is.
			if (frm.doc.staff_id) frm.set_value("staff_id", "");
			// Every company has its own Billing Category record (e.g.
			// "Woodstock Corporate", "Wynbrg") - not just one literally named
			// "Corporate" - so anything other than the three fixed, no-company
			// categories is company-driven and clears with it.
			if (frm.doc.billing_category && !FIXED_BILLING_CATEGORIES.includes(frm.doc.billing_category)) {
				frm.set_value("billing_category", "");
			}
		}
	},
	billing_category(frm) {
		// A Billing Category change that didn't come from corporate_customer
		// itself (e.g. picked back to General by hand) leaves a mismatched
		// Company sitting there otherwise - cleared so the two can't disagree.
		if (FIXED_BILLING_CATEGORIES.includes(frm.doc.billing_category) && frm.doc.corporate_customer) {
			frm.set_value("corporate_customer", "");
		}
		// Relationship no longer applies once Billing Category moves away from
		// Staff Dependent - cleared rather than left silently mismatched with
		// what's shown (or hidden) right above.
		if (frm.doc.billing_category !== "Staff Dependent" && frm.doc.dependent_relationship) {
			frm.set_value("dependent_relationship", "");
		}
		update_charity_percent_label(frm);
	},
	dependent_relationship(frm) {
		check_dependent_aged_out_preview(frm);
	},
	phone(frm) {
		if (!frm.doc.phone) return;
		const digits = frm.doc.phone.replace(/\D/g, "").slice(0, 10);
		if (digits !== frm.doc.phone) {
			frm.set_value("phone", digits);
			return;
		}
		check_duplicate_phone(frm);
		check_chw_field_match(frm);
	},
	after_save(frm) {
		// Set only when Front Desk actually confirmed a match in the picker
		// below - the write-back happens now, against this record's real
		// (now-saved) name, never against a new document's temporary one.
		if (!frm._chw_match_family_member) return;
		frappe.call({
			method: "metta.metta.doctype.patient_registration.patient_registration.link_chw_field_record",
			args: { patient_registration: frm.doc.name, family_member: frm._chw_match_family_member },
		});
		frm._chw_match_family_member = null;
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
	relationship_to_the_patient(frm) {
		// Stale free-text from a previous "Other" pick shouldn't silently
		// survive once a real relationship from the list is chosen instead.
		if (frm.doc.relationship_to_the_patient !== "Other" && frm.doc.relationship_other) {
			frm.set_value("relationship_other", "");
		}
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

// Mirrors CHILD_RELATIONSHIPS / DEPENDENT_CHILD_AGE_LIMIT / check_dependent_aged_out()
// in patient_registration.py exactly - a live preview so Front Desk sees a
// Staff Dependent who's just crossed 21 downgrade to General without having
// to Save first; validate() on the server is still the authoritative value.
const CHILD_RELATIONSHIPS = ["Son", "Daughter"];
const DEPENDENT_CHILD_AGE_LIMIT = 21;

function check_dependent_aged_out_preview(frm) {
	if (frm.doc.billing_category !== "Staff Dependent") return;
	const aged_out =
		CHILD_RELATIONSHIPS.includes(frm.doc.dependent_relationship) &&
		frm.doc.age != null &&
		frm.doc.age !== "" &&
		frm.doc.age >= DEPENDENT_CHILD_AGE_LIMIT;
	if (aged_out) {
		frm.set_value("billing_category", "General");
	}
}

// A Corporate category like Woodstock's own +10% is the hospital charging
// MORE, not a concession - finance doesn't want it called "Charity"
// anywhere they see it, "TDS" is their own term for this specific markup.
// The stored value stays "Increase" everywhere in code/reports - only what
// a human actually reads switches to "TDS".
function update_charity_percent_label(frm) {
	if (!frm.doc.billing_category) {
		frm.set_df_property("charity_percent", "label", __("Charity Percent"));
		frm.refresh_field("charity_percent");
		return;
	}
	frappe.call({
		method: "metta.metta.doctype.patient_registration.patient_registration.get_category_adjustment",
		args: { billing_category: frm.doc.billing_category },
		callback(r) {
			const adjustment = r.message || {};
			const is_increase = adjustment.charity_status === "Active" && adjustment.adjustment_type === "Increase";
			frm.set_df_property("charity_percent", "label", is_increase ? __("TDS Percent") : __("Charity Percent"));
			frm.refresh_field("charity_percent");
		},
	});
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

// Mirrors CHW_GENDER_TO_SEX on the server (patient_registration.py) - kept
// in sync there, not computed from it, since this only ever drives what's
// shown/filled in a dialog, never anything actually saved on its own.
const CHW_GENDER_TO_SEX = { Male: "Male", Female: "Female" };

function check_chw_field_match(frm) {
	// Only for a genuinely new registration - an existing patient's phone
	// getting edited later isn't "someone walking in for the first time",
	// so there's no walk-in match to look for.
	if (!frm.is_new() || !frm.doc.phone) return;
	frappe.call({
		method: "metta.metta.doctype.patient_registration.patient_registration.find_chw_field_matches",
		args: { phone: frm.doc.phone },
		callback(r) {
			const matches = r.message || [];
			if (matches.length) show_chw_match_dialog(frm, matches);
		},
	});
}

function show_chw_match_dialog(frm, matches) {
	const row_html = (m, i) => `
		<div class="chw-match-row" data-idx="${i}" style="cursor:pointer; padding:10px 12px; border:1px solid var(--border-color,#d1d8dd); border-radius:6px; margin-bottom:8px;">
			<div style="font-weight:600;">${frappe.utils.escape_html(m.family_member || "")}</div>
			<div class="text-muted" style="font-size:12px;">
				${m.age != null ? __("Age") + " " + m.age : ""}${m.village ? " · " + frappe.utils.escape_html(m.village) : ""}${m.relationship ? " · " + frappe.utils.escape_html(m.relationship) : ""}
			</div>
		</div>`;

	const dialog = new frappe.ui.Dialog({
		title: __("Found in Community Health Records"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "matches_html",
				options: `
					<div class="text-muted" style="margin-bottom:10px;">${__(
						"This phone number is already known to Community Health (CHW). Is this the same person?"
					)}</div>
					${matches.map(row_html).join("")}
				`,
			},
		],
		primary_action_label: __("None of these - new person"),
		primary_action() {
			dialog.hide();
		},
	});
	dialog.show();

	dialog.$wrapper.find(".chw-match-row").on("click", function () {
		apply_chw_match(frm, matches[$(this).data("idx")]);
		dialog.hide();
	});
}

function apply_chw_match(frm, match) {
	// Only fills what Front Desk hasn't already typed - a deliberate hand
	// entry always wins over the CHW record, same fetch_if_empty reasoning
	// used elsewhere on this form (e.g. Charity Percent).
	const fill_if_empty = (fieldname, value) => {
		if (!frm.doc[fieldname] && value) frm.set_value(fieldname, value);
	};
	fill_if_empty("first_name", match.family_member);
	fill_if_empty("sex", CHW_GENDER_TO_SEX[match.gender] || "Others");
	fill_if_empty("dob", match.date_of_birth);
	fill_if_empty("address", match.village);

	// Read on Save (see after_save above) - kept off the doc itself since
	// there's no real field for it and the write-back only makes sense once
	// this record actually has a permanent name.
	frm._chw_match_family_member = match.name;
	frappe.show_alert({
		message: __("Will link to {0}'s Community Health record on save.", [match.family_member]),
		indicator: "blue",
	});
}
