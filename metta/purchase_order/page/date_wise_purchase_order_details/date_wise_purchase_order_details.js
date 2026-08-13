frappe.pages["date-wise-purchase-order-details"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Date wise Purchase Order Details"),
		single_column: true,
	});

	new DateWisePurchaseOrderDetails(page);
};

const STATUS_INDICATOR = {
	"Pending Approval": "orange",
	Approved: "blue",
	Rejected: "red",
	"Sent to Dealer": "blue",
	"Partially Received": "yellow",
	Received: "green",
	Closed: "darkgrey",
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

class DateWisePurchaseOrderDetails {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("dwpod-page");
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
		// Injected here rather than a co-located .css file, so the styling is
		// guaranteed to load regardless of how this Page's assets get bundled.
		if (document.getElementById("dwpod-styles")) return;
		$(`<style id="dwpod-styles">
			.dwpod-page .dwpod-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.dwpod-page .dwpod-section-subtitle {
				color: #1a34c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #c91a1a;
				margin-bottom: 18px;
			}
			.dwpod-page .dwpod-summary {
				background: linear-gradient(0deg, #eaf3fc, #eaf3fc);
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 10px 16px;
				font-weight: 600;
				color: #0b4a86;
				margin-bottom: 16px;
			}
			.dwpod-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.dwpod-page table.dwpod-table {
				margin-bottom: 0;
			}
			.dwpod-page table.dwpod-table thead th {
				background: #431b8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.dwpod-page table.dwpod-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.dwpod-page table.dwpod-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.dwpod-page table.dwpod-table tbody tr:hover {
				background: var(--awesomplete-hover-bg, rgba(84, 141, 244, 0.08));
			}
			.dwpod-page table.dwpod-table td.text-right {
				font-variant-numeric: tabular-nums;
			}
			.dwpod-page table.dwpod-table td a {
				font-weight: 600;
			}
			/* Money columns get a warm tint, same idea as an "Actuals" column
			   on a budget report - draws the eye to the value figures. */
			.dwpod-page table.dwpod-table td.dwpod-money {
				background: #fdf1e8;
			}
			.dwpod-page table.dwpod-table td.dwpod-pct {
				color: #1a63c9;
				font-weight: 600;
			}
			.dwpod-page table.dwpod-table tr.dwpod-total td {
				background: #f4eafc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="dwpod-section-title">PURCHASE ORDERS</div>
			<div class="dwpod-section-subtitle">Date wise Purchase Order Details</div>
		`).appendTo(this.page.body);
	}

	make_filters() {
		const filter_row = $(`<div class="flex" style="gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 15px;"></div>`).appendTo(
			this.page.body
		);

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
		this.status_field = field({
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: [
				"",
				"Pending Approval",
				"Approved",
				"Rejected",
				"Sent to Dealer",
				"Partially Received",
				"Received",
				"Closed",
				"Cancelled",
			].join("\n"),
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
		this.summary_area = $(`<div class="dwpod-summary"></div>`).appendTo(this.page.body);
		this.table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(this.page.body);
		this.summary_area.html(__("Set a From Date and To Date, then click Generate."));
	}

	generate() {
		const from_date = this.from_date_field.get_value();
		const to_date = this.to_date_field.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set both From Date and To Date."));
			return;
		}

		frappe.call({
			method:
				"metta.purchase_order.page.date_wise_purchase_order_details.date_wise_purchase_order_details.get_data",
			args: {
				from_date,
				to_date,
				supplier: this.supplier_field.get_value(),
				status: this.status_field.get_value(),
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
			"Status",
			"Item",
			"Item Name",
			"Qty Ordered",
			"Qty Received",
			"% Received",
			"Rate",
			"Amount",
			"Expected Delivery",
		].map((c) => __(c));

		const data = rows.map((row) => {
			const pct_received = row.qty_ordered ? (100 * flt(row.qty_received)) / flt(row.qty_ordered) : 0;
			return [
				format_ddmmyy(row.order_date),
				row.purchase_order || "",
				row.supplier || "",
				row.status || "",
				row.item || "",
				row.item_name || "",
				flt(row.qty_ordered),
				flt(row.qty_received),
				`${pct_received.toFixed(1)}%`,
				format_currency(row.rate),
				format_currency(row.amount),
				format_ddmmyy(row.expected_delivery),
			];
		});

		const total_qty_ordered = rows.reduce((sum, row) => sum + flt(row.qty_ordered), 0);
		const total_qty_received = rows.reduce((sum, row) => sum + flt(row.qty_received), 0);
		const total_pct = total_qty_ordered ? (100 * total_qty_received) / total_qty_ordered : 0;
		const total_amount = rows.reduce((sum, row) => sum + flt(row.amount), 0);
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
			format_currency(total_amount),
			"",
		]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];
		if (this.supplier_field.get_value()) filter_bits.push(`${__("Supplier")}: ${this.supplier_field.get_value()}`);
		if (this.status_field.get_value()) filter_bits.push(`${__("Status")}: ${this.status_field.get_value()}`);

		return {
			title: __("Date wise Purchase Order Details"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Date_wise_Purchase_Order_Details",
		};
	}

	render(rows) {
		this.last_rows = rows;
		const total_amount = rows.reduce((sum, row) => sum + flt(row.amount), 0);
		this.summary_area.html(
			__("{0} item line(s) across {1} Purchase Order(s) - Total Amount: {2}", [
				rows.length,
				new Set(rows.map((r) => r.purchase_order)).size,
				format_currency(total_amount),
			])
		);

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No Purchase Orders found for this range.")}</p>`);
			return;
		}

		const header = [
			"Order Date",
			"Purchase Order",
			"Supplier",
			"Status",
			"Item",
			"Item Name",
			"Qty Ordered",
			"Qty Received",
			"% Received",
			"Rate",
			"Amount",
			"Expected Delivery",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = rows
			.map((row) => {
				const indicator = STATUS_INDICATOR[row.status] || "gray";
				const pct_received = row.qty_ordered ? (100 * flt(row.qty_received)) / flt(row.qty_ordered) : 0;
				return `
				<tr>
					<td>${format_ddmmyy(row.order_date)}</td>
					<td><a href="/app/purchase-order/${row.purchase_order}">${row.purchase_order}</a></td>
					<td>${frappe.utils.escape_html(row.supplier || "")}</td>
					<td><span class="indicator-pill ${indicator}"><span>${frappe.utils.escape_html(row.status || "")}</span></span></td>
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}</td>
					<td class="text-right">${flt(row.qty_ordered)}</td>
					<td class="text-right">${flt(row.qty_received)}</td>
					<td class="text-right dwpod-pct">${pct_received.toFixed(1)}%</td>
					<td class="text-right dwpod-money">${format_currency(row.rate)}</td>
					<td class="text-right dwpod-money">${format_currency(row.amount)}</td>
					<td>${format_ddmmyy(row.expected_delivery)}</td>
				</tr>`;
			})
			.join("");

		const total_qty_ordered = rows.reduce((sum, row) => sum + flt(row.qty_ordered), 0);
		const total_qty_received = rows.reduce((sum, row) => sum + flt(row.qty_received), 0);
		const total_pct = total_qty_ordered ? (100 * total_qty_received) / total_qty_ordered : 0;
		const total_row = `
			<tr class="dwpod-total">
				<td colspan="6">${__("Total")}</td>
				<td class="text-right">${total_qty_ordered}</td>
				<td class="text-right">${total_qty_received}</td>
				<td class="text-right">${total_pct.toFixed(1)}%</td>
				<td></td>
				<td class="text-right">${format_currency(total_amount)}</td>
				<td></td>
			</tr>`;

		this.table_area.html(`
			<table class="table table-hover dwpod-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);
	}
}
