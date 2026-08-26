// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

const STATUS_COLORS = {
	bmi_category: {
		Underweight: { bg: "#fdf4e7", fg: "#a3701f" },
		Normal: { bg: "#e6f4ea", fg: "#1e7e34" },
		Overweight: { bg: "#fdf4e7", fg: "#a3701f" },
		Obese: { bg: "#fdece7", fg: "#a3341f" },
	},
	blood_sugar_status: {
		Low: { bg: "#fdf4e7", fg: "#a3701f" },
		Normal: { bg: "#e6f4ea", fg: "#1e7e34" },
		High: { bg: "#fdece7", fg: "#a3341f" },
	},
	anemia_status: {
		Normal: { bg: "#e6f4ea", fg: "#1e7e34" },
		Anemic: { bg: "#fdece7", fg: "#a3341f" },
	},
};

frappe.ui.form.on("Nurse Interventions", {
	refresh(frm) {
		Object.keys(STATUS_COLORS).forEach((fieldname) => colour_status_field(frm, fieldname));
	},
	patient_unique_id(frm) {
		update_blood_sugar_history_preview(frm);
	},
	height(frm) {
		update_bmi_preview(frm);
	},
	weight(frm) {
		update_bmi_preview(frm);
	},
	rbg_level(frm) {
		update_blood_sugar_preview(frm);
	},
	hemoglobin_level(frm) {
		update_anemia_preview(frm);
	},
	gender(frm) {
		// Anemia's threshold depends on gender - re-run if it's picked/changed
		// after Hemoglobin Level was already entered.
		update_anemia_preview(frm);
	},
	bmi_category(frm) {
		colour_status_field(frm, "bmi_category");
	},
	blood_sugar_status(frm) {
		colour_status_field(frm, "blood_sugar_status");
	},
	anemia_status(frm) {
		colour_status_field(frm, "anemia_status");
	},
});

function update_bmi_preview(frm) {
	// Mirrors update_bmi() in nurse_interventions.py exactly (same formula,
	// same thresholds) - this is only a live preview so the nurse doesn't have
	// to Save first to see it; validate() on the server is still what actually
	// gets stored and is the authoritative value.
	if (!frm.doc.height || !frm.doc.weight) return;

	const height_m = frm.doc.height / 100;
	const bmi = frm.doc.weight / (height_m * height_m);
	frm.set_value("bmi", bmi.toFixed(1));

	let category;
	if (bmi < 18.5) category = "Underweight";
	else if (bmi < 25) category = "Normal";
	else if (bmi < 30) category = "Overweight";
	else category = "Obese";
	frm.set_value("bmi_category", category);
}

function update_blood_sugar_preview(frm) {
	// Mirrors update_blood_sugar_status() in nurse_interventions.py - Random
	// Blood Glucose thresholds (mg/dL), same live-preview reasoning as BMI.
	if (!frm.doc.rbg_level) return;

	const rbg = frm.doc.rbg_level;
	let status;
	if (rbg < 70) status = "Low";
	else if (rbg < 140) status = "Normal";
	else status = "High";
	frm.set_value("blood_sugar_status", status);
}

function update_anemia_preview(frm) {
	// Mirrors update_anemia_status() in nurse_interventions.py - WHO cutoffs
	// differ by sex (Male 13 g/dL, Female/unspecified 12 g/dL), a
	// simplification since real thresholds also vary by age/pregnancy.
	if (!frm.doc.hemoglobin_level) return;

	const threshold = frm.doc.gender === "Male" ? 13.0 : 12.0;
	frm.set_value("anemia_status", frm.doc.hemoglobin_level >= threshold ? "Normal" : "Anemic");
}

function update_blood_sugar_history_preview(frm) {
	// Mirrors update_blood_sugar_history() in nurse_interventions.py - a live
	// preview so the nurse sees this patient's past readings the moment the
	// patient is picked, without having to Save first; validate() on the
	// server is still what actually gets stored. Each row is a real Blood
	// Sugar History Entry child row (Visit Record links back to the original
	// Nurse Interventions it came from) - Frappe's own grid shows 5 at a
	// time (grid_page_length on that child doctype) with its own built-in
	// "load more", so there's nothing custom to build for that part.
	frm.clear_table("blood_sugar_history");
	if (frm.doc.patient_unique_id) {
		frappe.call({
			method: "metta.metta.doctype.nurse_interventions.nurse_interventions.get_blood_sugar_history",
			args: { patient_unique_id: frm.doc.patient_unique_id, exclude: frm.doc.name },
			callback(r) {
				(r.message || []).forEach((row) => {
					const child = frm.add_child("blood_sugar_history");
					child.nurse_intervention = row.name;
					child.date = row.date;
					child.rbg_level = row.rbg_level;
					child.blood_sugar_status = row.blood_sugar_status;
				});
				frm.refresh_field("blood_sugar_history");
			},
		});
	} else {
		frm.refresh_field("blood_sugar_history");
	}
}

function colour_status_field(frm, fieldname) {
	// Styles the existing field's own control directly (no extra field, no
	// doctype change needed) - works whether it's rendered read-only (a plain
	// value box) or as an editable dropdown, since both cases are covered.
	const field = frm.fields_dict[fieldname];
	if (!field || !field.$wrapper) return;

	const $target = field.$wrapper.find(".control-value, select.form-control").first();
	if (!$target.length) return;

	const colors = (STATUS_COLORS[fieldname] || {})[frm.doc[fieldname]];
	if (!colors) {
		$target.css({ background: "", color: "", "font-weight": "", "border-radius": "", padding: "" });
		return;
	}
	$target.css({
		background: colors.bg,
		color: colors.fg,
		"font-weight": "700",
		"border-radius": "6px",
		padding: "4px 10px",
	});
}
