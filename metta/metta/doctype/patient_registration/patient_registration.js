// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Patient Registration", {
	refresh(frm) {
		// Only meaningful once the registration is saved (frm.doc.name is a
		// real document to render a receipt for).
		if (!frm.is_new()) {
			frm.add_custom_button(__("Receipt Preview"), () => {
				frappe.call({
					method:
						"metta.metta.doctype.patient_registration.patient_registration.get_receipt_html",
					args: { registration: frm.doc.name },
					callback(r) {
						if (!r.message) {
							return;
						}
						const receipt_html = r.message;
						// A dialog (not frm.print_doc()'s full-page navigation) so the
						// preview matches the popup-with-print-button UX that was asked for.
						const dialog = new frappe.ui.Dialog({
							title: __("Receipt Preview"),
							size: "small",
							fields: [
								{
									fieldtype: "HTML",
									fieldname: "receipt_preview",
									options: receipt_html,
								},
							],
							primary_action_label: __("Print Receipt"),
							primary_action() {
								// A blank print-only window keeps the browser's print dialog
								// scoped to just the receipt, not the whole Desk page behind it.
								const print_window = window.open("", "_blank");
								print_window.document.write(
									`<html><head><title>${frappe.utils.escape_html(
										frm.doc.name
									)}</title></head><body>${receipt_html}</body></html>`
								);
								print_window.document.close();
								print_window.focus();
								print_window.print();
							},
						});
						dialog.show();
					},
				});
			});
		}
	},

	ward(frm) {
		if (!frm.doc.ward) {
			frm.set_intro("");
			return;
		}
		frappe.call({
			method:
				"metta.metta.doctype.patient_registration.patient_registration.get_ward_bed_summary",
			args: { ward: frm.doc.ward },
			callback(r) {
				if (!r.message || r.message.total_beds === undefined) {
					return;
				}
				const { total_beds, occupied_beds, available_beds, beds } = r.message;
				let html = __(
					"Ward {0}: {1} total beds &mdash; <span style='color:#28a745;font-weight:bold;'>{2} available</span>, <span style='color:#dc3545;font-weight:bold;'>{3} occupied</span>",
					[frm.doc.ward, total_beds, available_beds, occupied_beds]
				);

				if (beds && beds.length) {
					// Only wards with an enumerated bed list (see Ward Master) can show
					// individual bed-level status; others only have a manual count.
					const pill = (bed) => {
						const is_available = bed.status === "Available";
						const bg = is_available ? "#28a745" : "#dc3545";
						return `<span title="${bed.status}" style="display:inline-block;margin:2px;padding:2px 8px;border-radius:10px;background:${bg};color:#fff;font-size:11px;">${frappe.utils.escape_html(
							bed.bed_no
						)}</span>`;
					};
					html += `<div style="margin-top:6px;">${beds.map(pill).join("")}</div>`;
				} else {
					html += `<div style="margin-top:4px;color:#888;">${__(
						"Individual beds are not listed for this ward yet — add them under Beds on the Ward Master record to see bed-wise status here."
					)}</div>`;
				}

				frm.set_intro(html);
			},
		});
	},

	bed_no(frm) {
		// Only IP admissions occupy a bed - nothing to check for OP or an
		// incomplete ward/bed selection.
		if (!frm.doc.ward || !frm.doc.bed_no || frm.doc.registration_category !== "IP") {
			return;
		}
		frappe.call({
			method:
				"metta.metta.doctype.patient_registration.patient_registration.check_bed_availability",
			args: {
				ward: frm.doc.ward,
				bed_no: frm.doc.bed_no,
				registration: frm.doc.name,
			},
			callback(r) {
				if (r.message && r.message.occupied) {
					frappe.msgprint({
						title: __("Bed Already Occupied"),
						indicator: "red",
						message: __(
							"Bed {0} in ward {1} is already occupied by {2}. Please choose a different bed.",
							[frm.doc.bed_no, frm.doc.ward, r.message.occupied_by]
						),
					});
					frm.set_value("bed_no", "");
				}
			},
		});
	},
});
