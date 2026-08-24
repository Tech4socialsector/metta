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
		const advances = data.advances || { rows: [], total: 0 };
		const item_type_collection = data.item_type_collection || { rows: [], total: 0 };

		this.render_cards(total_row, advances);
		this.render_table(detail_rows, total_row);
		this.render_advances(advances);
		this.render_item_type_collection(item_type_collection);
	}

	render_cards(total_row, advances) {
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
			<div class="dcr-card">
				<div class="dcr-card-label">${__("Advances Collected")}</div>
				<div class="dcr-card-value">${format_currency(advances.total)}</div>
			</div>
			<div class="dcr-card highlight">
				<div class="dcr-card-label">${__("Total Collected")}</div>
				<div class="dcr-card-value">${format_currency(total_collected)}</div>
			</div>
		`);
	}

	render_advances(advances) {
		if (!this.advances_area) {
			this.advances_area = $(`<div></div>`).appendTo(this.page.body);
		}
		const rows = advances.rows || [];
		if (!rows.length) {
			this.advances_area.html(`
				<div class="dcr-subheading">${__("Advances")}</div>
				<p class="text-muted">${__("No advances collected for this period.")}</p>
			`);
			return;
		}

		const header = ["Patient Visit", "Patient Name", "Amount", "Payment Mode", "Received By", "Received On", "Remarks"]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const row_html = (row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.patient_visit || "")}</td>
				<td>${frappe.utils.escape_html(row.patient_label || "")}</td>
				<td class="text-center">${format_currency(row.amount)}</td>
				<td>${frappe.utils.escape_html(row.payment_mode || "")}</td>
				<td>${frappe.utils.escape_html(row.received_by_name || "")}</td>
				<td>${frappe.datetime.str_to_user(row.received_on)}</td>
				<td>${frappe.utils.escape_html(row.remarks || "")}</td>
			</tr>`;

		const body = rows.map(row_html).join("");
		const total_html = `
			<tr class="dcr-total">
				<td colspan="2">${__("Total")}</td>
				<td class="text-center">${format_currency(advances.total)}</td>
				<td colspan="4"></td>
			</tr>`;

		this.advances_area.html(`
			<div class="dcr-subheading">${__("Advances")}</div>
			<div class="table-wrapper" style="overflow-x: auto;">
				<table class="table table-hover dcr-table">
					<thead><tr>${header}</tr></thead>
					<tbody>${body}${total_html}</tbody>
				</table>
			</div>
		`);
	}

	render_item_type_collection(item_type_collection) {
		if (!this.item_type_area) {
			this.item_type_area = $(`<div></div>`).appendTo(this.page.body);
		}
		const rows = item_type_collection.rows || [];
		if (!rows.length) {
			this.item_type_area.html(`
				<div class="dcr-subheading">${__("Item Type Collection")}</div>
				<p class="text-muted">${__("No billed items found for this period.")}</p>
			`);
			return;
		}

		const total = item_type_collection.total;
		const header = ["Item Type", "Amount", "Bills", "% of Total"].map((h) => `<th>${__(h)}</th>`).join("");

		const row_html = (row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_type || __("Not Set"))}</td>
				<td class="text-center">${format_currency(row.amount)}</td>
				<td class="text-center">${row.bill_count}</td>
				<td class="text-center">${total ? ((flt(row.amount) / total) * 100).toFixed(1) : "0.0"}%</td>
			</tr>`;

		const body = rows.map(row_html).join("");
		const total_html = `
			<tr class="dcr-total">
				<td>${__("Total")}</td>
				<td class="text-center">${format_currency(total)}</td>
				<td colspan="2"></td>
			</tr>`;

		this.item_type_area.html(`
			<div class="dcr-subheading">${__("Item Type Collection")}</div>
			<div class="table-wrapper" style="overflow-x: auto;">
				<table class="table table-hover dcr-table">
					<thead><tr>${header}</tr></thead>
					<tbody>${body}${total_html}</tbody>
				</table>
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
		if (!this.all_data) return null;
		const sections = [
			this.user_wise_details_section(),
			this.advances_section(),
			this.item_type_collection_section(),
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

		// Collection Report's own "Total" row is already the last entry here -
		// same row this page renders as the highlighted total, so it's
		// exported as-is rather than recomputed a second time.
		const data = rows.map((row) => [row.user_name || "", ...money_fields.map((f) => format_currency(row[f]))]);

		return { heading: __("User Wise Details"), columns, rows: data };
	}

	advances_section() {
		const advances = this.all_data.advances || { rows: [], total: 0 };
		const rows = advances.rows || [];
		if (!rows.length) return null;

		const columns = ["Patient Visit", "Patient Name", "Amount", "Payment Mode", "Received By", "Received On", "Remarks"].map(
			(c) => __(c)
		);

		const data = rows.map((row) => [
			row.patient_visit || "",
			row.patient_label || "",
			format_currency(row.amount),
			row.payment_mode || "",
			row.received_by_name || "",
			frappe.datetime.str_to_user(row.received_on),
			row.remarks || "",
		]);
		data.push([__("Total"), "", format_currency(advances.total), "", "", "", ""]);

		return { heading: __("Advances"), columns, rows: data };
	}

	item_type_collection_section() {
		const item_type_collection = this.all_data.item_type_collection || { rows: [], total: 0 };
		const rows = item_type_collection.rows || [];
		if (!rows.length) return null;

		const total = item_type_collection.total;
		const columns = ["Item Type", "Amount", "Bills", "% of Total"].map((c) => __(c));

		const data = rows.map((row) => [
			row.item_type || __("Not Set"),
			format_currency(row.amount),
			row.bill_count,
			`${total ? ((flt(row.amount) / total) * 100).toFixed(1) : "0.0"}%`,
		]);
		data.push([__("Total"), format_currency(total), "", ""]);

		return { heading: __("Item Type Collection"), columns, rows: data };
	}
}