frappe.pages["fsn-analysis"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("FSN Analysis"),
		single_column: true,
	});

	new MaterialAnalysis(page);
};

const ITEM_TYPE_OPTIONS = ["", "Medicine", "Service", "Consumable", "Asset"];

const MOVEMENT_STATUS_INDICATOR = {
	"Fast-Moving": "green",
	"Slow-Moving": "orange",
	"Non-Moving": "red",
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

class MaterialAnalysis {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("ma-page");
		this.make_section_title();
		this.make_filters();
		this.make_quick_range_buttons();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// Defaults to the last 30 days rather than staying blank - a
		// movement-frequency report is meaningless with no range at all
		// (every item would show "0 active days" for lack of anything to
		// measure), so it needs a real window to be useful right away.
		const today = frappe.datetime.get_today();
		const month_ago = frappe.datetime.add_days(today, -30);
		this.from_date_field.set_value(month_ago).then(() => {
			this.to_date_field.set_value(today).then(() => {
				this.generate();
			});
		});
	}

	inject_styles() {
		if (document.getElementById("ma-styles")) return;
		$(`<style id="ma-styles">
			.ma-page .ma-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.ma-page .ma-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.ma-page .ma-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.ma-page .ma-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.ma-page .ma-card.fast {
				border-color: #bfe6c8;
				background: #eafcf1;
			}
			.ma-page .ma-card.slow {
				border-color: #f5ddb8;
				background: #fdf4e7;
			}
			.ma-page .ma-card.non-moving {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.ma-page .ma-card .ma-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.ma-page .ma-card.fast .ma-card-label { color: #1f7a3f; }
			.ma-page .ma-card.slow .ma-card-label { color: #a3701f; }
			.ma-page .ma-card.non-moving .ma-card-label { color: #a3341f; }
			.ma-page .ma-card .ma-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.ma-page .ma-card.fast .ma-card-value { color: #1f7a3f; }
			.ma-page .ma-card.slow .ma-card-value { color: #a3701f; }
			.ma-page .ma-card.non-moving .ma-card-value { color: #a3341f; }
			.ma-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.ma-page table.ma-table {
				margin-bottom: 0;
			}
			.ma-page table.ma-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.ma-page table.ma-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.ma-page table.ma-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.ma-page table.ma-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.ma-page table.ma-table tr.ma-non-moving-row td {
				background: #fdece7;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="ma-section-title">STOCK</div>
			<div class="ma-section-subtitle">FSN Analysis</div>
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
			label: __("Warehouse"),
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

		btn(__("This Week"), () => this.set_range(frappe.datetime.week_start(), frappe.datetime.week_end()));
		btn(__("This Month"), () => this.set_range(frappe.datetime.month_start(), frappe.datetime.month_end()));
		btn(__("Last 30 Days"), () =>
			this.set_range(frappe.datetime.add_days(frappe.datetime.get_today(), -30), frappe.datetime.get_today())
		);
		btn(__("Last 90 Days"), () =>
			this.set_range(frappe.datetime.add_days(frappe.datetime.get_today(), -90), frappe.datetime.get_today())
		);
	}

	set_range(from_date, to_date) {
		// set_value() is async (goes through frappe.run_serially) - Generate
		// must wait on this or it reads the fields' old (still empty) value
		// and wrongly warns to set both dates.
		return Promise.all([this.from_date_field.set_value(from_date), this.to_date_field.set_value(to_date)]);
	}

	make_results_area() {
		this.cards_area = $(`<div class="ma-cards"></div>`).appendTo(this.page.body);
		this.table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(this.page.body);
	}

	generate() {
		const from_date = this.from_date_field.get_value();
		const to_date = this.to_date_field.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set both From Date and To Date."));
			return;
		}

		frappe.call({
			method: "metta.stock.page.fsn_analysis.fsn_analysis.get_data",
			args: {
				from_date,
				to_date,
				warehouse: this.warehouse_field.get_value(),
				item: this.item_field.get_value(),
				item_type: this.item_type_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message || []),
		});
	}

	render(rows) {
		this.all_rows = rows;

		const fast_count = rows.filter((r) => r.movement_status === "Fast-Moving").length;
		const slow_count = rows.filter((r) => r.movement_status === "Slow-Moving").length;
		const non_moving_count = rows.filter((r) => r.movement_status === "Non-Moving").length;

		this.cards_area.html(`
			<div class="ma-card">
				<div class="ma-card-label">${__("Total Items")}</div>
				<div class="ma-card-value">${rows.length}</div>
			</div>
			<div class="ma-card fast">
				<div class="ma-card-label">${__("Fast-Moving")}</div>
				<div class="ma-card-value">${fast_count}</div>
			</div>
			<div class="ma-card slow">
				<div class="ma-card-label">${__("Slow-Moving")}</div>
				<div class="ma-card-value">${slow_count}</div>
			</div>
			<div class="ma-card non-moving">
				<div class="ma-card-label">${__("Non-Moving")}</div>
				<div class="ma-card-value">${non_moving_count}</div>
			</div>
		`);

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No stock movement found for this range.")}</p>`);
			return;
		}

		const header = [
			"Item",
			"Item Name",
			"Item Type",
			"Warehouse",
			"Opening Qty",
			"Inward Qty",
			"Outward Qty",
			"Closing Qty",
			"Closing Value",
			"Active Days",
			"Last Outward",
			"Movement Status",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = rows
			.map((row) => {
				const indicator = MOVEMENT_STATUS_INDICATOR[row.movement_status] || "gray";
				const row_class = row.movement_status === "Non-Moving" ? "ma-non-moving-row" : "";
				return `
				<tr class="${row_class}">
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}</td>
					<td>${frappe.utils.escape_html(row.item_type || "")}</td>
					<td>${frappe.utils.escape_html(row.warehouse || "")}</td>
					<td class="text-center">${flt(row.opening_qty)}</td>
					<td class="text-center">${flt(row.inward_qty)}</td>
					<td class="text-center">${flt(row.outward_qty)}</td>
					<td class="text-center">${flt(row.closing_qty)}</td>
					<td class="text-center">${format_currency(row.closing_value)}</td>
					<td class="text-center">${row.active_days}/${row.total_days} ${__("days")}</td>
					<td class="text-center">${format_ddmmyy(row.last_outward_datetime)}</td>
					<td><span class="indicator-pill ${indicator}"><span>${__(row.movement_status)}</span></span></td>
				</tr>`;
			})
			.join("");

		this.table_area.html(`
			<table class="table table-hover ma-table">
				<thead><tr>${header}</tr></thead>
				<tbody>${body}</tbody>
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
			"Opening Qty",
			"Inward Qty",
			"Outward Qty",
			"Closing Qty",
			"Closing Value",
			"Active Days",
			"Last Outward",
			"Movement Status",
		].map((c) => __(c));

		const data = rows.map((row) => [
			row.item || "",
			row.item_name || "",
			row.item_type || "",
			row.warehouse || "",
			flt(row.opening_qty),
			flt(row.inward_qty),
			flt(row.outward_qty),
			flt(row.closing_qty),
			format_currency(row.closing_value),
			`${row.active_days}/${row.total_days}`,
			format_ddmmyy(row.last_outward_datetime),
			__(row.movement_status),
		]);

		const filter_bits = [
			`${__("From Date")}: ${format_ddmmyy(this.from_date_field.get_value())}`,
			`${__("To Date")}: ${format_ddmmyy(this.to_date_field.get_value())}`,
		];
		if (this.warehouse_field.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.warehouse_field.get_value()}`);
		if (this.item_type_field.get_value()) filter_bits.push(`${__("Item Type")}: ${this.item_type_field.get_value()}`);

		return {
			title: __("FSN Analysis"),
			subtitle: filter_bits.join("   |   "),
			columns,
			rows: data,
			filename: "Material_Analysis",
		};
	}
}
