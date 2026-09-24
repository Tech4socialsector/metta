// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

const HO_METHOD = "metta.metta.page.hospital_overview.hospital_overview";
const HO_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948", "#008300"];
const HO_TABS = [
	{ key: "clinical", label: "Clinical Overview" },
	{ key: "stock", label: "Stock & Pharmacy" },
];

frappe.pages["hospital-overview"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Hospital Overview"),
		single_column: true,
	});

	page.add_button(__("Refresh"), () => ho_loadActive(page), "refresh");
	ho_inject_styles();

	page.ho = {
		tab: "clinical",
		from_date: "",
		to_date: "",
		doctor: "",
		category: "",
		doctors: [],
		categories: [],
		warehouse: "",
		item_category: "",
		warehouses: [],
	};

	page.body.append(`<div class="ho-dash"><div class="ho-root">${__("Loading...")}</div></div>`);

	Promise.all([
		frappe.call({ method: `${HO_METHOD}.get_doctors` }),
		frappe.call({ method: `${HO_METHOD}.get_categories` }),
		frappe.call({ method: `${HO_METHOD}.get_warehouses` }),
	]).then(([doctorsRes, categoriesRes, warehousesRes]) => {
		page.ho.doctors = doctorsRes.message || [];
		page.ho.categories = categoriesRes.message || [];
		page.ho.warehouses = warehousesRes.message || [];
		ho_loadActive(page);
	});
};

function ho_loadActive(page) {
	if (page.ho.tab === "stock") {
		ho_loadStock(page);
	} else {
		ho_load(page);
	}
}

function ho_switchTab(page, tab) {
	page.ho.tab = tab;
	ho_loadActive(page);
}

function ho_load(page) {
	frappe.call({
		method: `${HO_METHOD}.get_dashboard_data`,
		args: {
			from_date: page.ho.from_date,
			to_date: page.ho.to_date,
			doctor: page.ho.doctor || null,
			category: page.ho.category || null,
		},
		callback(r) {
			ho_render(page, r.message || {});
		},
	});
}

function ho_heroAndTabs(page) {
	const tabsHtml = HO_TABS.map(
		(t) => `<button type="button" class="tab-btn ${t.key === page.ho.tab ? "active" : ""}" data-tab="${t.key}">${__(t.label)}</button>`
	).join("");
	return `
		<div class="hero-bar">
			<div class="hero-left">
				<span class="hero-icon">🏥</span>
				<div>
					<h1>${__("Hospital Overview")}</h1>
					<div class="hero-sub">${__("Clinical & billing snapshot — Landour Community Hospital")}</div>
				</div>
			</div>
			<span class="live-dot">● ${__("Live")}</span>
		</div>
		<div class="tab-bar">${tabsHtml}</div>
	`;
}

