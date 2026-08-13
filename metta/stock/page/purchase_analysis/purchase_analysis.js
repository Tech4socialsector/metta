frappe.pages["purchase-analysis"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Purchase Analysis"),
		single_column: true,
	});

	new PurchaseAnalysis(page);
};

const BILLING_STATUS_INDICATOR = {
	"Not Billed": "red",
	"Partially Billed": "orange",
	"Fully Billed": "green",
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

function billing_status(ordered_amount, billed_amount) {
	if (flt(billed_amount) <= 0) return "Not Billed";
	if (flt(billed_amount) >= flt(ordered_amount)) return "Fully Billed";
	return "Partially Billed";
}

class PurchaseAnalysis {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("pa-page");
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
		if (document.getElementById("pa-styles")) return;
		$(`<style id="pa-styles">
			.pa-page .pa-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.pa-page .pa-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.pa-page .pa-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.pa-page .pa-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.pa-page .pa-card.pending {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.pa-page .pa-card .pa-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.pa-page .pa-card.pending .pa-card-label {
				color: #a3341f;
			}
			.pa-page .pa-card .pa-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.pa-page .pa-card.pending .pa-card-value {
				color: #a3341f;
			}
			.pa-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.pa-page table.pa-table {
				margin-bottom: 0;
			}
			.pa-page table.pa-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.pa-page table.pa-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.pa-page table.pa-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.pa-page table.pa-table tbody tr:hover {
				background: var(--awesomplete-hover-bg, rgba(84, 141, 244, 0.08));
			}
			.pa-page table.pa-table td.text-right {
				font-variant-numeric: tabular-nums;
			}
			.pa-page table.pa-table tr.pa-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="pa-section-title">PURCHASE ORDERS</div>
			<div class="pa-section-subtitle">Purchase Analysis</div>
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
		this.supplier_field = field({ fieldname: "supplier", label: __("Supplier"), fieldtype: "Link", options: "Supplier" });
		this.item_field = field({ fieldname: "item", label: __("Item"), fieldtype: "Link", options: "Item" });

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
		this.cards_area = $(`<div class="pa-cards"></div>`).appendTo(this.page.body);
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
			method: "metta.stock.page.purchase_analysis.purchase_analysis.get_data",
			args: {
				from_date,
				to_date,
				supplier: this.supplier_field.get_value(),
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
			"Order Date",
			"Purchase Order",
			"Supplier",
			"Item",
			"Item Name",
			"Qty Ordered",
			"Qty Received",
			"% Received",
			"Rate",
			"Ordered Amount",
			"Billed Amount",
			"Billing Status",
		].map((c) => __(c));

		const data = rows.map((row) => {
			const pct_received = flt(row.qty_ordered) ? (100 * flt(row.qty_received)) / flt(row.qty_ordered) : 0;
			return [
				format_ddmmyy(row.order_date),
				row.purchase_order || "",
				row.supplier || "",
				row.item || "",
				row.item_name || "",
				flt(row.qty_ordered),
				flt(row.qty_received),
				`${pct_received.toFixed(1)}%`,
				format_currency(row.rate),
				format_currency(row.ordered_amount),
				format_currency(row.billed_amount),
				__(billing_status(row.ordered_amount, row.billed_amount)),
			];
		});

		const total_qty_ordered = rows.reduce((sum, row) => sum + flt(row.qty_ordered), 0);
		const total_qty_received = rows.reduce((sum, row) => sum + flt(row.qty_received), 0);
		const total_pct = total_qty_ordered ? (100 * total_qty_received) / total_qty_ordered : 0;
		const total_ordered = rows.reduce((sum, row) => sum + flt(row.ordered_amount), 0);
		const total_billed = rows.reduce((sum, row) => sum + flt(row.billed_amount), 0);
		data.push([
			__("Total"),
			"",
			"",
			"",
			"",
			total_qty_ordered,
			total_qty_received,
			`${total_pct.toFixed(1)}%`,
			"",
			format_currency(total_ordered),
			format_currency(total_billed),
			"",
		]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];
		if (this.supplier_field.get_value()) filter_bits.push(`${__("Supplier")}: ${this.supplier_field.get_value()}`);
		if (this.item_field.get_value()) filter_bits.push(`${__("Item")}: ${this.item_field.get_value()}`);

		return {
			title: __("Purchase Analysis"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Purchase_Analysis",
		};
	}

	render(rows) {
		this.last_rows = rows;
		const total_ordered = rows.reduce((sum, row) => sum + flt(row.ordered_amount), 0);
		const total_received_value = rows.reduce((sum, row) => sum + flt(row.qty_received) * flt(row.rate), 0);
		const total_billed = rows.reduce((sum, row) => sum + flt(row.billed_amount), 0);
		const pending_value = rows.reduce(
			(sum, row) => sum + (flt(row.qty_ordered) - flt(row.qty_received)) * flt(row.rate),
			0
		);

		this.cards_area.html(`
			<div class="pa-card">
				<div class="pa-card-label">${__("Total Ordered Amount")}</div>
				<div class="pa-card-value">${format_currency(total_ordered)}</div>
			</div>
			<div class="pa-card">
				<div class="pa-card-label">${__("Total Received Value")}</div>
				<div class="pa-card-value">${format_currency(total_received_value)}</div>
			</div>
			<div class="pa-card">
				<div class="pa-card-label">${__("Total Billed Amount")}</div>
				<div class="pa-card-value">${format_currency(total_billed)}</div>
			</div>
			<div class="pa-card ${pending_value > 0 ? "pending" : ""}">
				<div class="pa-card-label">${__("Pending Receipt Value")}</div>
				<div class="pa-card-value">${format_currency(pending_value)}</div>
			</div>
		`);

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No Purchase Orders found for this range.")}</p>`);
			return;
		}

		const header = [
			"Order Date",
			"Purchase Order",
			"Supplier",
			"Item",
			"Item Name",
			"Qty Ordered",
			"Qty Received",
			"% Received",
			"Rate",
			"Ordered Amount",
			"Billed Amount",
			"Billing Status",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = rows
			.map((row) => {
				const pct_received = flt(row.qty_ordered) ? (100 * flt(row.qty_received)) / flt(row.qty_ordered) : 0;
				const status = billing_status(row.ordered_amount, row.billed_amount);
				const indicator = BILLING_STATUS_INDICATOR[status];
				return `
				<tr>
					<td>${format_ddmmyy(row.order_date)}</td>
					<td><a href="/app/purchase-order/${row.purchase_order}">${row.purchase_order}</a></td>
					<td>${frappe.utils.escape_html(row.supplier || "")}</td>
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}</td>
					<td class="text-Ceneter">${flt(row.qty_ordered)}</td>
					<td class="text-Ceneter">${flt(row.qty_received)}</td>
					<td class="text-Ceneter">${pct_received.toFixed(1)}%</td>
					<td class="text-Ceneter">${format_currency(row.rate)}</td>
					<td class="text-Ceneter">${format_currency(row.ordered_amount)}</td>
					<td class="text-Ceneter">${format_currency(row.billed_amount)}</td>
					<td><span class="indicator-pill ${indicator}"><span>${__(status)}</span></span></td>
				</tr>`;
			})
			.join("");

		const total_qty_ordered = rows.reduce((sum, row) => sum + flt(row.qty_ordered), 0);
		const total_qty_received = rows.reduce((sum, row) => sum + flt(row.qty_received), 0);
		const total_pct = total_qty_ordered ? (100 * total_qty_received) / total_qty_ordered : 0;
		const total_row = `
			<tr class="pa-total">
				<td colspan="5">${__("Total")}</td>
				<td class="text-Ceneter">${total_qty_ordered}</td>
				<td class="text-Ceneter">${total_qty_received}</td>
				<td class="text-Ceneter">${total_pct.toFixed(1)}%</td>
				<td></td>
				<td class="text-Ceneter">${format_currency(total_ordered)}</td>
				<td class="text-Ceneter">${format_currency(total_billed)}</td>
				<td></td>
			</tr>`;

		this.table_area.html(`
			<table class="table table-hover pa-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);
	}
}
