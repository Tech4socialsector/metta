// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.pages["front-desk-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Front Desk Dashboard"),
		single_column: true,
	});

	page.set_primary_action(__("New Visit"), () => frappe.new_doc("Patient Visit"), "add");
	page.add_button(__("New Patient"), () => frappe.new_doc("Patient Registration"));
	page.add_button(__("Refresh"), () => load_stats(page), "refresh");

	page.body.append(`<div class="front-desk-dashboard-wrapper"></div>`);
	load_stats(page);
};

function load_stats(page) {
	const $wrapper = page.body.find(".front-desk-dashboard-wrapper");
	$wrapper.html(`<div class="text-muted" style="padding:20px;">${__("Loading...")}</div>`);

	frappe.call({
		method: "metta.metta.doctype.patient_visit.patient_visit.get_front_desk_dashboard_stats",
		callback(r) {
			const stats = r.message || {};

			const tile = (label, value, color) => `
				<div style="flex:1; min-width:160px; border:1px solid var(--border-color,#d1d8dd); border-radius:8px; padding:16px; text-align:center;">
					<div style="font-size:32px; font-weight:bold; color:${color};">${value}</div>
					<div class="text-muted" style="margin-top:4px;">${label}</div>
				</div>`;

			let html = `
				<div style="display:flex; gap:16px; flex-wrap:wrap; margin:20px 0;">
					${tile(__("Registrations Today"), stats.registrations_today, "#2d95f0")}
					${tile(__("OP Visits Today"), stats.op_visits_today, "#2d95f0")}
					${tile(__("IP Admissions Today"), stats.ip_admissions_today, "#f0932d")}
					${tile(__("Collected Today"), format_currency(stats.collected_today), "#28a745")}
				</div>`;

			html += `<h5 style="margin-top:10px;">${__("Today's Patient Flow")}</h5>`;
			if (stats.patient_flow && stats.patient_flow.length) {
				html += `
					<div style="overflow-x:auto;">
					<table class="table table-bordered">
						<thead>
							<tr>
								<th>${__("Visit")}</th>
								<th>${__("Patient")}</th>
								<th>${__("Category")}</th>
								<th>${__("Nurse")}</th>
								<th>${__("Doctor")}</th>
								<th>${__("Payment")}</th>
							</tr>
						</thead>
						<tbody>
							${stats.patient_flow.map((v) => render_row(v)).join("")}
						</tbody>
					</table>
					</div>`;
			} else {
				html += `<div class="text-muted" style="margin:10px 0;">${__("No patients registered yet today.")}</div>`;
			}

			$wrapper.html(html);

			$wrapper.find(".flow-row").on("click", function () {
				frappe.set_route("Form", "Patient Visit", $(this).data("visit"));
			});
		},
	});
}

function render_row(v) {
	const pill = (done, done_label, pending_label) =>
		done
			? `<span class="indicator-pill green">${done_label}</span>`
			: `<span class="indicator-pill orange">${pending_label}</span>`;

	return `
		<tr class="flow-row" data-visit="${frappe.utils.escape_html(v.name)}" style="cursor:pointer;">
			<td>${frappe.utils.escape_html(v.name)}</td>
			<td>${frappe.utils.escape_html(v.patient_name || "")}</td>
			<td>${frappe.utils.escape_html(v.registration_category || "")}</td>
			<td>${pill(v.nurse_done, __("Done"), __("Pending"))}</td>
			<td>${pill(v.doctor_seen, __("Seen"), __("Waiting"))}</td>
			<td>${format_currency(v.net_amount)}</td>
		</tr>`;
}
