// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

// This is the master rate record itself (e.g. "Woodstock Corporate" at
// +10%) - Charity Percent is the one field shared by both a real discount
// and a Corporate markup like this. Finance's own term for the markup case
// is "TDS", never "Charity" - the label here just follows whatever this
// record's own Adjustment Type already says, live as it's being set.
frappe.ui.form.on("Category Price Adjustment", {
	refresh(frm) {
		update_charity_percent_label(frm);
	},
	adjustment_type(frm) {
		update_charity_percent_label(frm);
	},
});

function update_charity_percent_label(frm) {
	const is_increase = frm.doc.adjustment_type === "Increase";
	frm.set_df_property("charity_percent", "label", is_increase ? __("TDS Percent") : __("Charity Percent"));
	frm.refresh_field("charity_percent");
}
