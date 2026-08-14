// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Appointment", {
	refresh(frm) {
		if (frm.is_new() || frm.doc.status !== "Scheduled") return;

		frm.add_custom_button(__("Check In"), () => {
			frappe.call({
				method: "metta.metta.doctype.appointment.appointment.get_visit_defaults",
				args: { appointment: frm.doc.name },
				callback(r) {
					if (!r.message) return;
					// The appointment record itself is left untouched here - it only
					// flips to Checked-in once the resulting Patient Visit is actually
					// saved (see Patient Visit's after_insert), same as "Admit Patient"
					// leaves the OP visit alone until the new IP visit is saved.
					frappe.new_doc("Patient Visit", r.message);
				},
			});
		}).addClass("btn-primary");
	},
});