function ho_render(page, data) {
	const $root = page.body.find(".ho-root");
	let colorIdx = 0;
	const nextColor = () => HO_COLORS[colorIdx++ % HO_COLORS.length];
	const wrap = (label, value, sub, drillKey) =>
		`<div class="tile${drillKey ? " clickable" : ""}"${drillKey ? ` data-drill="${drillKey}" role="button" tabindex="0"` : ""} style="border-top-color:${nextColor()};">
			<div class="value-row"><span class="value">${value}</span></div><span class="label">${label}</span>${
				drillKey ? `<span class="view-all">${__("View list")} →</span>` : ""
			}
		</div>`;

	const deltaChip =
		data.registered_delta === null || data.registered_delta === undefined
			? ""
			: `<span class="delta ${data.registered_delta >= 0 ? "good" : "warn"}">${
					data.registered_delta >= 0 ? "+" : ""
			  }${data.registered_delta} vs yesterday</span>`;

	const doctorLabel = page.ho.doctor ? page.ho.doctor : __("All Doctors");

	const dischargeStatus =
		data.discharge_summary_pending > 0
			? `<span class="status-pill"><span class="dot" style="background:var(--ho-warning);"></span>${__(
					"Needs follow-up"
			  )}</span>`
			: `<span class="status-pill"><span class="dot" style="background:var(--ho-good);"></span>${__(
					"All caught up"
			  )}</span>`;

	const modeEntries = Object.entries(data.collected_by_mode || {});
	const modeCards = modeEntries.length
		? modeEntries
				.sort((a, b) => b[1] - a[1])
				.map(
					([mode, amt]) => `<div class="tile clickable" data-mode="${frappe.utils.escape_html(mode)}" role="button" tabindex="0" style="border-top-color:${nextColor()};">
						<div class="value-row"><span class="value">${format_currency(amt)}</span></div><span class="label">${mode}</span>
						<span class="view-all">${__("View bills")} →</span>
					</div>`
				)
				.join("")
		: "";
	const modeSub = modeEntries.length
		? modeEntries.map(([mode, amt]) => `${mode} ${format_currency(amt)}`).join(" · ")
		: __("No collections in this range");

	const mix = data.patient_mix || [];
	const mixCards = mix.length
		? mix
				.map(
					(row) => `<div class="tile clickable" data-mix="${frappe.utils.escape_html(row.category)}" role="button" tabindex="0" style="border-top-color:${nextColor()};">
						<div class="value-row"><span class="value">${row.count}</span></div><span class="label">${row.category}</span>
						<span class="view-all">${__("View list")} →</span>
					</div>`
				)
				.join("")
		: "";

	const docRows = (data.doctor_table || [])
		.map(
			(d) => `<tr><td>${d.doctor}</td><td>${d.visits}</td><td>${d.seen}</td>
				<td><div class="pct-cell"><span>${d.pct}%</span><div class="mini-track"><div style="width:${d.pct}%;"></div></div></div></td></tr>`
		)
		.join("");

	const doctorOptions = [`<option value="">${__("All Doctors")}</option>`]
		.concat(page.ho.doctors.map((d) => `<option value="${frappe.utils.escape_html(d)}" ${d === page.ho.doctor ? "selected" : ""}>${d}</option>`))
		.join("");
	const categoryOptions = [`<option value="">${__("All Categories")}</option>`]
		.concat(
			page.ho.categories.map(
				(c) => `<option value="${frappe.utils.escape_html(c)}" ${c === page.ho.category ? "selected" : ""}>${c}</option>`
			)
		)
		.join("");

	const html = `
		${ho_heroAndTabs(page)}

		<div class="filter-panel">
			<div class="filter-field">
				<label>${__("Doctor")}</label>
				<select class="filter-select" id="hoDoctor">${doctorOptions}</select>
			</div>
			<div class="filter-field">
				<label>${__("Category")}</label>
				<select class="filter-select" id="hoCategory">${categoryOptions}</select>
			</div>
			<div class="filter-field">
				<label>${__("Start Date")}</label>
				<input type="date" class="date-input" id="hoFrom" value="${page.ho.from_date}">
			</div>
			<div class="filter-field">
				<label>${__("End Date")}</label>
				<input type="date" class="date-input" id="hoTo" value="${page.ho.to_date}">
			</div>
			<div class="filter-actions">
				<button type="button" class="btn-clear" id="hoClear">${__("Clear")}</button>
				<button type="button" class="btn-apply" id="hoApply">${__("Apply")}</button>
			</div>
		</div>

		<section class="block">
			<div class="section-label"><span>${__("Patient Volume")}</span><span class="rule"></span></div>
			<div class="tile-grid">
				<div class="tile clickable" data-drill="registered" role="button" tabindex="0" style="border-top-color:${nextColor()};">
					<div class="value-row"><span class="value">${data.registered_count || 0}</span>${deltaChip}</div><span class="label">${__("Registered")}</span>
					<span class="view-all">${__("View list")} →</span>
				</div>
				${wrap(__("OP Visits"), data.visits_op || 0, __("Outpatient · Patient Visit"), "op_visits")}
				${wrap(__("IP Visits"), data.visits_ip || 0, __("Inpatient · Patient Visit"), "ip_visits")}
				${wrap(__("Currently Admitted (IP)"), data.currently_admitted || 0, __("Across Ward & Room beds"), "currently_admitted")}
			</div>
		</section>

		<section class="block">
			<div class="section-label"><span>${__("Clinical Flow")}</span><span class="rule"></span><span class="hint">${__("Doctor filter changes the tile below")}</span></div>
			<div class="tile-grid">
				${wrap(__("Vitals Completed"), data.nurse_done || 0, __("Nurse Interventions · status = Completed"), "vitals_completed")}
				${wrap(__("Vitals Pending"), data.nurse_pending || 0, __("Nurse Interventions · status = Pending"), "vitals_pending")}
				<div class="tile clickable" data-drill="seen_by_doctor" role="button" tabindex="0" style="border-top-color:${nextColor()};">
					<div class="value-row"><span class="value">${data.seen_count || 0}</span></div><span class="label">${__("Seen by Doctor")} — ${doctorLabel}</span>
					<span class="view-all">${__("View list")} →</span>
				</div>
				${wrap(__("Referrals"), data.referral_count || 0, __("Doctor Consultation → Referred To"), "referrals")}
			</div>
			<div class="chart-panel" style="margin-top:12px;">
				<h3>${__("Doctor-wise")}</h3>
				<div class="chart-sub">${__("Highlights change with the filter bar above")}</div>
				<div class="table-scroll">
					<table class="doc-table">
						<thead><tr><th>${__("Doctor")}</th><th>${__("Visits")}</th><th>${__("Seen")}</th><th>${__("Seen %")}</th></tr></thead>
						<tbody>${docRows || `<tr><td colspan="4" class="sub">${__("No data in this range")}</td></tr>`}</tbody>
					</table>
				</div>
			</div>
		</section>

		<section class="block">
			<div class="section-label"><span>${__("Admission & Discharge")}</span><span class="rule"></span></div>
			<div class="tile-grid">
				${wrap(__("Discharged"), data.discharged_count || 0, __("Patient Visit · admission_status"), "discharged")}
				<div class="tile${data.discharge_summary_pending > 0 ? " clickable" : ""}" ${data.discharge_summary_pending > 0 ? 'data-drill="discharge_pending" role="button" tabindex="0"' : ""} style="border-top-color:${nextColor()};">
					<div class="value-row"><span class="value">${data.discharge_summary_pending || 0}</span></div><span class="label">${__("Discharge Summary Pending")}</span>
					${dischargeStatus}
					${data.discharge_summary_pending > 0 ? `<span class="view-all">${__("View list")} →</span>` : ""}
				</div>
				${wrap(__("MLC Cases"), data.mlc_count || 0, __("Patient Visit · is_mlc_case"), "mlc")}
			</div>
		</section>

		<section class="block">
			<div class="section-label"><span>${__("Billing · Subsidy (Charity) · TDS")}</span><span class="rule"></span></div>
			<div class="tile-grid">
				${wrap(__("Total Collected"), format_currency(data.total_collected || 0), modeSub, "total_collected")}
				${wrap(__("Advance Collected"), format_currency(data.advance_collected_amount || 0), `${data.advance_collected_count || 0} ${__("receipts")} · ${__("Patient Advance")}`, "advance")}
				${wrap(__("Subsidy — General Patients"), format_currency(data.subsidy_general_amount || 0), `${__("Given to")} ${data.subsidy_general_count || 0} ${__("bills")}`, "subsidy_general")}
				${wrap(__("Subsidy — Staff & Dependents"), format_currency(data.subsidy_staff_amount || 0), `${__("Given to")} ${data.subsidy_staff_count || 0} ${__("bills")}`, "subsidy_staff")}
				${wrap(__("TDS / Markup Collected"), format_currency(data.tds_amount || 0), `${data.tds_count || 0} ${__("bills")}`, "tds")}
			</div>
			${modeCards ? `<div class="section-label" style="margin-top:20px;"><span>${__("Collections by Payment Mode")}</span><span class="rule"></span><span class="hint">${__("Click a card to open the matching bills in a new tab")}</span></div><div class="tile-grid">${modeCards}</div>` : ""}
		</section>

		<section class="block">
			<div class="section-label"><span>${__("Patient Mix")}</span><span class="rule"></span><span class="hint">${__("Visits in this range, by billing category")}</span></div>
			<div class="tile-grid">${mixCards || `<div class="sub">${__("No visits in this range")}</div>`}</div>
		</section>
	`;

	$root.html(html);
	ho_wireEvents(page, $root, data);
}

