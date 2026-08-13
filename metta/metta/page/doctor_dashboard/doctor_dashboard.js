// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.pages["doctor-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("My Dashboard"),
		single_column: true,
	});

	page.body.append(`<div class="doctor-dashboard-wrapper"></div>`);
	load_stats(page);

	page.set_primary_action(__("Refresh"), () => load_stats(page), "refresh");
};

function load_stats(page) {
	const $wrapper = page.body.find(".doctor-dashboard-wrapper");
	$wrapper.html(`<div class="text-muted" style="padding:20px;">${__("Loading...")}</div>`);

	frappe.call({
		method: "metta.metta.doctype.doctor_consultation.doctor_consultation.get_my_dashboard_stats",
		callback(r) {
			const stats = r.message || {};
			if (!stats.linked) {
				$wrapper.html(
					`<div class="text-muted" style="padding:20px;">${__(
						"Your account isn't linked to a Doctor Master record, so there's nothing to show here - ask an administrator to link it."
					)}</div>`
				);
				return;
			}

			const tile = (label, value, color) => `
				<div style="flex:1; min-width:160px; border:1px solid var(--border-color,#d1d8dd); border-radius:8px; padding:16px; text-align:center;">
					<div style="font-size:32px; font-weight:bold; color:${color};">${value}</div>
					<div class="text-muted" style="margin-top:4px;">${label}</div>
				</div>`;

			let html = `
				<div style="display:flex; gap:16px; flex-wrap:wrap; margin:20px 0;">
					${tile(__("Assigned to Me"), stats.assigned, "#2d95f0")}
					${tile(__("Visited"), stats.visited, "#28a745")}
					${tile(__("Ready to Consult"), stats.ready, "#f0932d")}
					${tile(__("Waiting for Vitals"), stats.waiting, "#dc3545")}
				</div>`;

			const visit_table = (visits, show_consult_button) => `
				<table class="table table-bordered">
					<thead><tr><th>${__("Visit")}</th><th>${__("Patient")}</th><th>${__("Category")}</th><th></th></tr></thead>
					<tbody>
						${visits
							.map(
								(v) => `
							<tr>
								<td>${frappe.utils.escape_html(v.name)}</td>
								<td>${frappe.utils.escape_html(v.patient_name || "")}</td>
								<td>${frappe.utils.escape_html(v.registration_category || "")}</td>
								<td>
									${
										show_consult_button
											? `<button class="btn btn-xs btn-primary consult-btn" data-visit="${frappe.utils.escape_html(
													v.name
												)}">${__("Consult")}</button>`
											: `<span class="text-muted">${__("Waiting on nurse")}</span>`
									}
								</td>
							</tr>`
							)
							.join("")}
					</tbody>
				</table>`;

			if (stats.ready_visits && stats.ready_visits.length) {
				html += `<h5 style="margin-top:10px;">${__("Ready to Consult")}</h5>`;
				html += visit_table(stats.ready_visits, true);
			}

			if (stats.waiting_visits && stats.waiting_visits.length) {
				html += `<h5 style="margin-top:10px;">${__("Waiting for Vitals")}</h5>`;
				html += visit_table(stats.waiting_visits, false);
			}

			if (!stats.ready_visits.length && !stats.waiting_visits.length && stats.assigned > 0) {
				html += `<div class="text-muted" style="margin-top:10px;">${__("No pending patients — you're all caught up.")}</div>`;
			}

			$wrapper.html(html);

			// Goes straight to writing the consultation, not to the (read-only,
			// for a doctor) Patient Visit record - that's the actual next
			// action someone clicking a ready patient wants to take.
			$wrapper.find(".consult-btn").on("click", function () {
				frappe.new_doc("Doctor Consultation", { patient_consultation: $(this).data("visit") });
			});
		},
	});
}
