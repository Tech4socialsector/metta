// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Doctor Consultation", {
	setup(frm) {
		// Only actual medicines belong on a prescription - not consumables,
		// assets, or services.
		frm.set_query("item", "prescribed_items", () => ({
			filters: { item_type: "Medicine" },
		}));
		// A suggested test has to be a real, priced Service item - that's
		// what makes it billable at all, not free text.
		frm.set_query("item", "suggested_tests", () => ({
			filters: { item_type: "Service" },
		}));
	},
	onload(frm) {
		// Default to whoever is actually logged in, rather than leaving this
		// blank for them to pick by hand - the server still rejects it if
		// they change it to someone else (see validate_doctor_matches_session_user).
		if (frm.is_new() && !frm.doc.doctor) {
			frappe.call({
				method: "metta.metta.doctype.doctor_consultation.doctor_consultation.get_own_doctor",
				callback(r) {
					if (r.message) {
						frm.set_value("doctor", r.message);
					}
				},
			});
		}
	},
	refresh(frm) {
		render_patient_history(frm);
		check_vitals_status(frm);
		show_vitals_popup(frm);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Print Prescription"), () => {
				frappe.call({
					method:
						"metta.metta.doctype.doctor_consultation.doctor_consultation.get_prescription_html",
					args: { consultation: frm.doc.name },
					callback(r) {
						if (!r.message) return;
						const prescription_html = r.message;
						// A dialog (not frm.print_doc()'s full-page navigation) so the
						// preview matches the popup-with-print-button UX already used
						// for the Patient Visit receipt.
						const dialog = new frappe.ui.Dialog({
							title: __("Prescription Preview"),
							size: "small",
							fields: [
								{
									fieldtype: "HTML",
									fieldname: "prescription_preview",
									options: prescription_html,
								},
							],
							primary_action_label: __("Print"),
							primary_action() {
								const print_window = window.open("", "_blank");
								print_window.document.write(
									`<html><head><title>${frappe.utils.escape_html(
										frm.doc.name
									)}</title></head><body>${prescription_html}</body></html>`
								);
								print_window.document.close();
								print_window.focus();
								print_window.print();
							},
						});
						dialog.show();
					},
				});
			}).addClass("btn-primary");

			// Billing-only - Pharmacy no longer raises the bill itself, only
			// Billing does, covering everything prescribed (medicines AND
			// suggested tests) in one consolidated Billing record. A Doctor
			// opening their own consultation never sees this button.
			const roles = frappe.user_roles || [];
			const has_billable_items =
				(frm.doc.prescribed_items || []).length || (frm.doc.suggested_tests || []).length;
			if ((roles.includes("Billing Staff") || roles.includes("System Manager")) && has_billable_items) {
				frm.add_custom_button(__("Bill"), () => {
					frappe.call({
						method:
							"metta.sales.doctype.billing.billing.get_billing_items_for_consultation",
						args: { consultation: frm.doc.name },
						callback(r) {
							if (!r.message) return;
							const data = r.message;
							// A full prefill (item, rate, uom, gst, amount) rather than
							// just the item code - child-row fetch_from/change-handlers
							// don't fire for values set this way, so everything Billing
							// needs to see is filled in directly.
							frappe.new_doc("Billing", {
								doctor_consultation: frm.doc.name,
								patient: data.patient,
								prescribed_by: data.doctor,
								billing_category: data.billing_category,
								bill_type: data.bill_type,
								sale_datetime: frappe.datetime.now_datetime(),
								items: data.items.map((i) => ({
									item: i.item,
									item_name: i.item_name,
									qty: i.qty,
									uom: i.uom,
									rate: i.rate,
									gst_percent: i.gst_percent,
									amount: i.amount,
								})),
							});
						},
					});
			}).addClass("btn-primary");
			}

			// Lab Staff need this to actually start work on a suggested test -
			// Doctor and System Manager can also trigger it (e.g. Lab Staff hasn't
			// gotten to it yet and the doctor wants it tracked right away).
			if ((frm.doc.suggested_tests || []).length) {
				frm.add_custom_button(__("Order Diagnostic Tests"), () => {
					frappe.call({
						method:
							"metta.metta.doctype.doctor_consultation.doctor_consultation.create_diagnostic_tests",
						args: { consultation: frm.doc.name },
						callback(r) {
							const created = r.message || [];
							if (!created.length) {
								frappe.msgprint(__("All suggested tests already have a Diagnostic Test."));
								return;
							}
							frappe.msgprint(
								__("Created Diagnostic Test(s): {0}", [
									created
										.map((name) => `<a href="/app/diagnostic-test/${name}">${name}</a>`)
										.join(", "),
								])
							);
						},
					});
				});
			}
		}
	},
	patient_consultation(frm) {
		render_patient_history(frm);
		check_vitals_status(frm);
		show_vitals_popup(frm);
	},
});

// Tracks which document this was last shown for, so it pops up once per
// time a consultation is actually opened/loaded - not again on every
// intermediate Save while the doctor is still writing it up.
let vitals_popup_shown_for = null;

