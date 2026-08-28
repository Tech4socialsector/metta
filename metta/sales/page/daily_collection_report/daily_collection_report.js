frappe.pages["daily-collection-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Daily Collection Report"),
		single_column: true,
	});

	new DailyCollectionReport(page);
};

function format_ddmmyy(date_str) {
	if (!date_str) return "";
	const d = new Date(date_str);
	if (isNaN(d)) return "";
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yy = String(d.getFullYear()).slice(-2);
	return `${dd}/${mm}/${yy}`;
}

class DailyCollectionReport {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("dcr-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// Nothing to export until a report has actually been generated at
		// least once - disabled rather than left clickable-but-empty, so
		// there's no way to hit "Nothing to export" by clicking Export before
		// Generate in the first place.
		this.set_export_enabled(false);
	}

	set_export_enabled(enabled) {
		this.page.get_inner_group_button(__("Export")).find("button").prop("disabled", !enabled);
	}

	inject_styles() {
		if (document.getElementById("dcr-styles")) return;
		$(`<style id="dcr-styles">
			.dcr-page .dcr-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.dcr-page .dcr-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.dcr-page .dcr-grid {
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				gap: 16px;
				align-items: start;
				margin-top: 16px;
			}
			@media (max-width: 900px) {
				.dcr-page .dcr-grid {
					grid-template-columns: 1fr;
				}
			}
			.dcr-page .dcr-box {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
				background: var(--card-bg, #fff);
			}
			.dcr-page .dcr-box.dcr-wide,
			.dcr-page .dcr-box.dcr-fill {
				grid-column: 1 / -1;
			}
			.dcr-page .dcr-box-title {
				background: #1b4f8c;
				color: #fff;
				font-weight: 700;
				font-size: 12px;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				padding: 8px 14px;
			}
			.dcr-page .dcr-box .table-wrapper {
				overflow-x: auto;
			}
			.dcr-page table.dcr-table {
				width: 100%;
				margin-bottom: 0;
			}
			.dcr-page table.dcr-table thead th {
				background: #eaf1fb;
				color: #0b4a86;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 8px 14px;
				white-space: nowrap;
			}
			.dcr-page table.dcr-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
				white-space: nowrap;
			}
			.dcr-page table.dcr-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.dcr-page table.dcr-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.dcr-page table.dcr-table tr.dcr-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="dcr-section-title">SALES</div>
			<div class="dcr-section-subtitle">Daily Collection Report</div>
		`).appendTo(this.page.body);
	}

	make_filters() {
		const filter_row = $(
			`<div class="flex" style="gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 15px;"></div>`
		).appendTo(this.page.body);

		const field = (opts) => {
			const wrap = $(`<div style="min-width: 180px;"></div>`).appendTo(filter_row);
			return frappe.ui.form.make_control({
				parent: wrap,
				df: { ...opts, fieldtype: opts.fieldtype || "Data" },
				render_input: true,
			});
		};

		this.from_date_field = field({
			fieldname: "from_date",
			label: __("From Date (dd/mm/yyyy)"),
			fieldtype: "Date",
			reqd: 1,
		});
		this.to_date_field = field({
			fieldname: "to_date",
			label: __("To Date (dd/mm/yyyy)"),
			fieldtype: "Date",
			reqd: 1,
		});

		const button_wrap = $(`<div></div>`).appendTo(filter_row);
		$(`<button class="btn btn-primary btn-sm">${__("Generate")}</button>`)
			.appendTo(button_wrap)
			.on("click", () => this.generate());
	}

	make_quick_range_buttons() {
		const wrap = $(`<div style="margin-bottom: 15px;"></div>`).appendTo(this.page.body);
		const btn = (label, fn) =>
			$(`<button class="btn btn-default btn-xs" style="margin-right: 6px;">${label}</button>`)
				.appendTo(wrap)
				.on("click", () => {
					// set_value() is async (it goes through Frappe's own
					// validate-and-set-in-model flow) - calling generate()
					// straight after fn() would read the fields before that
					// actually finishes, so Generate here always waits for
					// both dates to really be in place first.
					fn().then(() => this.generate());
				});

		btn(__("Today"), () => this.set_range(frappe.datetime.get_today(), frappe.datetime.get_today()));
		btn(__("This Week"), () => this.set_range(frappe.datetime.week_start(), frappe.datetime.week_end()));
		btn(__("This Month"), () => this.set_range(frappe.datetime.month_start(), frappe.datetime.month_end()));
	}