function ho_loadStock(page) {
	frappe.call({
		method: `${HO_METHOD}.get_stock_data`,
		args: {
			from_date: page.ho.from_date,
			to_date: page.ho.to_date,
			warehouse: page.ho.warehouse || null,
			category: page.ho.item_category || null,
		},
		callback(r) {
			ho_renderStock(page, r.message || {});
		},
	});
}

function ho_renderStock(page, data) {
	const $root = page.body.find(".ho-root");
	let colorIdx = 0;
	const nextColor = () => HO_COLORS[colorIdx++ % HO_COLORS.length];
	const wrap = (label, value, sub, drillKey) =>
		`<div class="tile${drillKey ? " clickable" : ""}"${drillKey ? ` data-drill="${drillKey}" role="button" tabindex="0"` : ""} style="border-top-color:${nextColor()};">
			<div class="value-row"><span class="value">${value}</span></div><span class="label">${label}</span>${
				drillKey ? `<span class="view-all">${__("View list")} →</span>` : ""
			}
		</div>`;

	const warehouseOptions = [`<option value="">${__("All Warehouses")}</option>`]
		.concat(
			page.ho.warehouses.map(
				(w) => `<option value="${frappe.utils.escape_html(w)}" ${w === page.ho.warehouse ? "selected" : ""}>${w}</option>`
			)
		)
		.join("");
	const itemCatOptions = ["", "Medicine", "Consumable"]
		.map((c) => `<option value="${c}" ${c === page.ho.item_category ? "selected" : ""}>${c || __("All Categories")}</option>`)
		.join("");

	const byLocation = data.stock_by_location || [];
	const locationCards = byLocation.length
		? byLocation
				.map(
					(row) => `<div class="tile clickable" data-location="${frappe.utils.escape_html(row.category)}" role="button" tabindex="0" style="border-top-color:${nextColor()};">
						<div class="value-row"><span class="value">${format_currency(row.value)}</span></div><span class="label">${row.category}</span>
						<span class="view-all">${__("View list")} →</span>
					</div>`
				)
				.join("")
		: "";

	const issuesByLocation = Object.entries(data.issues_by_location || {});
	const issuesSub = issuesByLocation.length
		? `${data.issues_qty || 0} ${__("units")} · ` + issuesByLocation.map(([loc, qty]) => `${loc} ${qty}`).join(" · ")
		: __("No material issued in this range");

	const supplierRows = (data.top_suppliers || [])
		.map((s) => {
			const chipClass = s.status === "Paid" ? "ok" : s.status === "Overdue" ? "crit" : "warn";
			return `<tr><td>${s.supplier}</td><td>${s.orders}</td><td>${format_currency(s.spend)}</td><td><span class="status-chip ${chipClass}">${s.status}</span></td></tr>`;
		})
		.join("");

	const html = `
		${ho_heroAndTabs(page)}

		<div class="filter-panel">
			<div class="filter-field">
				<label>${__("Warehouse")}</label>
				<select class="filter-select" id="hoWarehouse">${warehouseOptions}</select>
			</div>
			<div class="filter-field">
				<label>${__("Item Category")}</label>
				<select class="filter-select" id="hoItemCategory">${itemCatOptions}</select>
			</div>
			<div class="filter-field">
				<label>${__("Start Date")}</label>
				<input type="date" class="date-input" id="hoStockFrom" value="${page.ho.from_date}">
			</div>
			<div class="filter-field">
				<label>${__("End Date")}</label>
				<input type="date" class="date-input" id="hoStockTo" value="${page.ho.to_date}">
			</div>
			<div class="filter-actions">
				<button type="button" class="btn-clear" id="hoStockClear">${__("Clear")}</button>
				<button type="button" class="btn-apply" id="hoStockApply">${__("Apply")}</button>
			</div>
		</div>

		<section class="block">
			<div class="section-label"><span>${__("Stock Levels & Alerts")}</span><span class="rule"></span></div>
			<div class="tile-grid">
				${wrap(__("Low Stock Items"), data.low_stock_count || 0, __("At or below reorder level"), "low_stock")}
				<div class="tile clickable" data-drill="near_expiry" role="button" tabindex="0" style="border-top-color:${nextColor()};">
					<div class="value-row"><span class="value">${data.near_expiry_count || 0}</span></div><span class="label">${__("Near-Expiry Batches")}</span>
					<span class="view-all">${__("View list")} →</span>
				</div>
				<div class="tile clickable" data-drill="expired" role="button" tabindex="0" style="border-top-color:${nextColor()};">
					<div class="value-row"><span class="value">${data.expired_count || 0}</span></div><span class="label">${__("Expired Stock (not removed)")}</span>
					<span class="status-pill"><span class="dot" style="background:var(--ho-critical);"></span>${format_currency(data.expired_value || 0)} — ${__("remove now")}</span>
					<span class="view-all">${__("View list")} →</span>
				</div>
				${wrap(__("Total Stock Value"), format_currency(data.total_stock_value || 0), __("Across selected warehouses"), "total_stock_value")}
			</div>
			${locationCards ? `<div class="section-label" style="margin-top:20px;"><span>${__("Stock Value by Location")}</span><span class="rule"></span><span class="hint">${__("Current on-hand value, by warehouse")}</span></div><div class="tile-grid">${locationCards}</div>` : ""}
		</section>

		<section class="block">
			<div class="section-label"><span>${__("Procurement")}</span><span class="rule"></span></div>
			<div class="tile-grid">
				${wrap(__("Pending Purchase Orders"), data.pending_po_count || 0, __("Approval, dealer or partial-receipt stage"), "pending_po")}
				${wrap(__("Overdue Deliveries"), data.overdue_po_count || 0, __("Past expected delivery date"), "overdue_po")}
				${wrap(__("Pending Supplier Payments"), format_currency(data.pending_payment_amount || 0), `${__("Across")} ${data.pending_payment_count || 0} ${__("bills")}`, "pending_payment")}
				${wrap(__("Overdue Payments"), format_currency(data.overdue_payment_amount || 0), `${data.overdue_payment_count || 0} ${__("bill(s) past due date")}`, "overdue_payment")}
			</div>
		</section>

		<section class="block">
			<div class="section-label"><span>${__("Consumption")}</span><span class="rule"></span><span class="hint">${__("In the selected date range")}</span></div>
			<div class="tile-grid">
				${wrap(__("Material Issued"), data.issues_count || 0, issuesSub, "material_issued")}
			</div>
			<div class="chart-panel" style="margin-top:12px;">
				<h3>${__("Top Suppliers by Spend")}</h3>
				<div class="chart-sub">${__("In the selected date range, from Purchase Bill")}</div>
				<div class="table-scroll">
					<table class="doc-table">
						<thead><tr><th>${__("Supplier")}</th><th>${__("Orders")}</th><th>${__("Spend")}</th><th>${__("Payment Status")}</th></tr></thead>
						<tbody>${supplierRows || `<tr><td colspan="4" class="sub">${__("No bills in this range")}</td></tr>`}</tbody>
					</table>
				</div>
			</div>
		</section>
	`;

	$root.html(html);
	ho_wireStockEvents(page, $root, data);
}

