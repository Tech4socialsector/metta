// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

const BMI_CATEGORY_COLOR = {
	Underweight: { bg: "#fdf4e7", fg: "#a3701f" },
	Normal: { bg: "#e6f4ea", fg: "#1e7e34" },
	Overweight: { bg: "#fdf4e7", fg: "#a3701f" },
	Obese: { bg: "#fdece7", fg: "#a3341f" },
};

frappe.ui.form.on("Nurse Interventions", {
	refresh(frm) {
		// The Select control stays as the actual stored value (list view/filter
		// still use it) - only the form display swaps to a colored badge, same
		// visual language as the other status pills already used elsewhere in
		// this app (e.g. Outlet-wise Expiry Report's Expired/Safe indicators).
		frm.set_df_property("bmi_category", "hidden", 1);
		render_bmi_category_badge(frm);
	},
});

function render_bmi_category_badge(frm) {
	const $wrapper = frm.fields_dict.bmi_category_display.$wrapper;
	if (!frm.doc.bmi_category) {
		$wrapper.html(`<span class="text-muted">${__("Not calculated yet - enter Height and Weight, then save.")}</span>`);
		return;
	}

	const colors = BMI_CATEGORY_COLOR[frm.doc.bmi_category] || { bg: "#eaf3fc", fg: "#0b4a86" };
	$wrapper.html(`
		<div style="
			display:inline-block;
			background:${colors.bg};
			color:${colors.fg};
			font-weight:700;
			padding:6px 14px;
			border-radius:6px;
		">${frappe.utils.escape_html(frm.doc.bmi_category)}</div>
	`);
}