	set_range(from_date, to_date) {
		return Promise.all([this.from_date_field.set_value(from_date), this.to_date_field.set_value(to_date)]);
	}

	make_results_area() {
		this.hint_area = $(`<div></div>`).appendTo(this.page.body);
		this.hint_area.html(`<p class="text-muted">${__("Set a From Date and To Date, then click Generate.")}</p>`);
		this.grid_area = $(`<div class="dcr-grid"></div>`).appendTo(this.page.body);
	}

	generate() {
		// Defaults to today rather than blocking with a message - the
		// fields start blank until the user picks a date or a quick-range
		// button, so silently falling back is less friction than a popup
		// for something this minor.
		let from_date = this.from_date_field.get_value();
		let to_date = this.to_date_field.get_value();
		if (!from_date) {
			from_date = frappe.datetime.get_today();
			this.from_date_field.set_value(from_date);
		}
		if (!to_date) {
			to_date = frappe.datetime.get_today();
			this.to_date_field.set_value(to_date);
		}

		frappe.call({
			method: "metta.sales.page.daily_collection_report.daily_collection_report.get_data",
			args: { from_date, to_date },
			freeze: true,
			callback: (r) => this.render(r.message || {}),
		});
	}

	render(data) {
		this.all_data = data;
		this.set_export_enabled(true);
		this.hint_area.empty();
		const rows = data.user_wise_details || [];
		// The last row is Collection Report's own "Total" row - a real data
		// row same as the others, just rendered with the highlighted style
		// instead of being recomputed separately here.
		const total_row = rows.length ? rows[rows.length - 1] : null;
		const detail_rows = total_row ? rows.slice(0, -1) : [];
		const advances = data.advances || { rows: [], total: { op_amount: 0, ip_amount: 0 } };
		const item_type_collection = data.item_type_collection || { rows: [], total: { op_amount: 0, ip_amount: 0 } };

		this.render_table(detail_rows, total_row);
		this.render_user_wise_charity(data.user_wise_charity || { categories: [], rows: [] });
		this.render_op_ip_section("advances_area", __("Advances"), advances, __("Particulars"));
		this.render_op_ip_section("item_type_area", __("Item Type Collection"), item_type_collection, __("Particulars"));

		this.render_op_ip_section("sales_return_cash_area", __("Sales Return - Cash"), data.sales_return_cash, __("Particulars"));
		this.render_op_ip_section("sales_return_credit_area", __("Sales Return - Credit"), data.sales_return_credit, __("Particulars"));
		this.render_op_ip_section("charity_summary_area", __("Charity - Summary"), data.charity && data.charity.summary, __("Particulars"));
		this.render_charity_details(data.charity && data.charity.details);
		this.render_op_ip_section("ip_adjusted_area", __("IP Adjusted"), data.ip_adjusted, __("Particulars"));
		this.render_op_ip_section("credit_bills_area", __("Credit Bills"), data.credit_bills, __("Particulars"), true);
		this.render_op_ip_section("local_group_wise_area", __("Local Group Wise Details"), data.local_group_wise, __("Particulars"), true);
		this.render_tax_section("tax_bills_area", __("Tax - Details - Bills"), data.tax_bills, true);
		this.render_tax_section("tax_returns_area", __("Tax - Details - Returns"), data.tax_returns, true);
		this.balance_grid();
	}

	balance_grid() {
		// A run of paired ("dcr-cell") boxes between two wide ones can end up
		// with an odd one out, left alone in its row with empty space beside
		// it (e.g. IP Adjusted after a variable number of Charity - Details
		// boxes). Stretched to fill the row instead - recomputed fresh every
		// render since the count of dynamic boxes (Charity categories) can
		// change between periods.
		const children = this.grid_area.children().toArray();
		children.forEach((el) => el.classList.remove("dcr-fill"));

		let group = [];
		const flush = () => {
			if (group.length % 2 === 1) group[group.length - 1].classList.add("dcr-fill");
			group = [];
		};
		children.forEach((el) => {
			if (el.classList.contains("dcr-cell")) {
				group.push(el);
			} else {
				flush();
			}
		});
		flush();
	}

	get_area(key, wide) {
		if (!this[key]) {
			this[key] = $(`<div class="dcr-box${wide ? " dcr-wide" : " dcr-cell"}"></div>`).appendTo(this.grid_area);
		}
		return this[key];
	}