function ho_wireStockEvents(page, $root, data) {
	ho_wireTabs(page, $root);
	$root.find("#hoStockApply").on("click", function () {
		page.ho.from_date = $root.find("#hoStockFrom").val() || page.ho.from_date;
		page.ho.to_date = $root.find("#hoStockTo").val() || page.ho.to_date;
		page.ho.warehouse = $root.find("#hoWarehouse").val();
		page.ho.item_category = $root.find("#hoItemCategory").val();
		ho_loadStock(page);
	});
	$root.find("#hoStockClear").on("click", function () {
		page.ho.from_date = "";
		page.ho.to_date = "";
		page.ho.warehouse = "";
		page.ho.item_category = "";
		ho_loadStock(page);
	});

	ho_wireDrilldowns($root, (key) => ho_stockDrillTarget(key, page, data));

	$root.find(".tile[data-location]")
		.on("click", function () {
			ho_openLocationList(data, $(this).data("location"));
		})
		.on("keydown", function (e) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				ho_openLocationList(data, $(this).data("location"));
			}
		});
}

function ho_openLocationList(data, category) {
	const row = (data.stock_by_location || []).find((r) => r.category === category);
	const warehouses = (row && row.warehouses) || [];
	ho_openList("Stock Balance", { actual_qty: [">", 0], warehouse: ["in", warehouses] });
}

