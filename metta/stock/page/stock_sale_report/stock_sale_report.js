frappe.pages["stock-sale-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Stock Sale Report"),
		single_column: true,
	});

	new StockSaleReport(page);
};

const ITEM_TYPE_OPTIONS = ["", "Medicine", "Service", "Consumable"];
const BILL_TYPE_OPTIONS = ["", "Pharmacy", "Service", "Mixed"];

function format_ddmmyy(date_str) {
	if (!date_str) return "";
	const d = new Date(date_str);
	if (isNaN(d)) return "";
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yy = String(d.getFullYear()).slice(-2);
	return `${dd}/${mm}/${yy}`;
}

class StockSaleReport {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("ssr-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// Dates are left blank on purpose - staff pick the range themselves
		// (or use the quick-range buttons) rather than the page assuming a
		// default and running a query before anyone asked for one.
	}

	inject_styles() {
		if (document.getElementById("ssr-styles")) return;
		$(`<style id="ssr-styles">
			.ssr-page .ssr-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.ssr-page .ssr-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.ssr-page .ssr-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.ssr-page .ssr-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.ssr-page .ssr-card .ssr-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.ssr-page .ssr-card .ssr-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.ssr-page table.ssr-table tr.ssr-low-stock td {
				background: #fdece7;
			}
			.ssr-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.ssr-page table.ssr-table {
				margin-bottom: 0;
			}
			.ssr-page table.ssr-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.ssr-page table.ssr-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.ssr-page table.ssr-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.ssr-page table.ssr-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.ssr-page table.ssr-table tr.ssr-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="ssr-section-title">SALES &amp; STOCK</div>
			<div class="ssr-section-subtitle">Stock Sale Report</div>
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
		this.warehouse_field = field({
			fieldname: "warehouse",
			label: __("Warehouse (Outlet)"),
			fieldtype: "Link",
			options: "Warehouse",
		});
		this.item_field = field({ fieldname: "item", label: __("Item"), fieldtype: "Link", options: "Item" });
		this.item_type_field = field({
			fieldname: "item_type",
			label: __("Item Type"),
			fieldtype: "Select",
			options: ITEM_TYPE_OPTIONS.join("\n"),
		});
		this.bill_type_field = field({
			fieldname: "bill_type",
			label: __("Bill Type"),
			fieldtype: "Select",
			options: BILL_TYPE_OPTIONS.join("\n"),
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
				.on("click", () => fn().then(() => this.generate()));

		btn(__("Today"), () => this.set_range(frappe.datetime.get_today(), frappe.datetime.get_today()));
		btn(__("This Week"), () => this.set_range(frappe.datetime.week_start(), frappe.datetime.week_end()));
		btn(__("This Month"), () => this.set_range(frappe.datetime.month_start(), frappe.datetime.month_end()));
	}

	set_range(from_date, to_date) {
		// set_value() is async (goes through frappe.run_serially) - Generate
		// must wait on this or it reads the fields' old (still empty) value
		// and wrongly warns to set both dates.
		return Promise.all([this.from_date_field.set_value(from_date), this.to_date_field.set_value(to_date)]);
	}

	make_results_area() {
		this.cards_area = $(`<div class="ssr-cards"></div>`).appendTo(this.page.body);
		this.table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(this.page.body);
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
			method: "metta.stock.page.stock_sale_report.stock_sale_report.get_data",
			args: {
				from_date,
				to_date,
				warehouse: this.warehouse_field.get_value(),
				item: this.item_field.get_value(),
				item_type: this.item_type_field.get_value(),
				bill_type: this.bill_type_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message || []),
		});
	}

	render(rows) {
		this.all_rows = rows;

		const total_bills = rows.reduce((sum, r) => sum + (r.bill_count || 0), 0);
		const sales_value = rows.reduce((sum, r) => sum + flt(r.sales_value), 0);
		const stock_value = rows.reduce((sum, r) => sum + flt(r.stock_value), 0);
		const low_stock_count = rows.filter((r) => r.is_low_stock).length;

		this.cards_area.html(`
			<div class="ssr-card">
				<div class="ssr-card-label">${__("Items Listed")}</div>
				<div class="ssr-card-value">${rows.length}</div>
			</div>
			<div class="ssr-card">
				<div class="ssr-card-label">${__("Sales Value")}</div>
				<div class="ssr-card-value">${format_currency(sales_value)}</div>
			</div>
			<div class="ssr-card">
				<div class="ssr-card-label">${__("Current Stock Value")}</div>
				<div class="ssr-card-value">${format_currency(stock_value)}</div>
			</div>
			<div class="ssr-card">
				<div class="ssr-card-label">${__("Below Reorder Level")}</div>
				<div class="ssr-card-value">${low_stock_count}</div>
			</div>
		`);

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No sales or stock found for this range.")}</p>`);
			return;
		}