function show_vitals_popup(frm) {
	if (!frm.doc.patient_consultation) return;
	if (vitals_popup_shown_for === frm.doc.name) return;
	vitals_popup_shown_for = frm.doc.name;

	frappe.call({
		method: "metta.metta.doctype.doctor_consultation.doctor_consultation.get_latest_vitals",
		args: { patient_consultation: frm.doc.patient_consultation },
		callback(r) {
			const vitals = r.message;
			// Nothing recorded yet by the nurse - check_vitals_status's alert
			// already covers this case, no need for an empty popup too.
			if (!vitals) return;

			const row = (label, value) => `
				<div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--border-color,#d1d8dd);">
					<span class="text-muted">${label}</span>
					<span><b>${frappe.utils.escape_html(value != null && value !== "" ? String(value) : "—")}</b></span>
				</div>`;

			const bmi_display = vitals.bmi ? `${vitals.bmi} (${vitals.bmi_category || ""})` : "";

			const html = `
				<div>
					${row(__("Temperature (F)"), vitals.temperature)}
					${row(__("Blood Pressure (mmhg)"), vitals.blood_pressure_mmhg)}
					${row(__("Pulse (b/m)"), vitals.pulse)}
					${row(__("Respiration (b/m)"), vitals.respiration)}
					${row(__("Saturation (SpO2)"), vitals.saturation)}
					${row(__("Height (cm)"), vitals.height)}
					${row(__("Weight (Kg)"), vitals.weight)}
					${row(__("BMI"), bmi_display)}
					${row(__("Random Blood Glucose"), vitals.rbg_level)}
					${row(__("PICCLE"), vitals.piccle)}
					${row(__("Nurse's Provisional Diagnosis"), vitals.primary_diagnosis)}
				</div>`;

			const dialog = new frappe.ui.Dialog({
				title: __("Patient Vitals"),
				size: "small",
				fields: [{ fieldtype: "HTML", fieldname: "vitals_html", options: html }],
				primary_action_label: __("Continue"),
				primary_action() {
					dialog.hide();
				},
			});
			dialog.show();
		},
	});
}

function check_vitals_status(frm) {
	if (!frm.doc.patient_consultation) return;
	frappe.call({
		method: "metta.metta.doctype.doctor_consultation.doctor_consultation.get_vitals_status",
		args: { patient_consultation: frm.doc.patient_consultation },
		callback(r) {
			if (r.message && !r.message.completed) {
				// A warning, not a block - the doctor can still proceed (urgent
				// case, or they check vitals themselves), this just flags that
				// the nurse hasn't recorded them yet.
				frappe.show_alert(
					{
						message: __("Vitals not recorded yet by the nurse for this patient - you can still proceed."),
						indicator: "orange",
					},
					7
				);
			}
		},
	});
}

function render_patient_history(frm) {
	const $wrapper = frm.fields_dict.patient_history_html.$wrapper;
	if (!frm.doc.patient_consultation) {
		$wrapper.html(`<div class="text-muted">${__("Pick a Visit to see this patient's history.")}</div>`);
		return;
	}

	frappe.call({
		method: "metta.metta.doctype.doctor_consultation.doctor_consultation.get_patient_history",
		args: { patient_consultation: frm.doc.patient_consultation, exclude: frm.doc.name },
		callback(r) {
			const rows = r.message || [];
			if (!rows.length) {
				$wrapper.html(`<div class="text-muted">${__("No earlier visits on record for this patient.")}</div>`);
				return;
			}
			$wrapper.html(
				rows
					.map((row) => {
						const meds = (row.prescribed_items || [])
							.map((p) => `${frappe.utils.escape_html(p.item_name || "")} (${frappe.utils.escape_html(p.dosage || "")}, ${frappe.utils.escape_html(p.duration || "")})`)
							.join(", ");
						const tests = (row.suggested_tests || [])
							.map((t) => `${frappe.utils.escape_html(t.item_name || "")} (${frappe.utils.escape_html(t.test_type || "")})`)
							.join(", ");
						return `
							<div style="border-bottom:1px solid var(--border-color,#d1d8dd); padding:8px 0;">
								<div><b>${frappe.datetime.str_to_user(row.consultation_datetime)}</b> - ${frappe.utils.escape_html(row.doctor)}</div>
								${row.diagnosis ? `<div><b>${__("Diagnosis")}:</b> ${frappe.utils.escape_html(row.diagnosis)}</div>` : ""}
								${row.clinical_notes ? `<div><b>${__("Clinical Notes")}:</b> ${frappe.utils.escape_html(row.clinical_notes)}</div>` : ""}
								${meds ? `<div class="text-muted">${__("Prescribed")}: ${meds}</div>` : ""}
								${tests ? `<div class="text-muted">${__("Tests Suggested")}: ${tests}</div>` : ""}
							</div>`;
					})
					.join("")
			);
		},
	});
}