function ho_wireTabs(page, $root) {
	$root.find(".tab-btn").on("click", function () {
		ho_switchTab(page, $(this).data("tab"));
	});
}

function ho_wireEvents(page, $root, data) {
	ho_wireTabs(page, $root);
	$root.find(".tile[data-mode]")
		.on("click", function () {
			ho_openBillingList(page, data, $(this).data("mode"));
		})
		.on("keydown", function (e) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				ho_openBillingList(page, data, $(this).data("mode"));
			}
		});
	$root.find(".tile[data-mix]")
		.on("click", function () {
			ho_openMixList(page, data, $(this).data("mix"));
		})
		.on("keydown", function (e) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				ho_openMixList(page, data, $(this).data("mix"));
			}
		});
	$root.find("#hoApply").on("click", function () {
		page.ho.from_date = $root.find("#hoFrom").val() || page.ho.from_date;
		page.ho.to_date = $root.find("#hoTo").val() || page.ho.to_date;
		page.ho.doctor = $root.find("#hoDoctor").val();
		page.ho.category = $root.find("#hoCategory").val();
		ho_load(page);
	});
	$root.find("#hoClear").on("click", function () {
		page.ho.from_date = "";
		page.ho.to_date = "";
		page.ho.doctor = "";
		page.ho.category = "";
		ho_load(page);
	});

	ho_wireDrilldowns($root, (key) => ho_clinicalDrillTarget(key, page, data));
}

