// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.pages["doctor-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("My Dashboard"),
		single_column: true,
	});

	page.body.append(`<div class="doctor-profile-bar" style="margin-bottom:14px;"></div><div class="doctor-dashboard-wrapper"></div>`);
	load_stats(page);
	load_profile(page);

	page.add_inner_button(__("Apply Leave"), () => open_apply_leave_dialog(page));

	// Everything a Doctor used to reach through the "Doctor" workspace's own
	// shortcut cards - this dashboard page is now the one place the "Doctor"
	// nav item goes to, so those still need a way in.
	page.add_menu_item(__("Patient Visit"), () => frappe.set_route("List", "Patient Visit"));
	page.add_menu_item(__("Nurse Interventions"), () => frappe.set_route("List", "Nurse Interventions"));
	page.add_menu_item(__("Doctor Consultation"), () => frappe.set_route("List", "Doctor Consultation"));
	page.add_menu_item(__("Doctor Leave"), () => frappe.set_route("List", "Doctor Leave"));

	page.set_primary_action(__("Refresh"), () => load_stats(page), "refresh");

	// Fired by Patient Visit.after_insert() when a new patient is assigned to
	// this doctor - so the dashboard picks it up on its own instead of
	// waiting for a manual Refresh. off() first guards against a duplicate
	// listener if on_page_load ever runs more than once for this page.
	frappe.realtime.off("doctor_dashboard_update");
	frappe.realtime.on("doctor_dashboard_update", () => load_stats(page));
};

function load_profile(page) {
	frappe.call({
		method: "metta.metta.doctype.doctor_consultation.doctor_consultation.get_my_profile",
		callback(r) {
			render_profile(page, r.message);
		},
	});
}

function render_profile(page, profile) {
	const $target = page.body.find(".doctor-profile-bar");
	if (!profile) {
		$target.empty();
		return;
	}
	const item = (label, value) =>
		value
			? `<span style="margin-right:18px;"><span class="text-muted">${label}:</span> ${frappe.utils.escape_html(value)}</span>`
			: "";

	$target.html(`
		<div style="font-size:13px; padding:8px 0; border-bottom:1px solid var(--border-color,#d1d8dd);">
			<strong>${frappe.utils.escape_html(profile.name || "")}</strong>
			<span style="margin:0 4px;">·</span>
			${item(__("Department"), profile.department)}
			${item(__("Specialization"), profile.specialization)}
			${item(__("Qualification"), profile.qualification)}
			${item(__("Reg. No."), profile.registration_number)}
			${item(__("Mobile"), profile.mobile)}
		</div>
	`);
}

function open_apply_leave_dialog(page) {
	const dialog = new frappe.ui.Dialog({
		title: __("Apply Leave"),
		fields: [
			{ fieldtype: "Date", fieldname: "from_date", label: __("From Date"), reqd: 1, default: "Today" },
			{ fieldtype: "Date", fieldname: "to_date", label: __("To Date"), reqd: 1, default: "Today" },
			{ fieldtype: "Small Text", fieldname: "reason", label: __("Reason") },
		],
		primary_action_label: __("Apply"),
		primary_action(values) {
			frappe.call({
				method: "metta.metta.doctype.doctor_consultation.doctor_consultation.apply_my_leave",
				args: values,
				freeze: true,
				callback(r) {
					if (r.message) {
						frappe.show_alert({ message: __("Leave applied."), indicator: "green" });
						dialog.hide();
						load_stats(page);
					}
				},
			});
		},
	});
	dialog.show();
}

