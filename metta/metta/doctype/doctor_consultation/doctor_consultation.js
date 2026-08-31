// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Doctor Consultation", {
	setup(frm) {
		// Only offers Medicine that Pharmacy actually has in stock right now -
		// not just anything tagged Medicine in the Item master.
		frm.set_query("item", "prescribed_items", () => ({
			query: "metta.metta.doctype.doctor_consultation.doctor_consultation.prescribable_item_query",
		}));
		// A suggested test has to be a real, priced Service item - that's
		// what makes it billable at all, not free text.
		frm.set_query("item", "suggested_tests", () => ({
			filters: { item_type: "Service", is_active: 1 },
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
		render_prescription_item_search(frm);

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
							// needs to see is filled in directly. Medicines go to Pharmacy
							// Items, tests go to Service Items - two separate tables now.
							const as_row = (i) => ({
								item: i.item,
								item_name: i.item_name,
								qty: i.qty,
								uom: i.uom,
								rate: i.rate,
								gst_percent: i.gst_percent,
								amount: i.amount,
							});
							const bill_type =
								data.pharmacy_items.length && data.service_items.length
									? "Mixed"
									: data.pharmacy_items.length
										? "Pharmacy"
										: "Service";
							frappe.new_doc("Billing", {
								doctor_consultation: frm.doc.name,
								patient: data.patient,
								prescribed_by: data.doctor,
								billing_category: data.billing_category,
								sale_datetime: frappe.datetime.now_datetime(),
								bill_type: bill_type,
								pharmacy_items: data.pharmacy_items.map(as_row),
								service_items: data.service_items.map(as_row),
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

				// For the "order a test, then prescribe once the result is back"
				// flow - a fresh consultation is needed rather than editing this
				// one, since Billing refuses a second bill against an already-billed
				// consultation. Pre-linking the same visit/doctor here so the doctor
				// doesn't have to look either up again by hand.
				frm.add_custom_button(__("Follow-up Consultation"), () => {
					frappe.new_doc("Doctor Consultation", {
						patient_consultation: frm.doc.patient_consultation,
						doctor: frm.doc.doctor,
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

function show_vitals_popup(frm) {
	// Only when a brand-new consultation is first opened for a patient -
	// never again once it's been saved (frm.doc.name changing from a
	// temporary "new-doctor-consultation-..." id to the real DC-2026-00020
	// the moment it's first saved used to defeat a same-name-based guard
	// here, re-popping this right after the doctor's first Save), and never
	// again on reopening an already-saved consultation later either.
	if (!frm.is_new() || !frm.doc.patient_consultation) return;
	if (frm._vitals_popup_shown) return;
	frm._vitals_popup_shown = true;

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
			const blood_sugar_display = vitals.rbg_level
				? `${vitals.rbg_level}${vitals.blood_sugar_status ? ` (${vitals.blood_sugar_status})` : ""}`
				: "";
			const hemoglobin_display = vitals.hemoglobin_level
				? `${vitals.hemoglobin_level}${vitals.anemia_status ? ` (${vitals.anemia_status})` : ""}`
				: "";

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
					${row(__("Random Blood Glucose"), blood_sugar_display)}
					${row(__("Hemoglobin (g/dL)"), hemoglobin_display)}
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
						// Shows the actual result once Reported, so the doctor doesn't
						// have to separately open the Diagnostic Test to see it - just
						// the status (e.g. "Sample Collected") while still pending.
						const diagnostic_tests = (row.diagnostic_tests || [])
							.map((d) =>
								d.status === "Reported"
									? `${frappe.utils.escape_html(d.item_name || "")}: ${frappe.utils.escape_html(d.result || "")}`
									: `${frappe.utils.escape_html(d.item_name || "")} (${frappe.utils.escape_html(d.status || "")})`
							)
							.join(", ");
						return `
							<div style="border-bottom:1px solid var(--border-color,#d1d8dd); padding:8px 0;">
								<div><b>${frappe.datetime.str_to_user(row.consultation_datetime)}</b> - ${frappe.utils.escape_html(row.doctor)}</div>
								${row.diagnosis ? `<div><b>${__("Diagnosis")}:</b> ${frappe.utils.escape_html(row.diagnosis)}</div>` : ""}
								${row.clinical_notes ? `<div><b>${__("Clinical Notes")}:</b> ${frappe.utils.escape_html(row.clinical_notes)}</div>` : ""}
								${meds ? `<div class="text-muted">${__("Prescribed")}: ${meds}</div>` : ""}
								${tests ? `<div class="text-muted">${__("Tests Suggested")}: ${tests}</div>` : ""}
								${diagnostic_tests ? `<div class="text-muted">${__("Test Results")}: ${diagnostic_tests}</div>` : ""}
							</div>`;
					})
					.join("")
			);
		},
	});
}

function render_prescription_item_search(frm) {
	const wrapper = frm.fields_dict.prescription_item_search_area.$wrapper;
	wrapper.html(`
		<div class="rx-item-search-widget" style="border:1px solid var(--border-color, #d1d8dd); border-radius:6px; padding:12px; margin-bottom:10px;">
			<div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
				<div style="flex:2; min-width:220px; position:relative;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${__(
						"Medicine Name"
					)}</label>
					<input type="text" class="form-control rx-item-search" placeholder="${__(
						"Search medicine in stock..."
					)}" autocomplete="off">
					<div class="rx-item-results" style="display:none; position:absolute; z-index:50; background:var(--fg-color,#fff); border:1px solid var(--border-color,#d1d8dd); width:100%; max-height:260px; overflow:auto; box-shadow:0 2px 6px rgba(0,0,0,0.15);"></div>
				</div>
				<div style="width:100px;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${__("Qty")}</label>
					<input type="number" class="form-control rx-item-qty" min="1" step="1" value="1">
				</div>
				<div>
					<button class="btn btn-primary btn-sm rx-item-add">${__("Add")}</button>
				</div>
			</div>
			<div class="rx-item-selected text-muted" style="margin-top:6px; font-size:12px;"></div>
		</div>
	`);

	let selected = null;
	let current_rows = [];
	const $search = wrapper.find(".rx-item-search");
	const $results = wrapper.find(".rx-item-results");
	const $qty = wrapper.find(".rx-item-qty");
	const $selectedNote = wrapper.find(".rx-item-selected");

	const select_row = (idx) => {
		if (!current_rows[idx]) return;
		selected = current_rows[idx];
		$search.val(selected.item_name);
		$selectedNote.text(__("Selected: {0} ({1}) - Warehouse: {2}", [selected.item_name, selected.item_code, selected.warehouse]));
		$results.hide();
		$qty.trigger("focus").trigger("select");
	};

	const render_results = (rows) => {
		current_rows = rows || [];
		if (!current_rows.length) {
			$results.html(`<div class="text-muted" style="padding:8px;">${__("No matches in stock")}</div>`).show();
			return;
		}
		const header = `
			<table class="table table-condensed" style="margin-bottom:0;">
				<thead>
					<tr>
						<th>${__("Name")}</th>
						<th class="text-right">${__("Avail. Qty")}</th>
						<th>${__("Warehouse")}</th>
					</tr>
				</thead>
				<tbody>
					${current_rows
						.map(
							(r, i) => `
						<tr class="rx-item-row" data-idx="${i}" style="cursor:pointer;">
							<td>${frappe.utils.escape_html(r.item_name)}</td>
							<td class="text-right">${flt(r.avail_qty)}</td>
							<td>${frappe.utils.escape_html(r.warehouse || "")}</td>
						</tr>`
						)
						.join("")}
				</tbody>
			</table>`;
		$results.html(header).show();
		$results.find(".rx-item-row").on("click", function () {
			select_row($(this).data("idx"));
		});
	};

	const do_search = frappe.utils.debounce((term) => {
		frappe.call({
			method:
				"metta.metta.doctype.doctor_consultation.doctor_consultation.search_pharmacy_items_for_prescription",
			args: { search_term: term },
			callback(r) {
				render_results(r.message);
			},
		});
	}, 300);

	$search.on("input", () => {
		selected = null;
		$selectedNote.text("");
		do_search($search.val());
	});
	$search.on("focus", () => {
		if (!$search.val()) do_search("");
	});
	$(document).on("click.rx-item-search", (e) => {
		if (!$(e.target).closest(".rx-item-search-widget").length) $results.hide();
	});

	wrapper.find(".rx-item-add").on("click", () => {
		if (!selected) {
			frappe.msgprint(__("Please search and select a medicine first."));
			return;
		}
		const qty = cint($qty.val());
		if (!qty || qty <= 0) {
			frappe.msgprint(__("Please enter a Qty greater than 0."));
			return;
		}

		// Frappe auto-adds one blank starter row to a new document's required
		// Table field - remove it before adding the first real item, so it
		// doesn't linger as an empty Row 1 forever.
		const existing_rows = frm.doc.prescribed_items || [];
		if (existing_rows.length && existing_rows.every((r) => !r.item)) {
			frm.clear_table("prescribed_items");
		}

		const row = frm.add_child("prescribed_items");
		row.item = selected.item_code;
		row.item_name = selected.item_name;
		row.qty = qty;
		frm.refresh_field("prescribed_items");

		selected = null;
		$search.val("");
		$qty.val("1");
		$selectedNote.text("");
		$results.hide();
	});
}
