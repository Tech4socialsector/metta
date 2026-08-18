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

const TILE_LABELS = {
	assigned: __("Assigned to Me"),
	visited: __("Visited"),
	ready: __("Ready to Consult"),
	waiting: __("Waiting for Vitals"),
};
const TILE_COLORS = {
	assigned: "#2d95f0",
	visited: "#28a745",
	ready: "#f0932d",
	waiting: "#dc3545",
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

			// Cached so clicking between tiles just re-renders from what's
			// already been fetched, instead of a fresh server call per click -
			// "Refresh" is what re-fetches.
			page._dashboard_stats = stats;
			page._dashboard_active_tile = "ready";

			$wrapper.html(`
				<div class="dashboard-tiles" style="display:flex; gap:16px; flex-wrap:wrap; margin:20px 0;"></div>
				<div class="dashboard-list"></div>
			`);
			render_tiles(page);
			render_list(page);
		},
	});
}

function render_tiles(page) {
	const $wrapper = page.body.find(".doctor-dashboard-wrapper");
	const stats = page._dashboard_stats;
	const active = page._dashboard_active_tile;

	const tile_html = (key) => {
		const is_active = key === active;
		return `
			<div class="dashboard-tile" data-key="${key}" style="
				flex:1; min-width:160px; border:2px solid ${is_active ? TILE_COLORS[key] : "var(--border-color,#d1d8dd)"};
				border-radius:8px; padding:16px; text-align:center; cursor:pointer;
				background:${is_active ? "var(--control-bg,#f5f7fa)" : "transparent"};">
				<div style="font-size:32px; font-weight:bold; color:${TILE_COLORS[key]};">${stats[key]}</div>
				<div class="text-muted" style="margin-top:4px;">${TILE_LABELS[key]}</div>
			</div>`;
	};

	$wrapper.find(".dashboard-tiles").html(
		["assigned", "visited", "ready", "waiting"].map(tile_html).join("")
	);

	$wrapper.find(".dashboard-tile").on("click", function () {
		page._dashboard_active_tile = $(this).data("key");
		render_tiles(page);
		render_list(page);
	});
}

function render_list(page) {
	const $wrapper = page.body.find(".doctor-dashboard-wrapper");
	const stats = page._dashboard_stats;
	const key = page._dashboard_active_tile;
	const visits = stats[`${key}_visits`] || [];

	if (!visits.length) {
		$wrapper.find(".dashboard-list").html(
			`<div class="text-muted" style="margin-top:10px;">${__("Nothing here right now.")}</div>`
		);
		return;
	}

	$wrapper.find(".dashboard-list").html(`
		<h5 style="margin-top:10px;">${TILE_LABELS[key]}</h5>
		${visit_table(visits, key)}
	`);

	$wrapper.find(".consult-btn").on("click", function () {
		// Goes straight to writing the consultation, not to the (read-only,
		// for a doctor) Patient Visit record - that's the actual next action
		// someone clicking a ready patient wants to take.
		frappe.new_doc("Doctor Consultation", { patient_consultation: $(this).data("visit") });
	});
}

function visit_table(visits, kind) {
	const action_cell = (v) => {
		if (kind === "ready") {
			const vitals_link = v.nurse_intervention
				? ` <a href="/app/nurse-interventions/${encodeURIComponent(v.nurse_intervention)}" target="_blank">${__("View Vitals")}</a>`
				: "";
			return `<button class="btn btn-xs btn-primary consult-btn" data-visit="${frappe.utils.escape_html(
				v.name
			)}">${__("Consult")}</button>${vitals_link}`;
		}
		if (kind === "waiting") {
			return `<span class="text-muted">${__("Waiting on nurse")}</span>`;
		}
		if (kind === "visited") {
			return v.consultation
				? `<a href="/app/doctor-consultation/${encodeURIComponent(v.consultation)}" target="_blank">${__("View Consultation")}</a>`
				: "";
		}
		// "assigned" - the raw overview, mixing all three states - shows where
		// each one currently stands instead of an action to take.
		if (v.consultation) return `<span class="text-muted">${__("Visited")}</span>`;
		if (v.nurse_intervention) return `<span class="text-muted">${__("Ready to Consult")}</span>`;
		return `<span class="text-muted">${__("Waiting for Vitals")}</span>`;
	};

	return `
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
						<td>${action_cell(v)}</td>
					</tr>`
					)
					.join("")}
			</tbody>
		</table>`;
}