function ho_between(data) {
	const range = data.range || {};
	return ["between", [`${range.from_date} 00:00:00`, `${range.to_date} 23:59:59`]];
}

function ho_clinicalDrillTarget(key, page, data) {
	const between = ho_between(data);
	switch (key) {
		case "registered":
			return { doctype: "Patient Registration", filters: { creation: between, billing_category: page.ho.category || undefined } };
		case "op_visits":
			return { doctype: "Patient Visit", filters: { creation: between, registration_category: "OP" } };
		case "ip_visits":
			return { doctype: "Patient Visit", filters: { creation: between, registration_category: "IP" } };
		case "currently_admitted":
			return { doctype: "Patient Visit", filters: { admission_status: "Admitted" } };
		case "vitals_completed":
			return { doctype: "Nurse Interventions", filters: { date: between, status: "Completed" } };
		case "vitals_pending":
			return { doctype: "Nurse Interventions", filters: { date: between, status: "Pending" } };
		case "seen_by_doctor":
			return { doctype: "Doctor Consultation", filters: { consultation_datetime: between, doctor: page.ho.doctor || undefined } };
		case "referrals":
			return {
				doctype: "Doctor Consultation",
				filters: { consultation_datetime: between, doctor: page.ho.doctor || undefined, referred_to: ["is", "set"] },
			};
		case "discharged":
			return { doctype: "Patient Visit", filters: { admission_status: "Discharged", discharge_date: between } };
		case "discharge_pending":
			return { doctype: "Patient Visit", filters: { name: ["in", data.discharge_summary_pending_visits || []] } };
		case "mlc":
			return { doctype: "Patient Visit", filters: { creation: between, is_mlc_case: 1 } };
		case "total_collected":
			return { doctype: "Billing", filters: { docstatus: 1, sale_datetime: between, billing_category: page.ho.category || undefined } };
		case "advance":
			return { doctype: "Patient Advance", filters: { received_on: between } };
		case "subsidy_general":
			return {
				doctype: "Billing",
				filters: { docstatus: 1, sale_datetime: between, billing_category: "General", charity_amount: [">", 0] },
			};
		case "subsidy_staff":
			return {
				doctype: "Billing",
				filters: { docstatus: 1, sale_datetime: between, billing_category: ["in", ["Staff", "Staff Dependent"]], charity_amount: [">", 0] },
			};
		case "tds":
			return { doctype: "Billing", filters: { docstatus: 1, sale_datetime: between, adjustment_type: "Increase", charity_amount: [">", 0] } };
		default:
			return null;
	}
}

const HO_PENDING_PO_STATUSES = ["Pending Approval", "Approved", "Sent to Dealer", "Partially Received"];

function ho_stockDrillTarget(key, page, data) {
	const between = ho_between(data);
	const today = frappe.datetime.get_today();
	switch (key) {
		case "low_stock":
			return { doctype: "Stock Balance", filters: { name: ["in", data.low_stock_names || []] } };
		case "near_expiry":
			return { doctype: "Batch", filters: { expiry_date: ["between", [today, frappe.datetime.add_days(today, 90)]] } };
		case "expired":
			return { doctype: "Batch", filters: { expiry_date: ["<", today] } };
		case "total_stock_value":
			return { doctype: "Stock Balance", filters: { actual_qty: [">", 0], warehouse: page.ho.warehouse || undefined } };
		case "pending_po":
			return { doctype: "Purchase Order", filters: { status: ["in", HO_PENDING_PO_STATUSES] } };
		case "overdue_po":
			return { doctype: "Purchase Order", filters: { status: ["in", HO_PENDING_PO_STATUSES], expected_delivery: ["<", today] } };
		case "pending_payment":
			return { doctype: "Purchase Bill", filters: { docstatus: 1, payment_status: ["!=", "Paid"] } };
		case "overdue_payment":
			return { doctype: "Purchase Bill", filters: { docstatus: 1, payment_status: ["!=", "Paid"], due_date: ["<", today] } };
		case "material_issued":
			return { doctype: "Material Issue", filters: { docstatus: 1, issue_date_time: between, warehouse: page.ho.warehouse || undefined } };
		default:
			return null;
	}
}

