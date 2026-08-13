frappe.pages["outletwise-stock-tra"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Outletwise Stock Transfer Summary"),
		single_column: true,
	});

	new OutletwiseStockTransferSummary(page);
};

const TRANSFER_STATUS_INDICATOR = {
	Draft: "gray",
	Dispatched: "orange",
	Confirmed: "green",
	Cancelled: "red",
};

function format_ddmmyy(date_str) {
	// Fixed dd/mm/yy display regardless of the logged-in user's System
	// Settings date format, since that setting isn't consistent from user
	// to user and this page needs to always read the same way.
	if (!date_str) return "";
	const d = new Date(date_str);
	if (isNaN(d)) return "";
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yy = String(d.getFullYear()).slice(-2);
	return `${dd}/${mm}/${yy}`;
}

class OutletwiseStockTransferSummary {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("owsts-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// Dates are left blank on purpose - staff pick the range themselves
		// (or use the quick-range buttons) rather than the page assuming
		// "today" and running a query before anyone asked for one.
	}

	inject_styles() {
		if (document.getElementById("owsts-styles")) return;
		$(`<style id="owsts-styles">
			.owsts-page .owsts-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.owsts-page .owsts-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1ac9ac;
				margin-bottom: 18px;
			}
			.owsts-page .owsts-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.owsts-page .owsts-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.owsts-page .owsts-card.has-discrepancy {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.owsts-page .owsts-card .owsts-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.owsts-page .owsts-card.has-discrepancy .owsts-card-label {
				color: #a3341f;
			}
			.owsts-page .owsts-card .owsts-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.owsts-page .owsts-card.has-discrepancy .owsts-card-value {
				color: #a3341f;
			}
			.owsts-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.owsts-page table.owsts-table {
				margin-bottom: 0;
			}
			.owsts-page table.owsts-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.owsts-page table.owsts-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.owsts-page table.owsts-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.owsts-page table.owsts-table tbody tr:hover {
				background: var(--awesomplete-hover-bg, rgba(84, 141, 244, 0.08));
			}
			.owsts-page table.owsts-table td.text-right {
				font-variant-numeric: tabular-nums;
			}
			.owsts-page table.owsts-table tr.owsts-discrepancy-row td {
				background: #fdece7;
			}
			.owsts-page table.owsts-table tr.owsts-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
			.owsts-page table.owsts-table tr.owsts-group-row td.owsts-toggle {
				font-size: 11px;
				color: #1b4f8c;
			}
			.owsts-page table.owsts-table tr.owsts-detail-row td {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.06));
				font-size: 12px;
				color: var(--text-muted);
			}
			.owsts-page table.owsts-table tr.owsts-detail-row td.owsts-detail-indent {
				padding-left: 32px;
				font-weight: 600;
				color: var(--text-color);
			}
			.owsts-page table.owsts-table tr.owsts-detail-header td {
				background: #dbe7f3;
				color: #0b4a86;
				font-weight: 700;
				text-transform: uppercase;
				font-size: 10px;
				letter-spacing: 0.04em;
			}
			.owsts-page table.owsts-table tr.owsts-detail-header td:nth-child(3) {
				padding-left: 32px;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="owsts-section-title">STOCK TRANSFERS</div>
			<div class="owsts-section-subtitle">Outletwise Stock Transfer Summary</div>
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
		this.status_field = field({
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: ["", "Draft", "Dispatched", "Confirmed", "Cancelled"].join("\n"),
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

		btn(__("Today"), () => this.set_range_today());
		btn(__("This Week"), () => this.set_range(frappe.datetime.week_start(), frappe.datetime.week_end()));
		btn(__("This Month"), () => this.set_range(frappe.datetime.month_start(), frappe.datetime.month_end()));
	}

	set_range_today() {
		const today = frappe.datetime.get_today();
		this.set_range(today, today);
	}

	set_range(from_date, to_date) {
		this.from_date_field.set_value(from_date);
		this.to_date_field.set_value(to_date);
	}

	make_results_area() {
		this.cards_area = $(`<div class="owsts-cards"></div>`).appendTo(this.page.body);
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
			method: "metta.stock.page.outletwise_stock_tra.outletwise_stock_tra.get_data",
			args: {
				from_date,
				to_date,
				warehouse: this.warehouse_field.get_value(),
				status: this.status_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message || []),
		});
	}

	get_export_data() {
		if (!this.all_rows) return null;
		const rows = this.all_rows;

		// Flattened one row per stock-transfer-item pairing, rather than the
		// group/detail split the on-screen table uses - a spreadsheet or PDF
		// export doesn't have a toggle arrow, so every item needs its own
		// visible line instead of being hidden behind one.
		const columns = [
			"Dispatch Date",
			"Stock Transfer",
			"From Warehouse",
			"To Warehouse",
			"Item Code",
			"Item Name",
			"Batch",
			"Qty Dispatched",
			"Qty Confirmed",
			"Status",
		].map((c) => __(c));

		const data = rows.map((row) => [
			format_ddmmyy(row.dispatch_date_time),
			row.stock_transfer || "",
			row.from_warehouse || "",
			row.to_warehouse || "",
			row.item || "",
			row.item_name || "",
			row.batch || "",
			flt(row.qty_dispatched),
			flt(row.qty_confirmed),
			row.status || "",
		]);

		const total_dispatched = rows.reduce((sum, row) => sum + flt(row.qty_dispatched), 0);
		const total_confirmed = rows.reduce((sum, row) => sum + flt(row.qty_confirmed), 0);
		data.push([__("Total"), "", "", "", "", "", "", total_dispatched, total_confirmed, ""]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];
		if (this.warehouse_field.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.warehouse_field.get_value()}`);
		if (this.status_field.get_value()) filter_bits.push(`${__("Status")}: ${this.status_field.get_value()}`);

		return {
			title: __("Outletwise Stock Transfer Summary"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Outletwise_Stock_Transfer_Summary",
		};
	}

	render(rows) {
		// Kept around so "View Items" can look up a specific transfer's full
		// item list later, without a second server round-trip.
		this.all_rows = rows;

		const transfer_count = new Set(rows.map((r) => r.stock_transfer)).size;
		const total_dispatched = rows.reduce((sum, row) => sum + flt(row.qty_dispatched), 0);
		const total_confirmed = rows.reduce((sum, row) => sum + flt(row.qty_confirmed), 0);
		const discrepancy_count = new Set(rows.filter((r) => r.has_discrepancy).map((r) => r.stock_transfer)).size;

		this.cards_area.html(`
			<div class="owsts-card">
				<div class="owsts-card-label">${__("Total Transfers")}</div>
				<div class="owsts-card-value">${transfer_count}</div>
			</div>
			<div class="owsts-card">
				<div class="owsts-card-label">${__("Qty Dispatched")}</div>
				<div class="owsts-card-value">${total_dispatched}</div>
			</div>
			<div class="owsts-card">
				<div class="owsts-card-label">${__("Qty Confirmed")}</div>
				<div class="owsts-card-value">${total_confirmed}</div>
			</div>
			<div class="owsts-card ${discrepancy_count ? "has-discrepancy" : ""}">
				<div class="owsts-card-label">${__("Discrepancies")}</div>
				<div class="owsts-card-value">${discrepancy_count}</div>
			</div>
		`);

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No Stock Transfers found for this range.")}</p>`);
			return;
		}

		// One summary row per Stock Transfer, not per item - a transfer with
		// 100+ items would otherwise repeat its date/warehouse/status 100+
		// times. Its items sit in hidden rows right underneath, revealed by
		// the toggle arrow - everything stays in one flat table (so a page
		// export/copy-paste captures it all), instead of a separate dialog.
		const groups = new Map();
		rows.forEach((row) => {
			if (!groups.has(row.stock_transfer)) {
				groups.set(row.stock_transfer, {
					stock_transfer: row.stock_transfer,
					dispatch_date_time: row.dispatch_date_time,
					from_warehouse: row.from_warehouse,
					to_warehouse: row.to_warehouse,
					status: row.status,
					has_discrepancy: false,
					item_count: 0,
					total_dispatched: 0,
					total_confirmed: 0,
					items: [],
				});
			}
			const g = groups.get(row.stock_transfer);
			g.has_discrepancy = g.has_discrepancy || !!row.has_discrepancy;
			g.item_count += 1;
			g.total_dispatched += flt(row.qty_dispatched);
			g.total_confirmed += flt(row.qty_confirmed);
			g.items.push(row);
		});

		const header = [
			"",
			"Dispatch Date",
			"Stock Transfer",
			"From Warehouse",
			"To Warehouse",
			"Items",
			"Qty Dispatched",
			"Qty Confirmed",
			"Status",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = Array.from(groups.values())
			.map((g) => {
				const indicator = TRANSFER_STATUS_INDICATOR[g.status] || "gray";
				const row_class = g.has_discrepancy ? "owsts-discrepancy-row" : "";

				const group_row = `
				<tr class="owsts-group-row ${row_class}">
					<td class="owsts-toggle" data-target="${g.stock_transfer}" style="cursor: pointer; text-align: center;">▶</td>
					<td>${format_ddmmyy(g.dispatch_date_time)}</td>
					<td><a href="/app/stock-transfer/${g.stock_transfer}">${g.stock_transfer}</a></td>
					<td>${frappe.utils.escape_html(g.from_warehouse || "")}</td>
					<td>${frappe.utils.escape_html(g.to_warehouse || "")}</td>
					<td class="text-center">
						<span class="indicator-pill gray"><span>${g.item_count} ${g.item_count === 1 ? __("item") : __("items")}</span></span>
					</td>
					<td class="text-center">${g.total_dispatched}</td>
					<td class="text-center">${g.total_confirmed}</td>
					<td><span class="indicator-pill ${indicator}"><span>${frappe.utils.escape_html(g.status || "")}</span></span></td>
				</tr>`;

				const detail_header = `
				<tr class="owsts-detail-row owsts-detail-header" data-parent="${g.stock_transfer}" style="display: none;">
					<td></td>
					<td></td>
					<td>${__("Item Code")}</td>
					<td>${__("Item Name")}</td>
					<td>${__("Batch")}</td>
					<td></td>
					<td class="text-center">${__("Qty Dispatched")}</td>
					<td class="text-center">${__("Qty Confirmed")}</td>
					<td></td>
				</tr>`;

				const detail_rows = g.items
					.map(
						(row) => `
					<tr class="owsts-detail-row" data-parent="${g.stock_transfer}" style="display: none;">
						<td></td>
						<td></td>
						<td class="owsts-detail-indent">${frappe.utils.escape_html(row.item || "")}</td>
						<td>${frappe.utils.escape_html(row.item_name || "")}</td>
						<td>${frappe.utils.escape_html(row.batch || "")}</td>
						<td></td>
						<td class="text-center">${flt(row.qty_dispatched)}</td>
						<td class="text-center">${flt(row.qty_confirmed)}</td>
						<td></td>
					</tr>`
					)
					.join("");

				return group_row + detail_header + detail_rows;
			})
			.join("");

		const total_row = `
			<tr class="owsts-total">
				<td colspan="6">${__("Total")}</td>
				<td class="text-center">${total_dispatched}</td>
				<td class="text-center">${total_confirmed}</td>
				<td></td>
			</tr>`;

		this.table_area.html(`
			<table class="table table-hover owsts-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);

		this.table_area.find(".owsts-toggle").on("click", (e) => {
			const $toggle = $(e.currentTarget);
			const target = $toggle.data("target");
			const $detail_rows = this.table_area.find(`.owsts-detail-row[data-parent="${target}"]`);
			const now_open = $detail_rows.first().is(":visible");
			$detail_rows.toggle(!now_open);
			$toggle.text(now_open ? "▶" : "▼");
		});
	}
}