	render_op_ip_section(area_key, heading, data, label_header, wide) {
		const $target = this.get_area(area_key, wide);
		const rows = (data && data.rows) || [];
		if (!rows.length) {
			$target.html(`
				<div class="dcr-box-title">${heading}</div>
				<p class="text-muted" style="padding: 10px 14px;">${__("No data for this period.")}</p>
			`);
			return;
		}
		const total = data.total || { op_amount: 0, ip_amount: 0 };
		const row_html = (r, sl) => `
			<tr>
				<td class="text-center">${sl}</td>
				<td>${frappe.utils.escape_html(r.label || "")}</td>
				<td class="text-center">${format_currency(r.op_amount)}</td>
				<td class="text-center">${format_currency(r.ip_amount)}</td>
			</tr>`;
		const total_html = `
			<tr class="dcr-total">
				<td></td>
				<td>${__("Total")}</td>
				<td class="text-center">${format_currency(total.op_amount)}</td>
				<td class="text-center">${format_currency(total.ip_amount)}</td>
			</tr>`;
		$target.html(`
			<div class="dcr-box-title">${heading}</div>
			<div class="table-wrapper">
				<table class="table table-hover dcr-table">
					<thead><tr><th>${__("Sl No")}</th><th>${label_header}</th><th>${__("OP Amount")}</th><th>${__("IP Amount")}</th></tr></thead>
					<tbody>${rows.map((r, i) => row_html(r, i + 1)).join("")}${total_html}</tbody>
				</table>
			</div>
		`);
	}

	render_charity_details(details) {
		// Each charity category gets its own standalone grid box (not one
		// wrapper holding several tables) so they lay out side-by-side in the
		// grid the same as every other box, instead of stacking as one
		// oversized column.
		if (this.charity_details_boxes) {
			this.charity_details_boxes.forEach(($box) => $box.remove());
		}
		this.charity_details_boxes = [];
		if (!details || !details.length) return;

		const row_html = (r, sl) => `
			<tr>
				<td class="text-center">${sl}</td>
				<td>${frappe.utils.escape_html(r.label || "")}</td>
				<td class="text-center">${format_currency(r.op_amount)}</td>
				<td class="text-center">${format_currency(r.ip_amount)}</td>
			</tr>`;

		details.forEach((d) => {
			const total_html = `
				<tr class="dcr-total">
					<td></td>
					<td>${__("Total")}</td>
					<td class="text-center">${format_currency(d.total.op_amount)}</td>
					<td class="text-center">${format_currency(d.total.ip_amount)}</td>
				</tr>`;
			const $box = $(`
				<div class="dcr-box dcr-cell">
					<div class="dcr-box-title">${__("Charity - Details")} - ${frappe.utils.escape_html(d.category)}</div>
					<div class="table-wrapper">
						<table class="table table-hover dcr-table">
							<thead><tr><th>${__("Sl No")}</th><th>${__("Particulars")}</th><th>${__("OP Amount")}</th><th>${__("IP Amount")}</th></tr></thead>
							<tbody>${d.rows.map((r, i) => row_html(r, i + 1)).join("")}${total_html}</tbody>
						</table>
					</div>
				</div>
			`).appendTo(this.grid_area);
			this.charity_details_boxes.push($box);
		});
	}

	render_tax_section(area_key, heading, data, with_op_ip) {
		const $target = this.get_area(area_key, true);
		const rows = (data && data.rows) || [];
		if (!rows.length) {
			$target.html(`
				<div class="dcr-box-title">${heading}</div>
				<p class="text-muted" style="padding: 10px 14px;">${__("No data for this period.")}</p>
			`);
			return;
		}
		const total = data.total || {};
		const extra_header = with_op_ip ? `<th>${__("OP Amount")}</th><th>${__("IP Amount")}</th>` : "";
		const extra_cells = (r) =>
			with_op_ip
				? `<td class="text-center">${format_currency(r.op_amount)}</td><td class="text-center">${format_currency(r.ip_amount)}</td>`
				: "";
		const row_html = (r, sl) => `
			<tr>
				<td class="text-center">${sl}</td>
				<td>${frappe.utils.escape_html(r.label || "")}</td>
				${extra_cells(r)}
				<td class="text-center">${format_currency(r.amount)}</td>
				<td class="text-center">${format_currency(r.tax_amount)}</td>
			</tr>`;
		const total_html = `
			<tr class="dcr-total">
				<td></td>
				<td>${__("Total")}</td>
				${with_op_ip ? `<td class="text-center">${format_currency(total.op_amount)}</td><td class="text-center">${format_currency(total.ip_amount)}</td>` : ""}
				<td class="text-center">${format_currency(total.amount)}</td>
				<td class="text-center">${format_currency(total.tax_amount)}</td>
			</tr>`;
		$target.html(`
			<div class="dcr-box-title">${heading}</div>
			<div class="table-wrapper">
				<table class="table table-hover dcr-table">
					<thead><tr><th>${__("Sl No")}</th><th>${__("Particulars")}</th>${extra_header}<th>${__("Amount")}</th><th>${__("Tax Amount")}</th></tr></thead>
					<tbody>${rows.map((r, i) => row_html(r, i + 1)).join("")}${total_html}</tbody>
				</table>
			</div>
		`);
	}

