frappe.pages["purchase-return-summary"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Purchase Return Summary"),
		single_column: true,
	});

	new PurchaseReturnSummary(page);
};

const RETURN_STATUS_OPTIONS = ["", "Submitted", "Credit Received", "Replacement Pending", "Replacement Received", "Cancelled"];
const RETURN_REASON_OPTIONS = ["", "Damaged", "Expired", "Short Expiry", "Excess", "Recall"];

const RETURN_STATUS_INDICATOR = {
	Submitted: "blue",
	"Credit Received": "green",
	"Replacement Pending": "orange",
	"Replacement Received": "green",
	Cancelled: "red",
};

// A return is still "open" (nothing settled yet) in these two states -
// used for the Pending Credit card, and to decide which rows to sum.
const OPEN_STATUSES = ["Submitted", "Replacement Pending"];

function format_ddmmyy(date_str) {
	if (!date_str) return "";
	const d = new Date(date_str);
	if (isNaN(d)) return "";
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yy = String(d.getFullYear()).slice(-2);
	return `${dd}/${mm}/${yy}`;
}

function slugify(text) {
	return (text || "").replace(/[^A-Za-z0-9]+/g, "-");
}

class PurchaseReturnSummary {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("prs-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
	}

	inject_styles() {
		if (document.getElementById("prs-styles")) return;
		$(`<style id="prs-styles">
			.prs-page .prs-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.prs-page .prs-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.prs-page .prs-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.prs-page .prs-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.prs-page .prs-card.pending {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.prs-page .prs-card .prs-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.prs-page .prs-card.pending .prs-card-label {
				color: #a3341f;
			}
			.prs-page .prs-card .prs-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.prs-page .prs-card.pending .prs-card-value {
				color: #a3341f;
			}
			.prs-page .prs-reason-title {
				font-weight: 700;
				font-size: 12px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				margin: 4px 0 8px;
			}
			.prs-page .prs-reason-row {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 18px;
			}
			.prs-page .prs-reason-chip {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				padding: 8px 14px;
				font-size: 12px;
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.prs-page .prs-reason-chip strong {
				color: #0b4a86;
			}
			.prs-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.prs-page table.prs-table {
				margin-bottom: 0;
			}
			.prs-page table.prs-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.prs-page table.prs-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.prs-page table.prs-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.prs-page table.prs-table tr.prs-group-row {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.prs-page table.prs-table tr.prs-group-row:hover {
				background: var(--awesomplete-hover-bg, rgba(84, 141, 244, 0.08));
			}
			.prs-page table.prs-table td.prs-toggle {
				cursor: pointer;
				text-align: center;
				color: #1b4f8c;
				font-size: 11px;
			}
			.prs-page table.prs-table tr.prs-detail-row td {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.06));
				font-size: 12px;
				color: var(--text-muted);
			}
			.prs-page table.prs-table tr.prs-detail-row td.prs-detail-indent {
				padding-left: 32px;
				font-weight: 600;
				color: var(--text-color);
			}
			.prs-page table.prs-table tr.prs-detail-header td {
				background: #dbe7f3;
				color: #0b4a86;
				font-weight: 700;
				text-transform: uppercase;
				font-size: 10px;
				letter-spacing: 0.04em;
			}
			.prs-page table.prs-table tr.prs-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="prs-section-title">PURCHASE RETURNS</div>
			<div class="prs-section-subtitle">Purchase Return Summary</div>
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
			options: RETURN_STATUS_OPTIONS.join("\n"),
		});
		this.reason_field = field({
			fieldname: "return_reason",
			label: __("Return Reason"),
			fieldtype: "Select",
			options: RETURN_REASON_OPTIONS.join("\n"),
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

		btn(__("Today"), () => this.set_range_today());
		btn(__("This Week"), () => this.set_range(frappe.datetime.week_start(), frappe.datetime.week_end()));
		btn(__("This Month"), () => this.set_range(frappe.datetime.month_start(), frappe.datetime.month_end()));
	}

	set_range_today() {
		const today = frappe.datetime.get_today();
		return this.set_range(today, today);
	}

	set_range(from_date, to_date) {
		// set_value() is async (goes through frappe.run_serially) - Generate
		// must wait on this or it reads the fields' old (still empty) value
		// and wrongly warns to set both dates.
		return Promise.all([this.from_date_field.set_value(from_date), this.to_date_field.set_value(to_date)]);
	}

	make_results_area() {
		this.cards_area = $(`<div class="prs-cards"></div>`).appendTo(this.page.body);
		this.reason_area = $(`<div></div>`).appendTo(this.page.body);
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
			method: "metta.purchase_order.page.purchase_return_summary.purchase_return_summary.get_data",
			args: {
				from_date,
				to_date,
				supplier: this.supplier_field.get_value(),
				warehouse: this.warehouse_field.get_value(),
				status: this.status_field.get_value(),
				return_reason: this.reason_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message || []),
		});
	}

	group_by_supplier(rows) {
		// Supplier -> Purchase Return -> item lines, same two-level drill-down
		// as Supplier Wise Purchase. total_credit_amount/status/etc are
		// header fields repeated on every item row from the SQL join, so
		// they're only read once per return here (not summed per item row).
		const suppliers = new Map();
		rows.forEach((row) => {
			if (!suppliers.has(row.supplier)) {
				suppliers.set(row.supplier, { supplier: row.supplier, returns: new Map() });
			}
			const s = suppliers.get(row.supplier);
			if (!s.returns.has(row.purchase_return)) {
				s.returns.set(row.purchase_return, {
					purchase_return: row.purchase_return,
					return_date_time: row.return_date_time,
					from_warehouse: row.from_warehouse,
					against_purchase_receipt: row.against_purchase_receipt,
					original_purchase_order: row.original_purchase_order,
					replacement_receipt: row.replacement_receipt,
					replacement_purchase_order: row.replacement_purchase_order,
					total_credit_amount: flt(row.total_credit_amount),
					status: row.status,
					total_qty_returned: 0,
					items: [],
				});
			}
			const ret = s.returns.get(row.purchase_return);
			ret.total_qty_returned += flt(row.qty_returned);
			ret.items.push(row);
		});
		return Array.from(suppliers.values());
	}

	render(rows) {
		this.all_rows = rows;
		const groups = this.group_by_supplier(rows);
		const all_returns = groups.flatMap((g) => Array.from(g.returns.values()));

		const total_returns = all_returns.length;
		const total_qty_returned = rows.reduce((sum, row) => sum + flt(row.qty_returned), 0);
		const total_credit_amount = all_returns.reduce((sum, ret) => sum + ret.total_credit_amount, 0);
		const pending_credit = all_returns
			.filter((ret) => OPEN_STATUSES.includes(ret.status))
			.reduce((sum, ret) => sum + ret.total_credit_amount, 0);

		this.cards_area.html(`
			<div class="prs-card">
				<div class="prs-card-label">${__("Total Returns")}</div>
				<div class="prs-card-value">${total_returns}</div>
			</div>
			<div class="prs-card">
				<div class="prs-card-label">${__("Total Qty Returned")}</div>
				<div class="prs-card-value">${total_qty_returned}</div>
			</div>
			<div class="prs-card">
				<div class="prs-card-label">${__("Total Credit Amount")}</div>
				<div class="prs-card-value">${format_currency(total_credit_amount)}</div>
			</div>
			<div class="prs-card ${pending_credit > 0 ? "pending" : ""}">
				<div class="prs-card-label">${__("Pending Credit")}</div>
				<div class="prs-card-value">${format_currency(pending_credit)}</div>
			</div>
		`);

		if (!rows.length) {
			this.reason_area.empty();
			this.table_area.html(`<p class="text-muted">${__("No Purchase Returns found for this range.")}</p>`);
			return;
		}

		this.render_reason_breakdown(rows);

		const header = [
			"",
			"Return Date",
			"Purchase Return",
			"Item",
			"Item Name",
			"Batch",
			"Qty Returned",
			"Reason",
			"Amount",
			"Status",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = groups
			.map((g) => {
				const supplier_slug = `sup-${slugify(g.supplier)}`;
				const returns = Array.from(g.returns.values());
				const supplier_total_credit = returns.reduce((sum, ret) => sum + ret.total_credit_amount, 0);
				const supplier_qty = returns.reduce((sum, ret) => sum + ret.total_qty_returned, 0);

				const group_row = `
				<tr class="prs-group-row">
					<td class="prs-toggle" data-target="${supplier_slug}">▶</td>
					<td colspan="4">
						<strong>${frappe.utils.escape_html(g.supplier || "")}</strong>
						&nbsp; <span class="indicator-pill gray"><span>${returns.length} ${returns.length === 1 ? __("return") : __("returns")}</span></span>
					</td>
					<td class="text-center">${supplier_qty}</td>
					<td></td>
					<td class="text-center">${format_currency(supplier_total_credit)}</td>
					<td></td>
				</tr>`;

				const return_rows = returns
					.map((ret) => {
						const ret_slug = `ret-${slugify(ret.purchase_return)}`;
						const indicator = RETURN_STATUS_INDICATOR[ret.status] || "gray";
						const item_count = ret.items.length;

						const trace_bits = [];
						if (ret.original_purchase_order)
							trace_bits.push(`${__("From PO")}: <a href="/app/purchase-order/${ret.original_purchase_order}">${ret.original_purchase_order}</a>`);
						if (ret.replacement_purchase_order)
							trace_bits.push(
								`${__("Replacement PO")}: <a href="/app/purchase-order/${ret.replacement_purchase_order}">${ret.replacement_purchase_order}</a>`
							);

						const return_row = `
						<tr class="prs-group-row" data-parent="${supplier_slug}" style="display: none;">
							<td class="prs-toggle" data-target="${ret_slug}">▶</td>
							<td>${format_ddmmyy(ret.return_date_time)}</td>
							<td><a href="/app/purchase-return/${ret.purchase_return}">${ret.purchase_return}</a></td>
							<td colspan="2">
								<span class="indicator-pill gray"><span>${item_count} ${item_count === 1 ? __("item") : __("items")}</span></span>
								${trace_bits.length ? `<div class="text-muted" style="font-size: 11px; margin-top: 2px;">${trace_bits.join(" &nbsp;|&nbsp; ")}</div>` : ""}
							</td>
							<td class="text-center">${ret.total_qty_returned}</td>
							<td></td>
							<td class="text-center">${format_currency(ret.total_credit_amount)}</td>
							<td><span class="indicator-pill ${indicator}"><span>${frappe.utils.escape_html(ret.status || "")}</span></span></td>
						</tr>`;

						const item_rows = ret.items
							.map(
								(row) => `
							<tr class="prs-detail-row" data-parent="${ret_slug}" style="display: none;">
								<td></td>
								<td></td>
								<td class="prs-detail-indent">${frappe.utils.escape_html(row.item || "")}</td>
								<td>${frappe.utils.escape_html(row.item_name || "")}</td>
								<td>${frappe.utils.escape_html(row.batch || "")}</td>
								<td class="text-center">${flt(row.qty_returned)}</td>
								<td>${frappe.utils.escape_html(row.return_reason || "")}</td>
								<td class="text-center">${format_currency(row.amount)}</td>
								<td></td>
							</tr>`
							)
							.join("");

						return return_row + item_rows;
					})
					.join("");

				return group_row + return_rows;
			})
			.join("");

		const total_row = `
			<tr class="prs-total">
				<td colspan="5">${__("Total")}</td>
				<td class="text-center">${total_qty_returned}</td>
				<td></td>
				<td class="text-center">${format_currency(total_credit_amount)}</td>
				<td></td>
			</tr>`;

		this.table_area.html(`
			<table class="table table-hover prs-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);

		this.table_area.off("click", ".prs-toggle").on("click", ".prs-toggle", (e) => {
			const $toggle = $(e.currentTarget);
			const target = $toggle.data("target");
			const is_open = $toggle.text() === "▼";

			if (is_open) {
				$toggle.text("▶");
				this.collapse_descendants(target);
			} else {
				$toggle.text("▼");
				this.table_area.find(`[data-parent="${target}"]`).show();
			}
		});
	}

	collapse_descendants(target) {
		const $children = this.table_area.find(`[data-parent="${target}"]`);
		$children.hide();
		$children.each((_, el) => {
			const child_target = $(el).find(".prs-toggle").data("target");
			if (!child_target) return;
			this.table_area.find(`.prs-toggle[data-target="${child_target}"]`).text("▶");
			this.collapse_descendants(child_target);
		});
	}

	render_reason_breakdown(rows) {
		const by_reason = new Map();
		rows.forEach((row) => {
			const reason = row.return_reason || __("Not Specified");
			if (!by_reason.has(reason)) by_reason.set(reason, { count: 0, amount: 0 });
			const r = by_reason.get(reason);
			r.count += 1;
			r.amount += flt(row.amount);
		});

		const chips = Array.from(by_reason.entries())
			.sort((a, b) => b[1].amount - a[1].amount)
			.map(
				([reason, r]) =>
					`<div class="prs-reason-chip"><strong>${frappe.utils.escape_html(reason)}</strong>: ${r.count} ${r.count === 1 ? __("line") : __("lines")}, ${format_currency(r.amount)}</div>`
			)
			.join("");

		this.reason_area.html(`
			<div class="prs-reason-title">${__("Return Reason Breakdown")}</div>
			<div class="prs-reason-row">${chips}</div>
		`);
	}

	get_export_data() {
		if (!this.all_rows) return null;
		const rows = this.all_rows;

		const columns = [
			"Supplier",
			"Purchase Return",
			"Return Date",
			"From Warehouse",
			"From PO",
			"Replacement PO",
			"Item",
			"Item Name",
			"Batch",
			"Qty Returned",
			"Reason",
			"Amount",
			"Status",
		].map((c) => __(c));

		const data = rows.map((row) => [
			row.supplier || "",
			row.purchase_return || "",
			format_ddmmyy(row.return_date_time),
			row.from_warehouse || "",
			row.original_purchase_order || "",
			row.replacement_purchase_order || "",
			row.item || "",
			row.item_name || "",
			row.batch || "",
			flt(row.qty_returned),
			row.return_reason || "",
			format_currency(row.amount),
			row.status || "",
		]);

		const total_qty_returned = rows.reduce((sum, row) => sum + flt(row.qty_returned), 0);
		const groups = this.group_by_supplier(rows);
		const all_returns = groups.flatMap((g) => Array.from(g.returns.values()));
		const total_credit_amount = all_returns.reduce((sum, ret) => sum + ret.total_credit_amount, 0);
		data.push([__("Total"), "", "", "", "", "", "", "", "", total_qty_returned, "", format_currency(total_credit_amount), ""]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];
		if (this.supplier_field.get_value()) filter_bits.push(`${__("Supplier")}: ${this.supplier_field.get_value()}`);
		if (this.warehouse_field.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.warehouse_field.get_value()}`);
		if (this.status_field.get_value()) filter_bits.push(`${__("Status")}: ${this.status_field.get_value()}`);
		if (this.reason_field.get_value()) filter_bits.push(`${__("Reason")}: ${this.reason_field.get_value()}`);

		return {
			title: __("Purchase Return Summary"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Purchase_Return_Summary",
		};
	}
}
