frappe.pages["outletwise-expiry-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Outlet-wise Expiry Report"),
		single_column: true,
	});

	new OutletwiseExpiryReport(page);
};

const ITEM_TYPE_OPTIONS = ["", "Medicine", "Service", "Consumable", "Asset"];
const STATUS_OPTIONS = ["All", "Expired", "Expiring Soon", "Safe"];

const STATUS_INDICATOR = {
	Expired: "red",
	"Expiring Soon": "orange",
	Safe: "green",
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

class OutletwiseExpiryReport {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("oer-page");
		this.make_section_title();
		this.make_filters();
		this.make_results_area();
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		// This is a snapshot of stock sitting on the shelf right now, not a
		// historical range - there's no date to pick, so it loads
		// immediately instead of waiting for a Generate click.
		this.generate();
	}

	inject_styles() {
		if (document.getElementById("oer-styles")) return;
		$(`<style id="oer-styles">
			.oer-page .oer-section-title {
				font-weight: 700;
				font-size: 13px;
				letter-spacing: 0.05em;
				margin-bottom: 4px;
			}
			.oer-page .oer-section-subtitle {
				color: #1a63c9;
				font-weight: 600;
				font-size: 15px;
				padding-bottom: 8px;
				border-bottom: 2px solid #1a63c9;
				margin-bottom: 18px;
			}
			.oer-page .oer-cards {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.oer-page .oer-card {
				flex: 1 1 180px;
				border: 1px solid #bcdcf7;
				border-radius: 8px;
				padding: 12px 16px;
				background: #eaf3fc;
			}
			.oer-page .oer-card.expired {
				border-color: #f5c2b8;
				background: #fdece7;
			}
			.oer-page .oer-card.expiring-soon {
				border-color: #f5ddb8;
				background: #fdf4e7;
			}
			.oer-page .oer-card .oer-card-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				color: #0b4a86;
				font-weight: 600;
			}
			.oer-page .oer-card.expired .oer-card-label { color: #a3341f; }
			.oer-page .oer-card.expiring-soon .oer-card-label { color: #a3701f; }
			.oer-page .oer-card .oer-card-value {
				font-size: 22px;
				font-weight: 700;
				color: #0b4a86;
				font-variant-numeric: tabular-nums;
			}
			.oer-page .oer-card.expired .oer-card-value { color: #a3341f; }
			.oer-page .oer-card.expiring-soon .oer-card-value { color: #a3701f; }
			.oer-page .table-wrapper {
				border: 1px solid var(--border-color);
				border-radius: 8px;
				overflow: hidden;
			}
			.oer-page table.oer-table {
				margin-bottom: 0;
			}
			.oer-page table.oer-table thead th {
				background: #1b4f8c;
				color: #fff;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.04em;
				border-bottom: none;
				padding: 10px 14px;
				white-space: nowrap;
			}
			.oer-page table.oer-table td {
				padding: 8px 14px;
				vertical-align: middle;
				font-size: 13px;
				border-color: var(--border-color);
			}
			.oer-page table.oer-table td.text-center {
				text-align: center;
				font-variant-numeric: tabular-nums;
			}
			.oer-page table.oer-table tbody tr:nth-child(even) {
				background: var(--subtle-fg, rgba(140, 140, 140, 0.04));
			}
			.oer-page table.oer-table tr.oer-expired-row td {
				background: #fdece7;
			}
		</style>`).appendTo("head");
	}

	make_section_title() {
		$(`
			<div class="oer-section-title">STOCK</div>
			<div class="oer-section-subtitle">Outlet-wise Expiry Report</div>
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
		this.status_field = field({
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: STATUS_OPTIONS.join("\n"),
			default: "All",
		});
		this.status_field.set_value("All");

		const button_wrap = $(`<div></div>`).appendTo(filter_row);
		$(`<button class="btn btn-primary btn-sm">${__("Generate")}</button>`)
			.appendTo(button_wrap)
			.on("click", () => this.generate());
	}

	make_results_area() {
		this.cards_area = $(`<div class="oer-cards"></div>`).appendTo(this.page.body);
		this.table_area = $(`<div class="table-wrapper" style="overflow-x: auto;"></div>`).appendTo(this.page.body);
	}

	generate() {
		frappe.call({
			method: "metta.stock.page.outletwise_expiry_report.outletwise_expiry_report.get_data",
			args: {
				warehouse: this.warehouse_field.get_value(),
				item: this.item_field.get_value(),
				item_type: this.item_type_field.get_value(),
				status: this.status_field.get_value(),
			},
			freeze: true,
			callback: (r) => this.render(r.message || []),
		});
	}

	render(rows) {
		this.all_rows = rows;

		const expired_rows = rows.filter((r) => r.status === "Expired");
		const expiring_soon_rows = rows.filter((r) => r.status === "Expiring Soon");
		const value_at_risk = [...expired_rows, ...expiring_soon_rows].reduce(
			(sum, r) => sum + flt(r.closing_value),
			0
		);

		this.cards_area.html(`
			<div class="oer-card">
				<div class="oer-card-label">${__("Total Batches")}</div>
				<div class="oer-card-value">${rows.length}</div>
			</div>
			<div class="oer-card expired">
				<div class="oer-card-label">${__("Expired")}</div>
				<div class="oer-card-value">${expired_rows.length}</div>
			</div>
			<div class="oer-card expiring-soon">
				<div class="oer-card-label">${__("Expiring Soon")}</div>
				<div class="oer-card-value">${expiring_soon_rows.length}</div>
			</div>
			<div class="oer-card expired">
				<div class="oer-card-label">${__("Value at Risk")}</div>
				<div class="oer-card-value">${format_currency(value_at_risk)}</div>
			</div>
		`);

		if (!rows.length) {
			this.table_area.html(`<p class="text-muted">${__("No batches found for this filter.")}</p>`);
			return;
		}

		const header = [
			"Item",
			"Item Name",
			"Item Type",
			"Warehouse",
			"Batch No",
			"Shelf",
			"Closing Qty",
			"Expiry Date",
			"Days to Expiry",
			"Closing Value",
			"Status",
		]
			.map((h) => `<th>${__(h)}</th>`)
			.join("");

		const body = rows
			.map((row) => {
				const indicator = STATUS_INDICATOR[row.status] || "gray";
				const row_class = row.status === "Expired" ? "oer-expired-row" : "";
				return `
				<tr class="${row_class}">
					<td>${frappe.utils.escape_html(row.item || "")}</td>
					<td>${frappe.utils.escape_html(row.item_name || "")}</td>
					<td>${frappe.utils.escape_html(row.item_type || "")}</td>
					<td>${frappe.utils.escape_html(row.warehouse || "")}</td>
					<td>${frappe.utils.escape_html(row.batch_no || "")}</td>
					<td>${frappe.utils.escape_html(row.rack_location || "")}</td>
					<td class="text-center">${flt(row.qty_after_transaction)}</td>
					<td class="text-center">${format_ddmmyy(row.expiry_date)}</td>
					<td class="text-center">${row.days_to_expiry ?? ""}</td>
					<td class="text-center">${format_currency(row.closing_value)}</td>
					<td><span class="indicator-pill ${indicator}"><span>${__(row.status)}</span></span></td>
				</tr>`;
			})
			.join("");

		this.table_area.html(`
			<table class="table table-hover oer-table">
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
			"Batch No",
			"Shelf",
			"Closing Qty",
			"Expiry Date",
			"Days to Expiry",
			"Closing Value",
			"Status",
		].map((c) => __(c));

		const data = rows.map((row) => [
			row.item || "",
			row.item_name || "",
			row.item_type || "",
			row.warehouse || "",
			row.batch_no || "",
			row.rack_location || "",
			flt(row.qty_after_transaction),
			format_ddmmyy(row.expiry_date),
			row.days_to_expiry ?? "",
			format_currency(row.closing_value),
			__(row.status),
		]);

		const filter_bits = [];
		if (this.warehouse_field.get_value()) filter_bits.push(`${__("Warehouse")}: ${this.warehouse_field.get_value()}`);
		if (this.item_type_field.get_value()) filter_bits.push(`${__("Item Type")}: ${this.item_type_field.get_value()}`);
		if (this.status_field.get_value() && this.status_field.get_value() !== "All") {
			filter_bits.push(`${__("Status")}: ${this.status_field.get_value()}`);
		}

		return {
			title: __("Outlet-wise Expiry Report"),
			subtitle: filter_bits.length ? filter_bits.join("   |   ") : __("All Outlets"),
			columns,
			rows: data,
			filename: "Outletwise_Expiry_Report",
		};
	}
}