	render_table(detail_rows, total_row) {
		const $target = this.get_area("table_area", true);
		if (!detail_rows.length) {
			$target.html(`
				<div class="dcr-box-title">${__("User Wise Details")}</div>
				<p class="text-muted" style="padding: 10px 14px;">${__("No collections found for this period.")}</p>
			`);
			return;
		}

		const header = [
			"Sl No",
			"User Name",
			"Gross Amt",
			"Charity",
			"Card",
			"Gpay",
			"Credit Bills",
			"Sales Ret",
			"Adv/IP",
			"Cash Amt",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const money_fields = [
			"gross_amt",
			"charity",
			"card",
			"gpay",
			"credit_bills",
			"sales_ret",
			"adv_ip",
			"cash_amt",
		];

		const row_html = (row, sl) => `
			<tr>
				<td class="text-center">${sl != null ? sl : ""}</td>
				<td>${frappe.utils.escape_html(row.user_name || "")}</td>
				${money_fields.map((f) => `<td class="text-center">${format_currency(row[f])}</td>`).join("")}
			</tr>`;

		const body = detail_rows.map((row, i) => row_html(row, i + 1)).join("");
		const total_html = total_row
			? `<tr class="dcr-total">${row_html(total_row, null).replace("<tr>", "").replace("</tr>", "")}</tr>`
			: "";

		$target.html(`
			<div class="dcr-box-title">${__("User Wise Details")}</div>
			<div class="table-wrapper">
				<table class="table table-hover dcr-table">
					<thead><tr>${header}</tr></thead>
					<tbody>${body}${total_html}</tbody>
				</table>
			</div>
		`);
	}

	render_user_wise_charity(data) {
		const $target = this.get_area("user_wise_charity_area", true);
		const rows = data.rows || [];
		const categories = data.categories || [];
		if (!rows.length || !categories.length) {
			$target.html(`
				<div class="dcr-box-title">${__("User Wise Charity Details")}</div>
				<p class="text-muted" style="padding: 10px 14px;">${__("No data for this period.")}</p>
			`);
			return;
		}

		const header = ["Sl No", "User Name", ...categories].map((h) => `<th>${frappe.utils.escape_html(h)}</th>`).join("");
		const row_html = (row, sl) => `
			<tr>
				<td class="text-center">${sl != null ? sl : ""}</td>
				<td>${frappe.utils.escape_html(row.user_name || "")}</td>
				${categories.map((c) => `<td class="text-center">${format_currency(row[c] || 0)}</td>`).join("")}
			</tr>`;

		// Last row is the "Total" row the server already computed - same
		// highlighted-total pattern as User Wise Details above.
		const detail_rows = rows.slice(0, -1);
		const total_row = rows[rows.length - 1];
		const body = detail_rows.map((row, i) => row_html(row, i + 1)).join("");
		const total_html = `<tr class="dcr-total">${row_html(total_row, null).replace("<tr>", "").replace("</tr>", "")}</tr>`;

		$target.html(`
			<div class="dcr-box-title">${__("User Wise Charity Details")}</div>
			<div class="table-wrapper">
				<table class="table table-hover dcr-table">
					<thead><tr>${header}</tr></thead>
					<tbody>${body}${total_html}</tbody>
				</table>
			</div>
		`);
	}

	get_export_data() {
		if (!this.all_data) return null;
		const data = this.all_data;
		const sections = [
			this.user_wise_details_section(),
			this.user_wise_charity_section(),
			this.op_ip_export_section(__("Advances"), data.advances, __("Particulars")),
			this.op_ip_export_section(__("Item Type Collection"), data.item_type_collection, __("Particulars")),
			this.op_ip_export_section(__("Local Group Wise Details"), data.local_group_wise, __("Particulars")),
			this.op_ip_export_section(__("Sales Return - Cash"), data.sales_return_cash, __("Particulars")),
			this.op_ip_export_section(__("Sales Return - Credit"), data.sales_return_credit, __("Particulars")),
			this.op_ip_export_section(__("Charity - Summary"), data.charity && data.charity.summary, __("Particulars")),
			...this.charity_details_export_sections(data.charity && data.charity.details),
			this.op_ip_export_section(__("IP Adjusted"), data.ip_adjusted, __("Particulars")),
			this.op_ip_export_section(__("Credit Bills"), data.credit_bills, __("Particulars")),
			this.tax_export_section(__("Tax - Details - Bills"), data.tax_bills, true),
			this.tax_export_section(__("Tax - Details - Returns"), data.tax_returns, true),
		].filter(Boolean);
		if (!sections.length) return null;

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];

		return {
			title: __("Daily Collection Report"),
			subtitle: filter_bits.join("   |   "),
			sections,
			filename: "Daily_Collection_Report",
		};
	}