function ho_wireDrilldowns($root, resolver) {
	const go = function () {
		const target = resolver($(this).data("drill"));
		if (target) ho_openList(target.doctype, target.filters);
	};
	$root.find("[data-drill]")
		.on("click", go)
		.on("keydown", function (e) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				go.call(this);
			}
		});
}

function ho_openMixList(page, data, category) {
	const filters = { creation: ho_between(data) };
	filters.billing_category = category === "Unspecified" ? ["is", "not set"] : category;
	ho_openList("Patient Visit", filters);
}

function ho_openBillingList(page, data, mode) {
	const range = data.range || {};
	const filters = {
		docstatus: 1,
		sale_datetime: ["between", [`${range.from_date} 00:00:00`, `${range.to_date} 23:59:59`]],
	};
	filters.payment_mode = mode === "Unspecified" ? ["is", "not set"] : mode;
	if (page.ho.category) filters.billing_category = page.ho.category;
	ho_openList("Billing", filters);
}

function ho_openList(doctype, filters) {
	// Builds a plain List View URL Frappe's own router already knows how to
	// read (parse_filters_from_route_options reads window.location.search),
	// so a drill-down is just a real filtered list in its own tab instead of
	// a custom-built popup - "between"/other operators go in as a
	// JSON-stringified [operator, value] pair, everything else as "=".
	const params = new URLSearchParams();
	Object.entries(filters).forEach(([field, val]) => {
		if (val === undefined || val === null || val === "") return;
		params.set(field, typeof val === "string" || typeof val === "number" ? val : JSON.stringify(val));
	});
	const route = frappe.router.slug(doctype);
	window.open(`/app/${route}?${params.toString()}`, "_blank");
}

