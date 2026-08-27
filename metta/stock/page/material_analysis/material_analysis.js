frappe.pages["material-analysis"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Material Analysis"),
		single_column: true,
	});

	new MaterialAnalysis(page);
};

// Draft is left out on purpose - Stock Position only ever tracks indents
// that have moved past Draft (nothing's been requested/approved yet
// otherwise), so offering it here would always return zero rows.
const INDENT_STATUS_OPTIONS = ["", "Submitted", "Partially Issued", "Issued", "Cancelled"];

const INDENT_STATUS_INDICATOR = {
	Draft: "gray",
	Submitted: "blue",
	"Partially Issued": "orange",
	Issued: "green",
	Cancelled: "red",
};

function format_ddmmyy(date_str) {
	// Fixed dd/mm/yy display regardless of the logged-in user's System
	// Settings date format, same convention every other report page here uses.
	if (!date_str) return "";
	const d = new Date(date_str);
	if (isNaN(d)) return "";
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yy = String(d.getFullYear()).slice(-2);
	return `${dd}/${mm}/${yy}`;
}

class MaterialAnalysis {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("matan-page");
		this.make_section_title();
		this.make_tabs();
		this.make_material_query_tab();
		this.make_item_movement_tab();
		this.make_stock_position_tab();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		this.switch_tab("item_movement");
	}

	// The Export button lives once on the page toolbar (that's all
	// metta.report_export.add_buttons supports) and exports whichever tab is
	// currently active, not all three at once.
	get_export_data() {
		if (this.active_tab === "item_movement") return this.get_item_movement_export_data();
		if (this.active_tab === "stock_position") return this.get_stock_position_export_data();
		return null;
	}

	inject_styles() {
		if (document.getElementById("matan-styles")) return;
		$(`<style id="matan-styles">
			.matan-page .matan-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.matan-page .matan-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.matan-page .matan-tabs {
				display: flex;
				gap: 6px;
				margin-bottom: 18px;
				border-bottom: 1px solid var(--border-color);
			}
			.matan-page .matan-tab-btn {
				border: none;
				background: none;
				padding: 8px 16px;
				font-size: 13px;
				font-weight: 600;
				color: var(--text-muted);
				cursor: pointer;
				border-bottom: 2px solid transparent;
			}
			.matan-page .matan-tab-btn.active {
				color: #1a63c9;
				border-bottom: 2px solid #1a63c9;
			}
			.matan-page .matan-tab-body {
				display: none;
			}
			.matan-page .matan-tab-body.active {
				display: block;
			}
			.matan-page .matan-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.matan-page .matan-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.matan-page .matan-card .matan-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.matan-page .matan-card .matan-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.matan-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.matan-page table.matan-table {
				margin-bottom: 0;
			}
			.matan-page table.matan-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.matan-page table.matan-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.matan-page table.matan-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.matan-page table.matan-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.matan-page table.matan-table tr.matan-total td {
				background: #eaf3fc;
				color: #0b4a86;
				font-weight: 700;
				border-top: 2px solid #1b4f8c;
			}
			.matan-page .matan-not-moving {
				display: inline-block;
				margin-left: 6px;
				font-size: 10px;
				text-transform: uppercase;
				letter-spacing: 0.03em;
				color: #a3341f;
				background: #fdece7;
				border: 1px solid #f5c2b8;
				border-radius: 10px;
				padding: 1px 8px;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="matan-section-title">STOCK REPORTS</div>
			<div class="matan-section-subtitle">Material Analysis</div>
		`).appendTo(this.page.body);
	}

	make_tabs() {
		this.tabs_wrap = $(`<div class="matan-tabs"></div>`).appendTo(this.page.body);
		this.tab_buttons = {};

		const tab_defs = [
			["material_query", __("Material Query")],
			["item_movement", __("Item Movement Registration")],
			["stock_position", __("Stock Position")],
		];

		tab_defs.forEach(([key, label]) => {
			const btn = $(`<button class="matan-tab-btn">${label}</button>`)
				.appendTo(this.tabs_wrap)
				.on("click", () => this.switch_tab(key));
			this.tab_buttons[key] = btn;
		});

		this.tab_bodies = {
			material_query: $(`<div class="matan-tab-body"></div>`).appendTo(this.page.body),
			item_movement: $(`<div class="matan-tab-body"></div>`).appendTo(this.page.body),
			stock_position: $(`<div class="matan-tab-body"></div>`).appendTo(this.page.body),
		};
	}

	switch_tab(key) {
		this.active_tab = key;
		Object.keys(this.tab_bodies).forEach((k) => {
			this.tab_bodies[k].toggleClass("active", k === key);
			this.tab_buttons[k].toggleClass("active", k === key);
		});
	}

	make_field(parent_row, opts) {
		const wrap = $(`<div style="min-width: 180px;"></div>`).appendTo(parent_row);
		return frappe.ui.form.make_control({
			parent: wrap,
			df: { ...opts, fieldtype: opts.fieldtype || "Data" },
			render_input: true,
		});
	}

	make_quick_range_buttons(wrap, on_pick) {
		const row = $(`<div style="margin-bottom: 15px;"></div>`).appendTo(wrap);
		const btn = (label, fn) =>
			$(`<button class="btn btn-default btn-xs" style="margin-right: 6px;">${label}</button>`)
				.appendTo(row)
				.on("click", () => on_pick(fn()));

		btn(__("Today"), () => [frappe.datetime.get_today(), frappe.datetime.get_today()]);
		btn(__("This Week"), () => [frappe.datetime.week_start(), frappe.datetime.week_end()]);
		btn(__("This Month"), () => [frappe.datetime.month_start(), frappe.datetime.month_end()]);
	}

	// --- Material Query (placeholder, fields to be defined later) ---

	make_material_query_tab() {
		const body = this.tab_bodies.material_query;
		$(`<p class="text-muted">${__(
			"Material Query is not set up yet. Let me know the fields you want here and I'll build it."
		)}</p>`).appendTo(body);
	}

	// --- Item Movement Registration ---

	make_item_movement_tab() {
		const body = this.tab_bodies.item_movement;
		const filter_row = $(
			`<div class="flex" style="gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 15px;"></div>`
		).appendTo(body);

		this.im_from_date = this.make_field(filter_row, {
			fieldname: "from_date",
			label: __("From Date (dd/mm/yyyy)"),
			fieldtype: "Date",
			reqd: 1,
		});
		this.im_to_date = this.make_field(filter_row, {
			fieldname: "to_date",
			label: __("To Date (dd/mm/yyyy)"),
			fieldtype: "Date",
			reqd: 1,
		});
		this.im_warehouse = this.make_field(filter_row, {
			fieldname: "warehouse",
			label: __("Warehouse (Outlet)"),
			fieldtype: "Link",
			options: "Warehouse",
		});
		this.im_item = this.make_field(filter_row, { fieldname: "item", label: __("Item"), fieldtype: "Link", options: "Item" });

		const button_wrap = $(`<div></div>`).appendTo(filter_row);
		$(`<button class="btn btn-primary btn-sm">${__("Generate")}</button>`)
			.appendTo(button_wrap)
			.on("click", () => this.generate_item_movement());

		this.make_quick_range_buttons(body, ([from_date, to_date]) => {
			// set_value() is async (it goes through frappe.run_serially) -
			// calling Generate synchronously right after would read the
			// fields' old (still empty) value and wrongly show the "set both
			// dates" warning, even though the input already looks filled in.
			Promise.all([this.im_from_date.set_value(from_date), this.im_to_date.set_value(to_date)]).then(() =>
				this.generate_item_movement()
			);
		});

		this.im_cards_area = $(`<div class="matan-cards"></div>`).appendTo(body);
		this.im_table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(body);
		this.im_table_area.html(`<p class="text-muted">${__("Set a From Date and To Date, then click Generate.")}</p>`);
	}

	generate_item_movement() {
		const from_date = this.im_from_date.get_value();
		const to_date = this.im_to_date.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set both From Date and To Date."));
			return;
		}

		frappe.call({
			method: "metta.stock.page.material_analysis.material_analysis.get_item_movement_data",
			args: {
				from_date,
				to_date,
				warehouse: this.im_warehouse.get_value(),
				item: this.im_item.get_value(),
			},
			freeze: true,
			callback: (r) => this.render_item_movement(r.message || []),
		});
	}

	render_item_movement(rows) {
		this.im_rows = rows;

		const total_available = rows.reduce((sum, row) => sum + flt(row.available_qty), 0);
		const total_issued = rows.reduce((sum, row) => sum + flt(row.issued_qty), 0);
		const total_remaining = rows.reduce((sum, row) => sum + flt(row.remaining_qty), 0);

		this.im_cards_area.html(`
			<div class="matan-card">
				<div class="matan-card-label">${__("Items Listed")}</div>
				<div class="matan-card-value">${rows.length}</div>
			</div>
			<div class="matan-card">
				<div class="matan-card-label">${__("Total Available")}</div>
				<div class="matan-card-value">${total_available}</div>
			</div>
			<div class="matan-card">
				<div class="matan-card-label">${__("Total Issued")}</div>
				<div class="matan-card-value">${total_issued}</div>
			</div>
			<div class="matan-card">
				<div class="matan-card-label">${__("Total Remaining")}</div>
				<div class="matan-card-value">${total_remaining}</div>
			</div>
		`);

		if (!rows.length) {
			this.im_table_area.html(`<p class="text-muted">${__("No stock movement found for this range.")}</p>`);
			return;
		}

		const header = ["Item", "Item Name", "Item Type", "Warehouse", "Available", "Issued", "Remaining"]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = rows
			.map(
				(row) => `
				<tr>
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}
						${row.not_moving ? `<span class="matan-not-moving">${__("Not Moving")}</span>` : ""}
					</td>
					<td>${frappe.utils.escape_html(row.item_type || "")}</td>
					<td>${frappe.utils.escape_html(row.warehouse || "")}</td>
					<td class="text-center">${flt(row.available_qty)}</td>
					<td class="text-center">${flt(row.issued_qty)}</td>
					<td class="text-center">${flt(row.remaining_qty)}</td>
				</tr>`
			)
			.join("");

		const total_row = `
			<tr class="matan-total">
				<td colspan="4">${__("Total")}</td>
				<td class="text-center">${total_available}</td>
				<td class="text-center">${total_issued}</td>
				<td class="text-center">${total_remaining}</td>
			</tr>`;

		this.im_table_area.html(`
			<table class="table table-hover matan-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);
	}

	get_item_movement_export_data() {
		if (!this.im_rows) return null;
		const rows = this.im_rows;

		const columns = ["Item", "Item Name", "Item Type", "Warehouse", "Available", "Issued", "Remaining", "Not Moving"].map(
			(c) => __(c)
		);
		const data = rows.map((row) => [
			row.item || "",
			row.item_name || "",
			row.item_type || "",
			row.warehouse || "",
			flt(row.available_qty),
			flt(row.issued_qty),
			flt(row.remaining_qty),
			row.not_moving ? __("Yes") : "",
		]);

		const total_available = rows.reduce((sum, row) => sum + flt(row.available_qty), 0);
		const total_issued = rows.reduce((sum, row) => sum + flt(row.issued_qty), 0);
		const total_remaining = rows.reduce((sum, row) => sum + flt(row.remaining_qty), 0);
		data.push([__("Total"), "", "", "", total_available, total_issued, total_remaining, ""]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.im_from_date.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.im_to_date.get_value())}`,
		];
		if (this.im_warehouse.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.im_warehouse.get_value()}`);
		if (this.im_item.get_value()) filter_bits.push(`${__("Item")}: ${this.im_item.get_value()}`);

		return {
			title: __("Item Movement Registration"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Item_Movement_Registration",
		};
	}

	// --- Stock Position ---

	make_stock_position_tab() {
		const body = this.tab_bodies.stock_position;
		const filter_row = $(
			`<div class="flex" style="gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 15px;"></div>`
		).appendTo(body);

		this.sp_from_date = this.make_field(filter_row, {
			fieldname: "from_date",
			label: __("From Date (dd/mm/yyyy)"),
			fieldtype: "Date",
			reqd: 1,
		});
		this.sp_to_date = this.make_field(filter_row, {
			fieldname: "to_date",
			label: __("To Date (dd/mm/yyyy)"),
			fieldtype: "Date",
			reqd: 1,
		});
		this.sp_warehouse = this.make_field(filter_row, {
			fieldname: "warehouse",
			label: __("Warehouse (Outlet)"),
			fieldtype: "Link",
			options: "Warehouse",
		});
		this.sp_item = this.make_field(filter_row, { fieldname: "item", label: __("Item"), fieldtype: "Link", options: "Item" });
		this.sp_status = this.make_field(filter_row, {
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: INDENT_STATUS_OPTIONS.join("\n"),
		});

		const button_wrap = $(`<div></div>`).appendTo(filter_row);
		$(`<button class="btn btn-primary btn-sm">${__("Generate")}</button>`)
			.appendTo(button_wrap)
			.on("click", () => this.generate_stock_position());

		this.make_quick_range_buttons(body, ([from_date, to_date]) => {
			Promise.all([this.sp_from_date.set_value(from_date), this.sp_to_date.set_value(to_date)]).then(() =>
				this.generate_stock_position()
			);
		});

		this.sp_cards_area = $(`<div class="matan-cards"></div>`).appendTo(body);
		this.sp_table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(body);
		this.sp_table_area.html(`<p class="text-muted">${__("Set a From Date and To Date, then click Generate.")}</p>`);
	}

	generate_stock_position() {
		const from_date = this.sp_from_date.get_value();
		const to_date = this.sp_to_date.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set both From Date and To Date."));
			return;
		}

		frappe.call({
			method: "metta.stock.page.material_analysis.material_analysis.get_stock_position_data",
			args: {
				from_date,
				to_date,
				warehouse: this.sp_warehouse.get_value(),
				item: this.sp_item.get_value(),
				status: this.sp_status.get_value(),
			},
			freeze: true,
			callback: (r) => this.render_stock_position(r.message || []),
		});
	}

	render_stock_position(rows) {
		this.sp_rows = rows;

		const outlet_count = new Set(rows.map((r) => r.warehouse)).size;
		const total_requested = rows.reduce((sum, row) => sum + flt(row.qty_requested), 0);
		const total_issued = rows.reduce((sum, row) => sum + flt(row.qty_issued), 0);
		const total_pending = rows.reduce((sum, row) => sum + flt(row.qty_pending), 0);

		this.sp_cards_area.html(`
			<div class="matan-card">
				<div class="matan-card-label">${__("Outlets")}</div>
				<div class="matan-card-value">${outlet_count}</div>
			</div>
			<div class="matan-card">
				<div class="matan-card-label">${__("Total Requested")}</div>
				<div class="matan-card-value">${total_requested}</div>
			</div>
			<div class="matan-card">
				<div class="matan-card-label">${__("Total Issued")}</div>
				<div class="matan-card-value">${total_issued}</div>
			</div>
			<div class="matan-card">
				<div class="matan-card-label">${__("Total Pending")}</div>
				<div class="matan-card-value">${total_pending}</div>
			</div>
		`);

		if (!rows.length) {
			this.sp_table_area.html(`<p class="text-muted">${__("No Stock Indents found for this range.")}</p>`);
			return;
		}

		const header = [
			"Warehouse",
			"Stock Indent",
			"Item",
			"Item Name",
			"Qty Requested",
			"Qty Issued",
			"Qty Pending",
			"Issued By",
			"Issue Date",
			"Status",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = rows
			.map((row) => {
				const indicator = INDENT_STATUS_INDICATOR[row.status] || "gray";
				return `
				<tr>
					<td>${frappe.utils.escape_html(row.warehouse || "")}</td>
					<td><a href="/app/stock-indent/${row.stock_indent}">${row.stock_indent}</a></td>
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}</td>
					<td class="text-center">${flt(row.qty_requested)}</td>
					<td class="text-center">${flt(row.qty_issued)}</td>
					<td class="text-center">${flt(row.qty_pending)}</td>
					<td>${frappe.utils.escape_html(row.issued_by || "")}</td>
					<td>${format_ddmmyy(row.issue_date)}</td>
					<td><span class="indicator-pill ${indicator}"><span>${frappe.utils.escape_html(row.status || "")}</span></span></td>
				</tr>`;
			})
			.join("");

		const total_row = `
			<tr class="matan-total">
				<td colspan="4">${__("Total")}</td>
				<td class="text-center">${total_requested}</td>
				<td class="text-center">${total_issued}</td>
				<td class="text-center">${total_pending}</td>
				<td colspan="3"></td>
			</tr>`;

		this.sp_table_area.html(`
			<table class="table table-hover matan-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}${total_row}</tbody>
			</table>
		`);
	}

	get_stock_position_export_data() {
		if (!this.sp_rows) return null;
		const rows = this.sp_rows;

		const columns = [
			"Warehouse",
			"Stock Indent",
			"Item",
			"Item Name",
			"Qty Requested",
			"Qty Issued",
			"Qty Pending",
			"Issued By",
			"Issue Date",
			"Status",
		].map((c) => __(c));

		const data = rows.map((row) => [
			row.warehouse || "",
			row.stock_indent || "",
			row.item || "",
			row.item_name || "",
			flt(row.qty_requested),
			flt(row.qty_issued),
			flt(row.qty_pending),
			row.issued_by || "",
			format_ddmmyy(row.issue_date),
			row.status || "",
		]);

		const total_requested = rows.reduce((sum, row) => sum + flt(row.qty_requested), 0);
		const total_issued = rows.reduce((sum, row) => sum + flt(row.qty_issued), 0);
		const total_pending = rows.reduce((sum, row) => sum + flt(row.qty_pending), 0);
		data.push([__("Total"), "", "", "", total_requested, total_issued, total_pending, "", "", ""]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.sp_from_date.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.sp_to_date.get_value())}`,
		];
		if (this.sp_warehouse.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.sp_warehouse.get_value()}`);
		if (this.sp_item.get_value()) filter_bits.push(`${__("Item")}: ${this.sp_item.get_value()}`);
		if (this.sp_status.get_value()) filter_bits.push(`${__("Status")}: ${this.sp_status.get_value()}`);

		return {
			title: __("Stock Position"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Stock_Position",
		};
	}
}