	user_wise_details_section() {
		const rows = this.all_data.user_wise_details || [];
		if (!rows.length) return null;

		const columns = [
			"Sl No",
			"User Name",
			"Gross Amt",
			"Charity",
			"Card",
			"Gpay",
			"Credit Bills",
			"Sales Ret",
			"Adv/IP",
			"Cash Amt",
		].map((c) => __(c));

		const money_fields = [
			"gross_amt",
			"charity",
			"card",
			"gpay",
			"credit_bills",
			"sales_ret",
			"adv_ip",
			"cash_amt",
		];

		// Collection Report's own "Total" row is already the last entry here -
		// same row this page renders as the highlighted total, so it's
		// exported as-is rather than recomputed a second time.
		const data = rows.map((row, i) => {
			const is_total = i === rows.length - 1;
			return [is_total ? "" : i + 1, row.user_name || "", ...money_fields.map((f) => format_currency(row[f]))];
		});

		return { heading: __("User Wise Details"), columns, rows: data };
	}

	user_wise_charity_section() {
		const data = this.all_data.user_wise_charity || { categories: [], rows: [] };
		const rows = data.rows || [];
		const categories = data.categories || [];
		if (!rows.length || !categories.length) return null;

		const columns = ["Sl No", "User Name", ...categories].map((c) => __(c));
		const out_rows = rows.map((row, i) => {
			const is_total = i === rows.length - 1;
			return [is_total ? "" : i + 1, row.user_name || "", ...categories.map((c) => format_currency(row[c] || 0))];
		});

		return { heading: __("User Wise Charity Details"), columns, rows: out_rows };
	}

	op_ip_export_section(heading, data, label_header) {
		const rows = (data && data.rows) || [];
		if (!rows.length) return null;
		const total = data.total || { op_amount: 0, ip_amount: 0 };
		const columns = [__("Sl No"), label_header, __("OP Amount"), __("IP Amount")];
		const out_rows = rows.map((r, i) => [i + 1, r.label || "", format_currency(r.op_amount), format_currency(r.ip_amount)]);
		out_rows.push(["", __("Total"), format_currency(total.op_amount), format_currency(total.ip_amount)]);
		return { heading, columns, rows: out_rows };
	}

	charity_details_export_sections(details) {
		if (!details || !details.length) return [];
		return details.map((d) => {
			const columns = [__("Sl No"), __("Particulars"), __("OP Amount"), __("IP Amount")];
			const rows = d.rows.map((r, i) => [i + 1, r.label || "", format_currency(r.op_amount), format_currency(r.ip_amount)]);
			rows.push(["", __("Total"), format_currency(d.total.op_amount), format_currency(d.total.ip_amount)]);
			return { heading: `${__("Charity - Details")} - ${d.category}`, columns, rows };
		});
	}

	tax_export_section(heading, data, with_op_ip) {
		const rows = (data && data.rows) || [];
		if (!rows.length) return null;
		const total = data.total || {};
		const columns = [__("Sl No"), __("Particulars")];
		if (with_op_ip) columns.push(__("OP Amount"), __("IP Amount"));
		columns.push(__("Amount"), __("Tax Amount"));

		const out_rows = rows.map((r, i) => {
			const row = [i + 1, r.label || ""];
			if (with_op_ip) row.push(format_currency(r.op_amount), format_currency(r.ip_amount));
			row.push(format_currency(r.amount), format_currency(r.tax_amount));
			return row;
		});
		const total_row = ["", __("Total")];
		if (with_op_ip) total_row.push(format_currency(total.op_amount), format_currency(total.ip_amount));
		total_row.push(format_currency(total.amount), format_currency(total.tax_amount));
		out_rows.push(total_row);

		return { heading, columns, rows: out_rows };
	}
}