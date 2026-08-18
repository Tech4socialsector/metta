// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Appointment", {
	appointment_date(frm) {
		refresh_available_doctors(frm);
	},
	appointment_time(frm) {
		refresh_available_doctors(frm);
	},
	refresh(frm) {
		refresh_available_doctors(frm);

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

function refresh_available_doctors(frm) {
	// Until both are picked, there's nothing to filter against yet - show
	// every doctor rather than an empty/misleading list.
	if (!frm.doc.appointment_date || !frm.doc.appointment_time) {
		frm.set_query("doctor", () => ({}));
		return;
	}
	frappe.call({
		method: "metta.metta.doctype.appointment.appointment.get_available_doctors",
		args: {
			appointment_date: frm.doc.appointment_date,
			appointment_time: frm.doc.appointment_time,
			// Editing an existing appointment shouldn't count its own booking
			// against the slot capacity it's already occupying.
			exclude_appointment: frm.is_new() ? null : frm.doc.name,
		},
		callback(r) {
			const names = r.message || [];
			// This is a convenience filter only - save-time validate() on the
			// server is still the real gate, so an existing selection that
			// falls outside this list is left alone rather than cleared here.
			frm.set_query("doctor", () => ({ filters: { name: ["in", names] } }));
			if (!names.length) {
				frappe.show_alert(
					{ message: __("No doctor is available at this date and time."), indicator: "orange" },
					5
				);
			}
		},
	});
}