		const header = [
			"Item",
			"Item Name",
			"Item Type",
			"Warehouse",
			"Bills",
			"Qty Sold",
			"Current Stock",
			"Sales Value",
			"GST Collected",
			"Days of Stock Left",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const days_cell = (row) => {
			if (row.days_of_stock === null || row.days_of_stock === undefined) {
				return `<span class="text-muted">${__("Not selling")}</span>`;
			}
			return Math.round(row.days_of_stock);
		};

		const body = rows
			.map(
				(row) => `
				<tr class="${row.is_low_stock ? "ssr-low-stock" : ""}">
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}</td>
					<td>${frappe.utils.escape_html(row.item_type || "")}</td>
					<td>${frappe.utils.escape_html(row.warehouse || "")}</td>
					<td class="text-center">${row.bill_count}</td>
					<td class="text-center">${flt(row.qty_sold)}</td>
					<td class="text-center">${flt(row.current_stock)}</td>
					<td class="text-center">${format_currency(row.sales_value)}</td>
					<td class="text-center">${format_currency(row.gst_collected)}</td>
					<td class="text-center">${days_cell(row)}</td>
				</tr>`
			)
			.join("");

		const total_row = `
			<tr class="ssr-total">
				<td colspan="4">${__("Total")}</td>
				<td class="text-center">${total_bills}</td>
				<td class="text-center">${rows.reduce((s, r) => s + flt(r.qty_sold), 0)}</td>
				<td class="text-center">${rows.reduce((s, r) => s + flt(r.current_stock), 0)}</td>
				<td class="text-center">${format_currency(sales_value)}</td>
				<td class="text-center">${format_currency(rows.reduce((s, r) => s + flt(r.gst_collected), 0))}</td>
				<td></td>
			</tr>`;

		this.table_area.html(`
			<table class="table table-hover ssr-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);
	}

	get_export_data() {
		if (!this.all_rows) return null;
		const rows = this.all_rows;

		const columns = [
			"Item",
			"Item Name",
			"Item Type",
			"Warehouse",
			"Bills",
			"Qty Sold",
			"Current Stock",
			"Sales Value",
			"GST Collected",
			"Days of Stock Left",
			"Below Reorder Level",
		].map((c) => __(c));

		const data = rows.map((row) => [
			row.item || "",
			row.item_name || "",
			row.item_type || "",
			row.warehouse || "",
			row.bill_count,
			flt(row.qty_sold),
			flt(row.current_stock),
			format_currency(row.sales_value),
			format_currency(row.gst_collected),
			row.days_of_stock === null || row.days_of_stock === undefined ? __("Not selling") : Math.round(row.days_of_stock),
			row.is_low_stock ? __("Yes") : "",
		]);

		const total_qty_sold = rows.reduce((s, r) => s + flt(r.qty_sold), 0);
		const total_sales = rows.reduce((s, r) => s + flt(r.sales_value), 0);
		const total_gst = rows.reduce((s, r) => s + flt(r.gst_collected), 0);
		const total_stock = rows.reduce((s, r) => s + flt(r.current_stock), 0);
		const total_bills = rows.reduce((s, r) => s + (r.bill_count || 0), 0);

		data.push([
			__("Total"),
			"",
			"",
			"",
			total_bills,
			total_qty_sold,
			total_stock,
			format_currency(total_sales),
			format_currency(total_gst),
			"",
			"",
		]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];
		if (this.warehouse_field.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.warehouse_field.get_value()}`);
		if (this.item_type_field.get_value()) filter_bits.push(`${__("Item Type")}: ${this.item_type_field.get_value()}`);
		if (this.bill_type_field.get_value()) filter_bits.push(`${__("Bill Type")}: ${this.bill_type_field.get_value()}`);

		return {
			title: __("Stock Sale Report"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Stock_Sale_Report",
		};
	}
}
