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
			.dcr-page .dcr-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.dcr-page .dcr-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.dcr-page .dcr-card.highlight {
				border-color: #bfe3c8;
				background: #eaf9ef;
			}
			.dcr-page .dcr-card .dcr-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.dcr-page .dcr-card.highlight .dcr-card-label { color: #1e7e34; }
			.dcr-page .dcr-card .dcr-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.dcr-page .dcr-card.highlight .dcr-card-value { color: #1e7e34; }
			.dcr-page .dcr-subheading {
				font-weight: 700;
				font-size: 13px;
				margin: 18px 0 8px 0;
			}
			.dcr-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.dcr-page table.dcr-table {
				margin-bottom: 0;
			}
			.dcr-page table.dcr-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
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
					fn();
					this.generate();
				});

		btn(__("Today"), () => this.set_range(frappe.datetime.get_today(), frappe.datetime.get_today()));
		btn(__("This Week"), () => this.set_range(frappe.datetime.week_start(), frappe.datetime.week_end()));
		btn(__("This Month"), () => this.set_range(frappe.datetime.month_start(), frappe.datetime.month_end()));
	}

	set_range(from_date, to_date) {
		this.from_date_field.set_value(from_date);
		this.to_date_field.set_value(to_date);
	}

	make_results_area() {
		this.cards_area = $(`<div class="dcr-cards"></div>`).appendTo(this.page.body);
		this.table_area = $(`<div></div>`).appendTo(this.page.body);
		this.table_area.html(`<p class="text-muted">${__("Set a From Date and To Date, then click Generate.")}</p>`);
	}

	generate() {
		const from_date = this.from_date_field.get_value();
		const to_date = this.to_date_field.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set both From Date and To Date."));
			return;
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
		const rows = data.user_wise_details || [];
		// The last row is Collection Report's own "Total" row - a real data
		// row same as the others, just rendered with the highlighted style
		// instead of being recomputed separately here.
		const total_row = rows.length ? rows[rows.length - 1] : null;
		const detail_rows = total_row ? rows.slice(0, -1) : [];

		this.render_cards(total_row);
		this.render_table(detail_rows, total_row);
	}

	render_cards(total_row) {
		if (!total_row) {
			this.cards_area.html("");
			return;
		}
		const total_collected =
			flt(total_row.cash_amt) + flt(total_row.epay) + flt(total_row.credit_bills) + flt(total_row.adv_ip);

		this.cards_area.html(`
			<div class="dcr-card">
				<div class="dcr-card-label">${__("Gross Amount")}</div>
				<div class="dcr-card-value">${format_currency(total_row.gross_amt)}</div>
			</div>
			<div class="dcr-card">
				<div class="dcr-card-label">${__("Sales Returns")}</div>
				<div class="dcr-card-value">${format_currency(total_row.sales_ret)}</div>
			</div>
			<div class="dcr-card highlight">
				<div class="dcr-card-label">${__("Total Collected")}</div>
				<div class="dcr-card-value">${format_currency(total_collected)}</div>
			</div>
		`);
	}

	render_table(detail_rows, total_row) {
		if (!detail_rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No collections found for this period.")}</p>`);
			return;
		}

		const header = [
			"User Name",
			"Gross Amt",
			"Epay",
			"Credit Bills",
			"Sales Ret",
			"Patient Debit",
			"Debit Collected",
			"Adv/IP",
			"Cash Amt",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const money_fields = [
			"gross_amt",
			"epay",
			"credit_bills",
			"sales_ret",
			"patient_debit",
			"debit_collected",
			"adv_ip",
			"cash_amt",
		];

		const row_html = (row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.user_name || "")}</td>
				${money_fields.map((f) => `<td class="text-center">${format_currency(row[f])}</td>`).join("")}
			</tr>`;

		const body = detail_rows.map(row_html).join("");
		const total_html = total_row
			? `<tr class="dcr-total">${row_html(total_row).replace("<tr>", "").replace("</tr>", "")}</tr>`
			: "";

		this.table_area.html(`
			<div class="dcr-subheading">${__("User Wise Details")}</div>
			<div class="table-wrapper" style="overflow-x: auto;">
				<table class="table table-hover dcr-table">
					<thead><tr>${header}</tr></thead>
					<tbody>${body}${total_html}</tbody>
				</table>
			</div>
		`);
	}

	get_export_data() {
		if (!this.all_data || !this.all_data.user_wise_details) return null;
		const rows = this.all_data.user_wise_details;
		if (!rows.length) return null;

		const columns = [
			"User Name",
			"Gross Amt",
			"Epay",
			"Credit Bills",
			"Sales Ret",
			"Patient Debit",
			"Debit Collected",
			"Adv/IP",
			"Cash Amt",
		].map((c) => __(c));

		const money_fields = [
			"gross_amt",
			"epay",
			"credit_bills",
			"sales_ret",
			"patient_debit",
			"debit_collected",
			"adv_ip",
			"cash_amt",
		];

		const data = rows.map((row) => [
			row.user_name || "",
			...money_fields.map((f) => format_currency(row[f])),
		]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];

		return {
			title: __("Daily Collection Report - User Wise Details"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Daily_Collection_Report_User_Wise_Details",
		};
	}
}
