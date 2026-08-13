frappe.pages["supplier-wise-purchase"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Supplier Wise Purchase"),
		single_column: true,
	});

	new SupplierWisePurchase(page);
};

const PO_STATUS_OPTIONS = [
	"",
	"Pending Approval",
	"Approved",
	"Rejected",
	"Sent to Dealer",
	"Partially Received",
	"Received",
	"Closed",
	"Cancelled",
];

const BILLING_STATUS_INDICATOR = {
	"Not Billed": "red",
	"Partially Billed": "orange",
	"Fully Billed": "green",
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

function billing_status(ordered_amount, billed_amount) {
	if (flt(billed_amount) <= 0) return "Not Billed";
	if (flt(billed_amount) >= flt(ordered_amount)) return "Fully Billed";
	return "Partially Billed";
}

function slugify(text) {
	return (text || "").replace(/[^A-Za-z0-9]+/g, "-");
}

class SupplierWisePurchase {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("swp-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// Unlike the other reports, this one loads every Purchase Order
		// across every supplier right away - narrowing down to one supplier
		// is something staff opt into via the filter, not a prerequisite for
		// seeing anything at all.
		this.generate();
	}

	inject_styles() {
		if (document.getElementById("swp-styles")) return;
		$(`<style id="swp-styles">
			.swp-page .swp-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.swp-page .swp-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.swp-page .swp-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.swp-page .swp-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.swp-page .swp-card.pending {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.swp-page .swp-card .swp-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.swp-page .swp-card.pending .swp-card-label {
				color: #a3341f;
			}
			.swp-page .swp-card .swp-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.swp-page .swp-card.pending .swp-card-value {
				color: #a3341f;
			}
			.swp-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.swp-page table.swp-table {
				margin-bottom: 0;
			}
			.swp-page table.swp-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.swp-page table.swp-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.swp-page table.swp-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.swp-page table.swp-table tr.swp-group-row {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.swp-page table.swp-table tr.swp-group-row:hover {
				background: var(--awesomplete-hover-bg, rgba(84, 141, 244, 0.08));
			}
			.swp-page table.swp-table td.swp-toggle {
				cursor: pointer;
				text-align: center;
				color: #1b4f8c;
				font-size: 11px;
			}
			.swp-page table.swp-table tr.swp-po-row td {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.05));
				font-size: 12px;
			}
			.swp-page table.swp-table tr.swp-po-row td:nth-child(2) {
				padding-left: 26px;
			}
			.swp-page table.swp-table tr.swp-detail-row td {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.08));
				font-size: 12px;
			}
			.swp-page table.swp-table tr.swp-detail-row td:nth-child(4) {
				padding-left: 40px;
			}
			.swp-page table.swp-table tr.swp-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="swp-section-title">PURCHASE ORDERS</div>
			<div class="swp-section-subtitle">Supplier Wise Purchase</div>
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
		});
		this.to_date_field = field({
			fieldname: "to_date",
			label: __("To Date (dd/mm/yyyy)"),
			fieldtype: "Date",
		});
		this.supplier_field = field({ fieldname: "supplier", label: __("Supplier"), fieldtype: "Link", options: "Supplier" });
		this.status_field = field({
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: PO_STATUS_OPTIONS.join("\n"),
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
		this.cards_area = $(`<div class="swp-cards"></div>`).appendTo(this.page.body);
		this.table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(this.page.body);
	}

	generate() {
		frappe.call({
			method: "metta.purchase_order.page.supplier_wise_purchase.supplier_wise_purchase.get_data",
			args: {
				from_date: this.from_date_field.get_value(),
				to_date: this.to_date_field.get_value(),
				supplier: this.supplier_field.get_value(),
				status: this.status_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message || []),
		});
	}

	group_by_supplier(rows) {
		// Two levels of grouping: Supplier -> Purchase Order -> item lines.
		// Expanding a supplier reveals one row per PO (not every item line at
		// once); expanding a PO then reveals its own items. Same "everything
		// stays in one flat table" idea as Outletwise Stock Transfer Summary,
		// just nested one level deeper, so a page export/copy-paste still
		// gets every row regardless of what's currently expanded on screen.
		const suppliers = new Map();
		rows.forEach((row) => {
			if (!suppliers.has(row.supplier)) {
				suppliers.set(row.supplier, {
					supplier: row.supplier,
					pos: new Map(),
					total_qty_ordered: 0,
					total_qty_received: 0,
					total_ordered_amount: 0,
					total_billed_amount: 0,
				});
			}
			const s = suppliers.get(row.supplier);
			s.total_qty_ordered += flt(row.qty_ordered);
			s.total_qty_received += flt(row.qty_received);
			s.total_ordered_amount += flt(row.ordered_amount);
			s.total_billed_amount += flt(row.billed_amount);

			if (!s.pos.has(row.purchase_order)) {
				s.pos.set(row.purchase_order, {
					purchase_order: row.purchase_order,
					order_date: row.order_date,
					total_qty_ordered: 0,
					total_qty_received: 0,
					total_ordered_amount: 0,
					total_billed_amount: 0,
					items: [],
				});
			}
			const po = s.pos.get(row.purchase_order);
			po.total_qty_ordered += flt(row.qty_ordered);
			po.total_qty_received += flt(row.qty_received);
			po.total_ordered_amount += flt(row.ordered_amount);
			po.total_billed_amount += flt(row.billed_amount);
			po.items.push(row);
		});
		return Array.from(suppliers.values());
	}

	render(rows) {
		this.all_rows = rows;
		const groups = this.group_by_supplier(rows);

		const total_suppliers = groups.length;
		const total_ordered = groups.reduce((sum, g) => sum + g.total_ordered_amount, 0);
		const total_billed = groups.reduce((sum, g) => sum + g.total_billed_amount, 0);
		const total_pending = total_ordered - total_billed;

		this.cards_area.html(`
			<div class="swp-card">
				<div class="swp-card-label">${__("Total Suppliers")}</div>
				<div class="swp-card-value">${total_suppliers}</div>
			</div>
			<div class="swp-card">
				<div class="swp-card-label">${__("Total Ordered Amount")}</div>
				<div class="swp-card-value">${format_currency(total_ordered)}</div>
			</div>
			<div class="swp-card">
				<div class="swp-card-label">${__("Total Billed Amount")}</div>
				<div class="swp-card-value">${format_currency(total_billed)}</div>
			</div>
			<div class="swp-card ${total_pending > 0 ? "pending" : ""}">
				<div class="swp-card-label">${__("Total Pending Amount")}</div>
				<div class="swp-card-value">${format_currency(total_pending)}</div>
			</div>
		`);

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No Purchase Orders found for this range.")}</p>`);
			return;
		}

		const header = [
			"",
			"Purchase Order",
			"Order Date",
			"Item",
			"Item Name",
			"Qty Ordered",
			"Qty Received",
			"% Received",
			"Rate",
			"Amount",
			"Billed Amount",
			"Status",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = groups
			.map((g) => {
				const supplier_slug = `sup-${slugify(g.supplier)}`;
				const po_count = g.pos.size;
				const pct_received = g.total_qty_ordered ? (100 * g.total_qty_received) / g.total_qty_ordered : 0;
				const status = billing_status(g.total_ordered_amount, g.total_billed_amount);
				const indicator = BILLING_STATUS_INDICATOR[status];

				const group_row = `
				<tr class="swp-group-row">
					<td class="swp-toggle" data-target="${supplier_slug}">▶</td>
					<td colspan="4">
						<strong>${frappe.utils.escape_html(g.supplier || "")}</strong>
						&nbsp; <span class="indicator-pill gray"><span>${po_count} ${po_count === 1 ? __("PO") : __("POs")}</span></span>
					</td>
					<td class="text-center">${g.total_qty_ordered}</td>
					<td class="text-center">${g.total_qty_received}</td>
					<td class="text-center">${pct_received.toFixed(1)}%</td>
					<td></td>
					<td class="text-center">${format_currency(g.total_ordered_amount)}</td>
					<td class="text-center">${format_currency(g.total_billed_amount)}</td>
					<td><span class="indicator-pill ${indicator}"><span>${__(status)}</span></span></td>
				</tr>`;

				// Expanding a supplier reveals one row per PO, not every item
				// line at once - clicking a PO's own toggle is what drills
				// down to its items, matching the two-click flow being asked
				// for (supplier -> POs -> items under one PO).
				const po_rows = Array.from(g.pos.values())
					.map((po) => {
						const po_slug = `po-${slugify(po.purchase_order)}`;
						const po_pct = po.total_qty_ordered ? (100 * po.total_qty_received) / po.total_qty_ordered : 0;
						const po_status = billing_status(po.total_ordered_amount, po.total_billed_amount);
						const po_indicator = BILLING_STATUS_INDICATOR[po_status];
						const item_count = po.items.length;

						const po_row = `
						<tr class="swp-po-row" data-parent="${supplier_slug}" style="display: none;">
							<td class="swp-toggle" data-target="${po_slug}">▶</td>
							<td><a href="/app/purchase-order/${po.purchase_order}">${po.purchase_order}</a></td>
							<td>${format_ddmmyy(po.order_date)}</td>
							<td colspan="2">
								<span class="indicator-pill gray"><span>${item_count} ${item_count === 1 ? __("item") : __("items")}</span></span>
							</td>
							<td class="text-center">${po.total_qty_ordered}</td>
							<td class="text-center">${po.total_qty_received}</td>
							<td class="text-center">${po_pct.toFixed(1)}%</td>
							<td></td>
							<td class="text-center">${format_currency(po.total_ordered_amount)}</td>
							<td class="text-center">${format_currency(po.total_billed_amount)}</td>
							<td><span class="indicator-pill ${po_indicator}"><span>${__(po_status)}</span></span></td>
						</tr>`;

						const item_rows = po.items
							.map((row) => {
								const item_pct = flt(row.qty_ordered) ? (100 * flt(row.qty_received)) / flt(row.qty_ordered) : 0;
								const item_status = billing_status(row.ordered_amount, row.billed_amount);
								const item_indicator = BILLING_STATUS_INDICATOR[item_status];
								return `
								<tr class="swp-detail-row" data-parent="${po_slug}" style="display: none;">
									<td></td>
									<td></td>
									<td></td>
									<td>${frappe.utils.escape_html(row.item || "")}</td>
									<td>${frappe.utils.escape_html(row.item_name || "")}</td>
									<td class="text-center">${flt(row.qty_ordered)}</td>
									<td class="text-center">${flt(row.qty_received)}</td>
									<td class="text-center">${item_pct.toFixed(1)}%</td>
									<td class="text-center">${format_currency(row.rate)}</td>
									<td class="text-center">${format_currency(row.ordered_amount)}</td>
									<td class="text-center">${format_currency(row.billed_amount)}</td>
									<td><span class="indicator-pill ${item_indicator}"><span>${__(item_status)}</span></span></td>
								</tr>`;
							})
							.join("");

						return po_row + item_rows;
					})
					.join("");

				return group_row + po_rows;
			})
			.join("");

		const total_qty_ordered = rows.reduce((sum, row) => sum + flt(row.qty_ordered), 0);
		const total_qty_received = rows.reduce((sum, row) => sum + flt(row.qty_received), 0);
		const total_pct = total_qty_ordered ? (100 * total_qty_received) / total_qty_ordered : 0;
		const total_row = `
			<tr class="swp-total">
				<td colspan="5">${__("Total")}</td>
				<td class="text-center">${total_qty_ordered}</td>
				<td class="text-center">${total_qty_received}</td>
				<td class="text-center">${total_pct.toFixed(1)}%</td>
				<td></td>
				<td class="text-center">${format_currency(total_ordered)}</td>
				<td class="text-center">${format_currency(total_billed)}</td>
				<td></td>
			</tr>`;

		this.table_area.html(`
			<table class="table table-hover swp-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);

		// One handler covers both nesting levels (supplier -> PO, PO -> items)
		// since every toggle uses the same data-target/data-parent wiring.
		// Collapsing a level has to cascade down explicitly - hidden rows are
		// siblings in one flat <tbody>, not actual DOM descendants of the row
		// that toggled them, so a hidden PO row won't auto-hide its own item
		// rows unless this walks down and hides them too.
		this.table_area.off("click", ".swp-toggle").on("click", ".swp-toggle", (e) => {
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
			const child_target = $(el).find(".swp-toggle").data("target");
			if (!child_target) return;
			this.table_area.find(`.swp-toggle[data-target="${child_target}"]`).text("▶");
			this.collapse_descendants(child_target);
		});
	}

	get_export_data() {
		if (!this.all_rows) return null;
		const rows = this.all_rows;

		// Flattened one row per supplier-item pairing, rather than the
		// group/detail split the on-screen table uses - a spreadsheet or PDF
		// export doesn't have a toggle arrow, so every item needs its own
		// visible line instead of being hidden behind one.
		const columns = [
			"Supplier",
			"Purchase Order",
			"Order Date",
			"Item",
			"Item Name",
			"Qty Ordered",
			"Qty Received",
			"% Received",
			"Rate",
			"Amount",
			"Billed Amount",
			"Status",
		].map((c) => __(c));

		const data = rows.map((row) => {
			const pct_received = flt(row.qty_ordered) ? (100 * flt(row.qty_received)) / flt(row.qty_ordered) : 0;
			return [
				row.supplier || "",
				row.purchase_order || "",
				format_ddmmyy(row.order_date),
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

		const filter_bits = [];
		if (this.from_date_field.get_value()) filter_bits.push(`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`);
		if (this.to_date_field.get_value()) filter_bits.push(`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`);
		if (this.supplier_field.get_value()) filter_bits.push(`${__("Supplier")}: ${this.supplier_field.get_value()}`);
		if (this.status_field.get_value()) filter_bits.push(`${__("Status")}: ${this.status_field.get_value()}`);

		return {
			title: __("Supplier Wise Purchase"),
			subtitle: filter_bits.length ? filter_bits.join("   |   ") : __("All Purchase Orders"),
			columns,
			rows: data,
			filename: "Supplier_Wise_Purchase",
		};
	}
}
