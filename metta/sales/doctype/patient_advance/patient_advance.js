// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

// Patient Visit's own "show title instead of ID" setting is a doctype-wide
// switch (frappe.boot.link_title_doctypes) - it shows the patient's name on
// every Link to Patient Visit anywhere in the app, and turning it off there
// would undo that everywhere else too (Billing, Appointment, Nurse
// Interventions, etc. all rely on it showing the name). This field is
// deliberately labelled "Patient ID" though, so instead of touching that
// global setting, this forces just this one field's own displayed text back
// to the real ID - Patient Name right next to it already shows the name, so
// nothing is lost. The setTimeout runs this after whatever the Link
// control's own render/dropdown-selection code just did to the input, since
// that always happens first and would otherwise overwrite this immediately.
function show_patient_visit_id(frm) {
	const ctrl = frm.fields_dict.patient_visit;
	if (!ctrl || !frm.doc.patient_visit) return;
	setTimeout(() => ctrl.set_input_value(frm.doc.patient_visit), 0);
}

frappe.ui.form.on("Patient Advance", {
	refresh(frm) {
		// Advance is only ever collected for an IP stay (OP is paid at the
		// counter per visit, no running balance to advance against) - so the
		// picker itself should only ever offer IP visits, not every visit.
		frm.set_query("patient_visit", () => ({
			filters: { registration_category: "IP" },
		}));
		show_patient_visit_id(frm);
	},
	patient_visit(frm) {
		show_patient_visit_id(frm);
	},
});
