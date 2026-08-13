frappe.pages["previous-day-stock-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Previous Day Stock Report"),
		single_column: true,
	});

	new PreviousDayStockReport(page);
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

class PreviousDayStockReport {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("pdsr-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// Unlike the other reports, "yesterday" isn't an arbitrary default
		// here - it's literally what this report is named for, so it's
		// filled in and run automatically instead of waiting for a click.
		const yesterday = frappe.datetime.add_days(frappe.datetime.get_today(), -1);
		// set_value() is async - calling generate() right after it (without
		// waiting) reads the field before the value actually lands, so the
		// "Please set an As of Date" check fires on a still-empty field.
		this.as_of_date_field.set_value(yesterday).then(() => {
			this.generate();
		});
	}

	inject_styles() {
		if (document.getElementById("pdsr-styles")) return;
		$(`<style id="pdsr-styles">
			.pdsr-page .pdsr-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.pdsr-page .pdsr-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.pdsr-page .pdsr-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.pdsr-page .pdsr-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.pdsr-page .pdsr-card.zero-stock {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.pdsr-page .pdsr-card .pdsr-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.pdsr-page .pdsr-card.zero-stock .pdsr-card-label {
				color: #a3341f;
			}
			.pdsr-page .pdsr-card .pdsr-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.pdsr-page .pdsr-card.zero-stock .pdsr-card-value {
				color: #a3341f;
			}
			.pdsr-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.pdsr-page table.pdsr-table {
				margin-bottom: 0;
			}
			.pdsr-page table.pdsr-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.pdsr-page table.pdsr-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.pdsr-page table.pdsr-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.pdsr-page table.pdsr-table tbody tr:hover {
				background: var(--awesomplete-hover-bg, rgba(84, 141, 244, 0.08));
			}
			.pdsr-page table.pdsr-table td.text-right {
				font-variant-numeric: tabular-nums;
			}
			.pdsr-page table.pdsr-table tr.pdsr-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
			.pdsr-page table.pdsr-table tr.pdsr-zero-row td {
				background: #fdece7;
				color: #a3341f;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="pdsr-section-title">STOCK</div>
			<div class="pdsr-section-subtitle">Previous Day Stock Report</div>
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

		this.as_of_date_field = field({
			fieldname: "as_of_date",
			label: __("As of Date (dd/mm/yyyy)"),
			fieldtype: "Date",
			reqd: 1,
		});
		this.warehouse_field = field({
			fieldname: "warehouse",
			label: __("Warehouse"),
			fieldtype: "Link",
			options: "Warehouse",
		});
		this.item_field = field({ fieldname: "item", label: __("Item"), fieldtype: "Link", options: "Item" });

		const button_wrap = $(`<div></div>`).appendTo(filter_row);
		$(`<button class="btn btn-primary btn-sm">${__("Generate")}</button>`)
			.appendTo(button_wrap)
			.on("click", () => this.generate());
	}

	make_quick_range_buttons() {
		const wrap = $(`<div style="margin-bottom: 15px;"></div>`).appendTo(this.page.body);
		$(`<button class="btn btn-default btn-xs">${__("Yesterday")}</button>`)
			.appendTo(wrap)
			.on("click", () => {
				const yesterday = frappe.datetime.add_days(frappe.datetime.get_today(), -1);
				this.as_of_date_field.set_value(yesterday).then(() => {
					this.generate();
				});
			});
	}

	make_results_area() {
		this.cards_area = $(`<div class="pdsr-cards"></div>`).appendTo(this.page.body);
		this.table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(this.page.body);
		this.table_area.html(`<p class="text-muted">${__("Set an As of Date, then click Generate.")}</p>`);
	}

	generate() {
		const as_of_date = this.as_of_date_field.get_value();
		if (!as_of_date) {
			frappe.msgprint(__("Please set an As of Date."));
			return;
		}

		frappe.call({
			method: "metta.stock.page.previous_day_stock_report.previous_day_stock_report.get_data",
			args: {
				as_of_date,
				warehouse: this.warehouse_field.get_value(),
				item: this.item_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message || []),
		});
	}

	get_export_data() {
		if (!this.last_rows) return null;
		const rows = this.last_rows;

		const columns = [
			"Item",
			"Item Name",
			"Warehouse",
			"Batch",
			"Closing Qty",
			"Valuation Rate",
			"Closing Value",
			"Last Transaction",
			"Voucher Type",
			"Voucher No",
			"Status",
		].map((c) => __(c));

		const data = rows.map((row) => {
			const is_zero = flt(row.qty_after_transaction) === 0;
			const value = flt(row.qty_after_transaction) * flt(row.valuation_rate);
			return [
				row.item || "",
				row.item_name || "",
				row.warehouse || "",
				row.batch_no || "",
				flt(row.qty_after_transaction),
				format_currency(row.valuation_rate),
				format_currency(value),
				format_ddmmyy(row.posting_datetime),
				row.voucher_type || "",
				row.voucher_no || "",
				is_zero ? __("Zero Stock") : __("In Stock"),
			];
		});

		const non_zero_rows = rows.filter((r) => flt(r.qty_after_transaction) > 0);
		const total_qty = non_zero_rows.reduce((sum, row) => sum + flt(row.qty_after_transaction), 0);
		const total_value = non_zero_rows.reduce(
			(sum, row) => sum + flt(row.qty_after_transaction) * flt(row.valuation_rate),
			0
		);
		data.push([__("Total"), "", "", "", total_qty, "", format_currency(total_value), "", "", "", ""]);

		const filter_bits = [`${__("As of Date")}: ${format_ddmmyy(this.as_of_date_field.get_value())}`];
		if (this.warehouse_field.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.warehouse_field.get_value()}`);
		if (this.item_field.get_value()) filter_bits.push(`${__("Item")}: ${this.item_field.get_value()}`);

		return {
			title: __("Previous Day Stock Report"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Previous_Day_Stock_Report",
		};
	}

	render(all_rows) {
		this.last_rows = all_rows;
		// Cards are computed from every row (including zero-qty ones), but
		// the table itself only shows what's actually still in stock - a
		// zero-qty row isn't something to browse, it's what the "Items at
		// Zero Stock" card is for.
		const items_tracked = new Set(all_rows.filter((r) => flt(r.qty_after_transaction) > 0).map((r) => r.item)).size;
		const total_value = all_rows.reduce(
			(sum, row) => sum + flt(row.qty_after_transaction) * flt(row.valuation_rate),
			0
		);
		const zero_stock_count = all_rows.filter((r) => flt(r.qty_after_transaction) === 0).length;

		this.cards_area.html(`
			<div class="pdsr-card">
				<div class="pdsr-card-label">${__("Items Tracked")}</div>
				<div class="pdsr-card-value">${items_tracked}</div>
			</div>
			<div class="pdsr-card">
				<div class="pdsr-card-label">${__("Total Closing Value")}</div>
				<div class="pdsr-card-value">${format_currency(total_value)}</div>
			</div>
			<div class="pdsr-card ${zero_stock_count ? "zero-stock" : ""}">
				<div class="pdsr-card-label">${__("Items at Zero Stock")}</div>
				<div class="pdsr-card-value">${zero_stock_count}</div>
			</div>
		`);

		// Zero-qty rows are shown, not hidden - flagged visually instead, so
		// "why does the card say 1 but I can't find it" never happens again.
		const rows = all_rows;

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No stock found as of this date.")}</p>`);
			return;
		}

		const CENTER_HEADERS = new Set(["Closing Qty", "Valuation Rate", "Last Transaction"]);
		const header = [
			"Item",
			"Item Name",
			"Warehouse",
			"Batch",
			"Closing Qty",
			"Valuation Rate",
			"Closing Value",
			"Last Transaction",
			"Voucher Type",
			"Voucher No",
			"Status",
		]
			.map((h) => `<th${CENTER_HEADERS.has(h) ? ' style="text-align: center;"' : ""}>${__(h)}</th>`)
			.join("");

		const body = rows
			.map((row) => {
				const is_zero = flt(row.qty_after_transaction) === 0;
				const value = flt(row.qty_after_transaction) * flt(row.valuation_rate);
				return `
				<tr class="${is_zero ? "pdsr-zero-row" : ""}">
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}</td>
					<td>${frappe.utils.escape_html(row.warehouse || "")}</td>
					<td>${frappe.utils.escape_html(row.batch_no || "")}</td>
					<td class="text-center">${flt(row.qty_after_transaction)}</td>
					<td class="text-center">${format_currency(row.valuation_rate)}</td>
					<td class="text-center">${format_currency(value)}</td>
					<td class="text-center">${format_ddmmyy(row.posting_datetime)}</td>
					<td>${frappe.utils.escape_html(row.voucher_type || "")}</td>
					<td><a href="/app/${frappe.router.slug(row.voucher_type || "")}/${row.voucher_no}">${row.voucher_no || ""}</a></td>
					<td>
						${is_zero
							? `<span class="indicator-pill red"><span>${__("Zero Stock")}</span></span>`
							: `<span class="indicator-pill green"><span>${__("In Stock")}</span></span>`}
					</td>
				</tr>`;
			})
			.join("");

		const non_zero_rows = rows.filter((r) => flt(r.qty_after_transaction) > 0);
		const total_qty = non_zero_rows.reduce((sum, row) => sum + flt(row.qty_after_transaction), 0);
		const total_row = `
			<tr class="pdsr-total">
				<td colspan="4">${__("Total")}</td>
				<td class="text-center">${total_qty}</td>
				<td></td>
				<td class="text-right">${format_currency(non_zero_rows.reduce((s, r) => s + flt(r.qty_after_transaction) * flt(r.valuation_rate), 0))}</td>
				<td colspan="4"></td>
			</tr>`;

		this.table_area.html(`
			<table class="table table-hover pdsr-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);
	}
}
