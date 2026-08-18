frappe.pages["grl-for-gst"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("GRL for GST"),
		single_column: true,
	});

	new GrlForGst(page);
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

class GrlForGst {
	constructor(page) {
		this.page = page;
		this.active_section = "output";
		this.inject_styles();
		this.page.body.addClass("grl-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// Dates are left blank on purpose, same as Stock Sale Report - GST is
		// filed for a specific period someone picks deliberately, not whatever
		// range happened to be open last.
	}

	inject_styles() {
		if (document.getElementById("grl-styles")) return;
		$(`<style id="grl-styles">
			.grl-page .grl-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.grl-page .grl-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.grl-page .grl-filter-hint {
				font-size: 11px;
				color: var(--text-muted);
				margin: -10px 0 15px 0;
			}
			.grl-page .grl-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.grl-page .grl-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.grl-page .grl-card.payable {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.grl-page .grl-card .grl-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.grl-page .grl-card.payable .grl-card-label { color: #a3341f; }
			.grl-page .grl-card .grl-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.grl-page .grl-card.payable .grl-card-value { color: #a3341f; }
			.grl-page .grl-card .grl-card-sub {
				font-size: 11px;
				color: var(--text-muted);
				margin-top: 2px;
			}
			.grl-page .grl-tabs {
				display: flex;
				gap: 8px;
				margin-bottom: 16px;
			}
			.grl-page .grl-tab {
				padding: 6px 16px;
				border-radius: 6px;
				border: 1px solid var(--border-color);
				background: var(--fg-color);
				cursor: pointer;
				font-weight: 600;
				font-size: 13px;
			}
			.grl-page .grl-tab.active {
				background: #1b4f8c;
				color: #fff;
				border-color: #1b4f8c;
			}
			.grl-page .grl-subheading {
				font-weight: 700;
				font-size: 13px;
				margin: 18px 0 8px 0;
			}
			.grl-page .grl-subheading.returns { color: #a3341f; }
			.grl-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
				margin-bottom: 8px;
			}
			.grl-page table.grl-table {
				margin-bottom: 0;
			}
			.grl-page table.grl-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.grl-page table.grl-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
				white-space: nowrap;
			}
			.grl-page table.grl-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.grl-page table.grl-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.grl-page table.grl-table tr.grl-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="grl-section-title">GST</div>
			<div class="grl-section-subtitle">GRL for GST</div>
		`).appendTo(this.page.body);
	}

	make_filters() {
		const filter_row = $(
			`<div class="flex" style="gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 4px;"></div>`
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
		this.warehouse_field = field({
			fieldname: "warehouse",
			label: __("Warehouse (Outlet)"),
			fieldtype: "Link",
			options: "Warehouse",
		});

		const button_wrap = $(`<div></div>`).appendTo(filter_row);
		$(`<button class="btn btn-primary btn-sm">${__("Generate")}</button>`)
			.appendTo(button_wrap)
			.on("click", () => this.generate());

		$(`<div class="grl-filter-hint">${__(
			"Warehouse only narrows the Output/Sales side - GST is filed per business, so the Input/Purchase side always covers every outlet."
		)}</div>`).appendTo(this.page.body);
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

		btn(__("This Month"), () => this.set_range(frappe.datetime.month_start(), frappe.datetime.month_end()));
		btn(__("Last Month"), () => {
			const last_month_start = frappe.datetime.add_months(frappe.datetime.month_start(), -1);
			const last_month_end = frappe.datetime.add_days(frappe.datetime.month_start(), -1);
			this.set_range(last_month_start, last_month_end);
		});
	}

	set_range(from_date, to_date) {
		this.from_date_field.set_value(from_date);
		this.to_date_field.set_value(to_date);
	}

	make_results_area() {
		this.cards_area = $(`<div class="grl-cards"></div>`).appendTo(this.page.body);
		this.tabs_area = $(`<div class="grl-tabs"></div>`).appendTo(this.page.body);
		this.content_area = $(`<div></div>`).appendTo(this.page.body);
		this.content_area.html(`<p class="text-muted">${__("Set a From Date and To Date, then click Generate.")}</p>`);
	}

	generate() {
		const from_date = this.from_date_field.get_value();
		const to_date = this.to_date_field.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set both From Date and To Date."));
			return;
		}

		frappe.call({
			method: "metta.sales.page.grl_for_gst.grl_for_gst.get_data",
			args: {
				from_date,
				to_date,
				warehouse: this.warehouse_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message),
		});
	}

	render(data) {
		this.all_data = data;
		this.render_cards(data.summary);
		this.render_tabs();
		this.render_active_section();
	}

	render_cards(summary) {
		this.cards_area.html(`
			<div class="grl-card">
				<div class="grl-card-label">${__("Output Taxable Value")}</div>
				<div class="grl-card-value">${format_currency(summary.output_taxable)}</div>
				<div class="grl-card-sub">${__("Sales, net of Sales Returns")}</div>
			</div>
			<div class="grl-card">
				<div class="grl-card-label">${__("Output GST")}</div>
				<div class="grl-card-value">${format_currency(summary.output_gst)}</div>
				<div class="grl-card-sub">${__("CGST")} ${format_currency(summary.output_cgst)} + ${__("SGST")} ${format_currency(summary.output_sgst)}</div>
			</div>
			<div class="grl-card">
				<div class="grl-card-label">${__("Input Taxable Value")}</div>
				<div class="grl-card-value">${format_currency(summary.input_taxable)}</div>
				<div class="grl-card-sub">${__("Purchases, net of Purchase Returns")}</div>
			</div>
			<div class="grl-card">
				<div class="grl-card-label">${__("Input GST (ITC)")}</div>
				<div class="grl-card-value">${format_currency(summary.input_gst)}</div>
				<div class="grl-card-sub">${__("CGST")} ${format_currency(summary.input_cgst)} + ${__("SGST")} ${format_currency(summary.input_sgst)}</div>
			</div>
			<div class="grl-card payable">
				<div class="grl-card-label">${__("Net GST Payable")}</div>
				<div class="grl-card-value">${format_currency(summary.net_gst_payable)}</div>
				<div class="grl-card-sub">${__("Output GST minus Input GST (ITC)")}</div>
			</div>
		`);
	}

	render_tabs() {
		this.tabs_area.html(`
			<div class="grl-tab ${this.active_section === "output" ? "active" : ""}" data-section="output">
				${__("Output Tax (Sales)")}
			</div>
			<div class="grl-tab ${this.active_section === "input" ? "active" : ""}" data-section="input">
				${__("Input Tax (Purchases)")}
			</div>
		`);
		this.tabs_area.find(".grl-tab").on("click", (e) => {
			this.active_section = $(e.currentTarget).data("section");
			this.render_tabs();
			this.render_active_section();
		});
	}

	render_active_section() {
		const section = this.all_data[this.active_section];
		const is_output = this.active_section === "output";
		const detail_label = is_output ? __("Sales") : __("Purchases");
		const returns_label = is_output ? __("Sales Returns") : __("Purchase Returns");

		let html = `<div class="grl-subheading">${__("HSN-wise Summary")} - ${detail_label}</div>`;
		html += this.build_hsn_table(section.hsn_summary);

		html += `<div class="grl-subheading">${__("Invoice-wise Detail")} - ${detail_label}</div>`;
		html += this.build_detail_table(section.detail, is_output);

		html += `<div class="grl-subheading returns">${__("Less")}: ${returns_label}</div>`;
		if (section.returns_hsn_summary.length) {
			html += this.build_hsn_table(section.returns_hsn_summary);
			html += this.build_detail_table(section.returns_detail, is_output);
		} else {
			html += `<p class="text-muted">${__("None in this period.")}</p>`;
		}

		this.content_area.html(html);
	}

	build_hsn_table(rows) {
		if (!rows.length) {
			return `<p class="text-muted">${__("No data for this period.")}</p>`;
		}
		const total_taxable = rows.reduce((s, r) => s + flt(r.taxable_value), 0);
		const total_gst = rows.reduce((s, r) => s + flt(r.gst_amount), 0);

		const body = rows
			.map(
				(r) => `
				<tr>
					<td>${frappe.utils.escape_html(r.hsn_code || "")}</td>
					<td>${frappe.utils.escape_html(r.hsn_description || "")}</td>
					<td class="text-center">${r.gst_percent != null ? flt(r.gst_percent) + "%" : ""}</td>
					<td class="text-center">${r.doc_count}</td>
					<td class="text-center">${format_currency(r.taxable_value)}</td>
					<td class="text-center">${format_currency(r.gst_amount)}</td>
				</tr>`
			)
			.join("");

		return `
			<div class="table-wrapper" style="overflow-x: auto;">
				<table class="table table-hover grl-table">
					<thead>
						<tr>
							<th>${__("HSN Code")}</th>
							<th>${__("Description")}</th>
							<th>${__("GST %")}</th>
							<th>${__("Docs")}</th>
							<th>${__("Taxable Value")}</th>
							<th>${__("GST Amount")}</th>
						</tr>
					</thead>
					<tbody>
						${body}
						<tr class="grl-total">
							<td colspan="4">${__("Total")}</td>
							<td class="text-center">${format_currency(total_taxable)}</td>
							<td class="text-center">${format_currency(total_gst)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		`;
	}

	build_detail_table(rows, is_output) {
		if (!rows.length) {
			return `<p class="text-muted">${__("No data for this period.")}</p>`;
		}
		const party_header = is_output ? __("Customer") : __("Supplier");
		const total_taxable = rows.reduce((s, r) => s + flt(r.amount), 0);
		const total_gst = rows.reduce((s, r) => s + flt(r.gst_amount), 0);

		const body = rows
			.map(
				(r) => `
				<tr>
					<td>${frappe.utils.escape_html(r.doc_type || "")}</td>
					<td>${frappe.utils.escape_html(r.doc_no || "")}</td>
					<td>${format_ddmmyy(r.doc_date)}</td>
					<td>${frappe.utils.escape_html(r.party || (is_output ? __("Walk-in") : ""))}</td>
					<td>${frappe.utils.escape_html(r.gstin || "")}</td>
					<td>${frappe.utils.escape_html(r.item || "")}</td>
					<td>${frappe.utils.escape_html(r.item_name || "")}</td>
					<td>${frappe.utils.escape_html(r.hsn_code || "")}</td>
					<td class="text-center">${flt(r.qty)}</td>
					<td class="text-center">${format_currency(r.rate)}</td>
					<td class="text-center">${format_currency(r.amount)}</td>
					<td class="text-center">${r.gst_percent != null ? flt(r.gst_percent) + "%" : ""}</td>
					<td class="text-center">${format_currency(r.gst_amount)}</td>
				</tr>`
			)
			.join("");

		return `
			<div class="table-wrapper" style="overflow-x: auto;">
				<table class="table table-hover grl-table">
					<thead>
						<tr>
							<th>${__("Type")}</th>
							<th>${__("Doc No")}</th>
							<th>${__("Date")}</th>
							<th>${party_header}</th>
							<th>${__("GSTIN")}</th>
							<th>${__("Item")}</th>
							<th>${__("Item Name")}</th>
							<th>${__("HSN Code")}</th>
							<th>${__("Qty")}</th>
							<th>${__("Rate")}</th>
							<th>${__("Taxable Value")}</th>
							<th>${__("GST %")}</th>
							<th>${__("GST Amount")}</th>
						</tr>
					</thead>
					<tbody>
						${body}
						<tr class="grl-total">
							<td colspan="10">${__("Total")}</td>
							<td class="text-center">${format_currency(total_taxable)}</td>
							<td></td>
							<td class="text-center">${format_currency(total_gst)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		`;
	}

	get_export_data() {
		if (!this.all_data) return null;
		const is_output = this.active_section === "output";
		const section = this.all_data[this.active_section];
		const rows_source = [...section.detail, ...section.returns_detail];
		if (!rows_source.length) return null;

		const columns = [
			"Type",
			"Doc No",
			"Date",
			is_output ? "Customer" : "Supplier",
			"GSTIN",
			"Item",
			"Item Name",
			"HSN Code",
			"Qty",
			"Rate",
			"Taxable Value",
			"GST %",
			"GST Amount",
		].map((c) => __(c));

		const data = rows_source.map((r) => [
			r.doc_type || "",
			r.doc_no || "",
			format_ddmmyy(r.doc_date),
			r.party || (is_output ? __("Walk-in") : ""),
			r.gstin || "",
			r.item || "",
			r.item_name || "",
			r.hsn_code || "",
			flt(r.qty),
			format_currency(r.rate),
			format_currency(r.amount),
			r.gst_percent != null ? flt(r.gst_percent) + "%" : "",
			format_currency(r.gst_amount),
		]);

		const total_taxable = rows_source.reduce((s, r) => s + flt(r.amount), 0);
		const total_gst = rows_source.reduce((s, r) => s + flt(r.gst_amount), 0);
		data.push([__("Total"), "", "", "", "", "", "", "", "", "", format_currency(total_taxable), "", format_currency(total_gst)]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];
		if (is_output && this.warehouse_field.get_value()) {
			filter_bits.push(`${__("Warehouse")}: ${this.warehouse_field.get_value()}`);
		}

		return {
			title: is_output ? __("GRL for GST - Output Tax (Sales)") : __("GRL for GST - Input Tax (Purchases)"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: is_output ? "GRL_GST_Output" : "GRL_GST_Input",
		};
	}
}