const TILE_LABELS = {
	assigned: __("Assigned Today"),
	visited: __("Visited Today"),
	ready: __("Ready to Consult"),
	waiting: __("Waiting for Vitals"),
	admitted: __("Admitted (IP)"),
};
const TILE_COLORS = {
	assigned: "#2d95f0",
	visited: "#28a745",
	ready: "#f0932d",
	waiting: "#dc3545",
	admitted: "#6c757d",
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
				<div class="dashboard-leave-banner"></div>
				<div class="dashboard-tiles" style="display:flex; gap:16px; flex-wrap:wrap; margin:20px 0;"></div>
				<div class="dashboard-list"></div>
				<div class="dashboard-extra-tiles" style="display:flex; gap:16px; flex-wrap:wrap; margin-top:28px;"></div>
			`);
			render_leave_banner(page);
			render_tiles(page);
			render_list(page);
			render_extra_tiles(page);
		},
	});
}

function render_leave_banner(page) {
	const $wrapper = page.body.find(".doctor-dashboard-wrapper");
	const leave = page._dashboard_stats.leave;
	if (!leave) {
		$wrapper.find(".dashboard-leave-banner").empty();
		return;
	}
	$wrapper.find(".dashboard-leave-banner").html(`
		<div style="
			background:#fbeedd; color:#a66a2c; border-radius:8px; padding:10px 14px;
			font-size:13px; font-weight:600; margin-top:10px;">
			${__("You have Doctor Leave scheduled")}
			<span style="font-weight:500; color:var(--text-muted,#5c6b63); margin-left:4px;">
				${frappe.datetime.str_to_user(leave.from_date)} – ${frappe.datetime.str_to_user(leave.to_date)}
			</span>
		</div>
	`);
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
		["assigned", "visited", "ready", "waiting", "admitted"].map(tile_html).join("")
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
		if (kind === "admitted") {
			return `<a href="/app/patient-visit/${encodeURIComponent(v.name)}" target="_blank">${__("View Visit")}</a>`;
		}
		// "assigned" - the raw overview, mixing all states - shows where each
		// one currently stands instead of an action to take.
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

function render_extra_tiles(page) {
	const $wrapper = page.body.find(".doctor-dashboard-wrapper");
	const stats = page._dashboard_stats;
	const appointments = stats.appointments_today || [];
	const discharge_pending = stats.discharge_pending_visits || [];

	const extra_tile = (count, label) => `
		<div class="dashboard-extra-tile" style="
			flex:1; min-width:200px; border:2px solid var(--border-color,#d1d8dd);
			border-radius:8px; padding:16px; text-align:center; cursor:pointer;">
			<div style="font-size:32px; font-weight:bold;">${count}</div>
			<div class="text-muted" style="margin-top:4px;">${label}</div>
		</div>`;

	$wrapper.find(".dashboard-extra-tiles").html(
		extra_tile(appointments.length, __("Today's Appointments")) +
			extra_tile(discharge_pending.length, __("Discharge Summary Pending"))
	);

	const $tiles = $wrapper.find(".dashboard-extra-tile");
	$tiles.eq(0).on("click", () => open_appointments_dialog(appointments));
	$tiles.eq(1).on("click", () => open_discharge_pending_dialog(page, discharge_pending));
}

function open_appointments_dialog(appointments) {
	const rows = !appointments.length
		? `<div class="text-muted">${__("Nothing scheduled for today.")}</div>`
		: `<table class="table table-bordered">
			<thead><tr><th>${__("Time")}</th><th>${__("Patient")}</th><th>${__("Status")}</th><th>${__("Reason")}</th></tr></thead>
			<tbody>
				${appointments
					.map(
						(a, i) => `
					<tr class="appointment-row" data-idx="${i}" style="cursor:pointer;">
						<td>${frappe.datetime.str_to_user(a.appointment_time, true)}</td>
						<td>${frappe.utils.escape_html(a.patient_name || "")}</td>
						<td>${frappe.utils.escape_html(a.status || "")}</td>
						<td>${frappe.utils.escape_html(a.reason_for_visit || "")}</td>
					</tr>`
					)
					.join("")}
			</tbody>
		</table>`;

	const dialog = new frappe.ui.Dialog({
		title: __("Today's Appointments"),
		size: "large",
		fields: [{ fieldtype: "HTML", fieldname: "content", options: rows }],
	});
	dialog.show();

	// A visit only exists once the patient's actually checked in - before
	// that, the Appointment record itself is all there is to look at.
	dialog.$wrapper.find(".appointment-row").on("click", function () {
		const a = appointments[$(this).data("idx")];
		if (a.patient_visit) {
			window.open(`/app/patient-visit/${encodeURIComponent(a.patient_visit)}`, "_blank");
		} else {
			window.open(`/app/appointment/${encodeURIComponent(a.name)}`, "_blank");
		}
	});
}

function open_discharge_pending_dialog(page, visits) {
	const rows = !visits.length
		? `<div class="text-muted">${__("Nothing pending.")}</div>`
		: `<table class="table table-bordered">
			<thead><tr><th>${__("Visit")}</th><th>${__("Patient")}</th><th>${__("Discharged On")}</th></tr></thead>
			<tbody>
				${visits
					.map(
						(v, i) => `
					<tr class="discharge-row" data-idx="${i}" style="cursor:pointer;">
						<td>${frappe.utils.escape_html(v.name)}</td>
						<td>${frappe.utils.escape_html(v.patient_name || "")}</td>
						<td>${v.discharge_date ? frappe.datetime.str_to_user(v.discharge_date) : ""}</td>
					</tr>`
					)
					.join("")}
			</tbody>
		</table>
		<p class="text-muted">${__("Click a row to write that patient's Discharge Summary.")}</p>`;

	const dialog = new frappe.ui.Dialog({
		title: __("Discharge Summary Pending"),
		size: "large",
		fields: [{ fieldtype: "HTML", fieldname: "content", options: rows }],
	});
	dialog.show();

	dialog.$wrapper.find(".discharge-row").on("click", function () {
		const v = visits[$(this).data("idx")];
		frappe.call({
			method: "metta.metta.doctype.patient_visit.patient_visit.get_discharge_defaults",
			args: { patient_visit: v.name },
			callback(r) {
				if (r.message) {
					dialog.hide();
					frappe.new_doc("Discharge Summary", r.message);
				}
			},
		});
	});
}
