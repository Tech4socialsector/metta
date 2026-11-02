// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

const STATUS_COLORS = {
	bmi_category: {
		Underweight: { bg: "#fdf4e7", fg: "#a3701f" },
		Normal: { bg: "#e6f4ea", fg: "#1e7e34" },
		Overweight: { bg: "#fdf4e7", fg: "#a3701f" },
		Obese: { bg: "#fdece7", fg: "#a3341f" },
	},
};

frappe.ui.form.on("Nurse Interventions", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Print"), () => metta.print_preview.show(frm, "Nurse Interventions Print"));
		}

		Object.keys(STATUS_COLORS).forEach((fieldname) => colour_status_field(frm, fieldname));
	},
	height(frm) {
		update_bmi_preview(frm);
	},
	weight(frm) {
		update_bmi_preview(frm);
	},
	bmi_category(frm) {
		colour_status_field(frm, "bmi_category");
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