function ho_inject_styles() {
	if (document.getElementById("ho-dash-styles")) return;
	const style = document.createElement("style");
	style.id = "ho-dash-styles";
	style.textContent = `
		.ho-dash {
			--ho-accent: #2a78d6;
			--ho-accent-soft: rgba(42,120,214,0.12);
			--ho-good: #0ca30c;
			--ho-warning: #fab219;
			--ho-serious: #ec835a;
			--ho-critical: #d03b3b;
			padding: 12px 4px 40px;
		}
		.ho-dash .hero-bar {
			display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
			padding: 14px 18px; margin-bottom: 16px; border-radius: 12px;
			background: var(--card-bg, var(--fg-color)); border: 1px solid var(--border-color);
		}
		.ho-dash .hero-left { display: flex; align-items: center; gap: 12px; }
		.ho-dash .hero-icon {
			width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
			background: var(--ho-accent-soft); font-size: 19px; flex: none;
		}
		.ho-dash .hero-bar h1 { font-size: 18px; font-weight: 700; margin: 0; color: var(--ho-good); }
		.ho-dash .hero-sub { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }
		.ho-dash .live-dot { font-size: 12px; font-weight: 600; color: var(--ho-good); white-space: nowrap; }

		.ho-dash .tab-bar { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); }
		.ho-dash .tab-btn {
			border: none; background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 600;
			padding: 10px 16px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
		}
		.ho-dash .tab-btn:hover { color: var(--text-color); }
		.ho-dash .tab-btn.active { color: var(--ho-accent); border-bottom-color: var(--ho-accent); }

		.ho-dash .status-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
		.ho-dash .status-chip.warn { color: var(--ho-warning); background: rgba(250,178,25,0.18); }
		.ho-dash .status-chip.crit { color: var(--ho-critical); background: rgba(208,59,59,0.14); }
		.ho-dash .status-chip.ok { color: var(--ho-good); background: rgba(12,163,12,0.12); }

		.ho-dash .filter-panel {
			display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap;
			padding: 14px 18px; margin-bottom: 24px; border-radius: 12px;
			background: var(--card-bg, var(--fg-color)); border: 1px solid var(--border-color);
		}
		.ho-dash .filter-field { display: flex; flex-direction: column; gap: 5px; }
		.ho-dash .filter-field label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
		.ho-dash .date-input, .ho-dash .filter-select {
			font-size: 13px; font-weight: 600; color: var(--text-color);
			background: var(--control-bg, var(--bg-color)); border: 1px solid var(--border-color);
			border-radius: 8px; padding: 7px 10px; cursor: pointer; min-width: 150px;
		}
		.ho-dash .filter-actions { display: flex; gap: 8px; }
		.ho-dash .btn-clear, .ho-dash .btn-apply {
			font-size: 13px; font-weight: 600; border-radius: 8px; padding: 8px 16px; cursor: pointer; border: 1px solid var(--border-color);
		}
		.ho-dash .btn-clear { background: var(--control-bg, var(--bg-color)); color: var(--text-color); }
		.ho-dash .btn-apply { background: var(--ho-good); color: #fff; border-color: var(--ho-good); }

		.ho-dash section.block { margin-bottom: 30px; }
		.ho-dash .section-label { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
		.ho-dash .section-label span:first-child { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); white-space: nowrap; }
		.ho-dash .section-label .rule { flex: 1; height: 1px; background: var(--border-color); min-width: 24px; }
		.ho-dash .section-label .hint { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
		.ho-dash .tile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; }
		.ho-dash .tile {
			background: var(--card-bg, var(--fg-color)); border: 1px solid var(--border-color); border-top: 3px solid var(--ho-accent);
			border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px;
			height: 92px; overflow: hidden;
		}
		.ho-dash .tile.clickable { cursor: pointer; }
		.ho-dash .tile.clickable:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
		.ho-dash .tile .label { font-size: 11px; font-weight: 500; color: var(--text-muted); }
		.ho-dash .tile .value-row { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; }
		.ho-dash .tile .value {
			font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
			font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
			color: var(--heading-color, var(--text-color));
		}
		.ho-dash .delta { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
		.ho-dash .delta.good { color: var(--ho-good); background: rgba(12,163,12,0.12); }
		.ho-dash .delta.warn { color: var(--ho-warning); background: rgba(250,178,25,0.16); }
		.ho-dash .tile .sub { font-size: 11.5px; color: var(--text-muted); }
		.ho-dash .view-all { font-size: 10px; font-weight: 700; color: var(--ho-accent); margin-top: 1px; }
		.ho-dash .status-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; width: fit-content; }
		.ho-dash .status-pill .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
		.ho-dash .stack-bar { display: flex; height: 10px; border-radius: 6px; overflow: hidden; background: var(--control-bg, var(--bg-color)); margin-top: 2px; }
		.ho-dash .stack-bar span { height: 100%; }
		.ho-dash .chart-panel { background: var(--card-bg, var(--fg-color)); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px 18px; }
		.ho-dash .chart-panel h3 { font-size: 13px; font-weight: 700; margin: 0 0 4px; }
		.ho-dash .chart-panel .chart-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; }
		.ho-dash .table-scroll { overflow-x: auto; }
		.ho-dash table.doc-table, .ho-dash table.plain-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 380px; }
		.ho-dash table.doc-table th, .ho-dash table.plain-table th {
			text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
			color: var(--text-muted); padding: 8px 10px; border-bottom: 1px solid var(--border-color);
		}
		.ho-dash table.doc-table td, .ho-dash table.plain-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-color); color: var(--text-color); }
		.ho-dash table.doc-table th:not(:first-child), .ho-dash table.doc-table td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
		.ho-dash table.doc-table tr:last-child td, .ho-dash table.plain-table tr:last-child td { border-bottom: none; }
		.ho-dash .pct-cell { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
		.ho-dash .mini-track { width: 72px; height: 6px; border-radius: 3px; background: var(--control-bg, var(--bg-color)); overflow: hidden; }
		.ho-dash .mini-track > div { height: 100%; background: var(--ho-accent); border-radius: 3px 0 0 3px; }
		.ho-dash .modal-overlay { position: fixed; inset: 0; background: rgba(10,10,10,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 500; }
		.ho-dash .modal-overlay[hidden] { display: none; }
		.ho-dash .modal-panel { background: var(--card-bg, var(--fg-color)); border: 1px solid var(--border-color); border-radius: 14px; max-width: 660px; width: 100%; max-height: 84vh; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,0.3); }
		.ho-dash .modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 20px 4px; }
		.ho-dash .modal-head h3 { margin: 0; font-size: 15px; font-weight: 700; }
		.ho-dash .modal-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
		.ho-dash .modal-close { border: none; background: var(--control-bg, var(--bg-color)); color: var(--text-muted); width: 26px; height: 26px; border-radius: 50%; cursor: pointer; }
		.ho-dash .modal-filters { padding: 10px 20px; display: flex; gap: 10px; border-bottom: 1px solid var(--border-color); }
		.ho-dash .date-range { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
		.ho-dash .modal-body { overflow-y: auto; padding: 0 20px 10px; }
	`;
	document.head.appendChild(style);
}
