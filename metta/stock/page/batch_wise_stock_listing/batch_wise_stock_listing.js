frappe.pages["batch-wise-stock-listing"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Batch-wise Stock Listing"), single_column: true });
	new BatchWiseStockListing(page);
};

const BWSL_ITEM_TYPES = ["", "Medicine", "Service", "Consumable"];
const BWSL_STATUSES = ["All", "Expired", "Expiring in 30 Days", "Expiring in 31-60 Days", "Expiring in 61-90 Days", "Safe"];
const BWSL_INDICATORS = { Expired: "red", "Expiring in 30 Days": "orange", "Expiring in 31-60 Days": "yellow", "Expiring in 61-90 Days": "blue", Safe: "green" };

function bwsl_date(date) {
	if (!date) return "";
	const d = new Date(date);
	if (isNaN(d)) return "";
	return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

class BatchWiseStockListing {
	constructor(page) {
		this.page = page;
		this.inject_styles();
		this.page.body.addClass("bwsl-page");
		this.make_title();
		this.make_filters();
		this.cards_area = $("<div class=\"bwsl-cards\"></div>").appendTo(this.page.body);
		this.table_area = $("<div class=\"table-wrapper\" style=\"overflow-x:auto\"></div>").appendTo(this.page.body);
		metta.report_export.add_buttons(this.page, () => this.get_export_data());
		this.generate();
	}

	inject_styles() {
		if (document.getElementById("bwsl-styles")) return;
		$("<style id=\"bwsl-styles\">\n\
		.bwsl-page .bwsl-title{font-weight:700;font-size:13px;letter-spacing:.05em;margin-bottom:4px}\n\
		.bwsl-page .bwsl-subtitle{color:#1a63c9;font-weight:600;font-size:15px;padding-bottom:8px;border-bottom:2px solid #1a63c9;margin-bottom:18px}\n\
		.bwsl-page .bwsl-cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}.bwsl-page .bwsl-card{flex:1 1 180px;border:1px solid #bcdcf7;border-radius:8px;padding:12px 16px;background:#eaf3fc}.bwsl-page .bwsl-card.danger{border-color:#f5c2b8;background:#fdece7}.bwsl-page .bwsl-card.warning{border-color:#f5ddb8;background:#fdf4e7}\n\
		.bwsl-page .bwsl-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#0b4a86;font-weight:600}.bwsl-page .danger .bwsl-label,.bwsl-page .danger .bwsl-value{color:#a3341f}.bwsl-page .warning .bwsl-label,.bwsl-page .warning .bwsl-value{color:#a3701f}.bwsl-page .bwsl-value{font-size:22px;font-weight:700;color:#0b4a86;font-variant-numeric:tabular-nums}\n\
		.bwsl-page .table-wrapper{border:1px solid var(--border-color);border-radius:8px;overflow:hidden}.bwsl-page table{margin-bottom:0}.bwsl-page table thead th{background:#1b4f8c;color:#fff;text-transform:uppercase;font-size:11px;letter-spacing:.04em;border-bottom:none;padding:10px 14px;white-space:nowrap}.bwsl-page table td{padding:8px 14px;vertical-align:middle;font-size:13px;border-color:var(--border-color)}.bwsl-page table td.text-center{text-align:center;font-variant-numeric:tabular-nums}.bwsl-page table tbody tr:nth-child(even){background:var(--subtle-fg,rgba(140,140,140,.04))}.bwsl-page table tr.bwsl-expired td{background:#fdece7}\n\
		</style>").appendTo("head");
	}

	make_title() { $("<div class=\"bwsl-title\">STOCK</div><div class=\"bwsl-subtitle\">Batch-wise Stock Listing</div>").appendTo(this.page.body); }

	make_filters() {
		const row = $("<div class=\"flex\" style=\"gap:12px;align-items:flex-end;margin-bottom:15px\"></div>").appendTo(this.page.body);
		const field = (df) => frappe.ui.form.make_control({ parent: $("<div style=\"min-width:0;flex:1 1 150px\"></div>").appendTo(row), df: { ...df, fieldtype: df.fieldtype || "Data" }, render_input: true });
		this.as_on_date = field({ fieldname: "as_on_date", label: __("As on Date"), fieldtype: "Date", reqd: 1 });
		// Dynamic controls do not consistently apply the DocField `default`,
		// so assign it explicitly before the initial query is made.
		this.as_on_date.set_value(frappe.datetime.get_today());
		this.warehouse = field({ fieldname: "warehouse", label: __("Warehouse (Outlet)"), fieldtype: "Link", options: "Warehouse" });
		this.item = field({ fieldname: "item", label: __("Item"), fieldtype: "Link", options: "Item" });
		this.batch_no = field({
			fieldname: "batch_no",
			label: __("Batch No."),
			fieldtype: "Link",
			options: "Batch",
			onchange: () => this.show_batch_supplier(),
		});
		this.batch_supplier_note = $("<div class=\"text-muted\" style=\"font-size:12px;margin-top:4px;\"></div>").insertAfter(this.batch_no.$wrapper);
		this.supplier = field({ fieldname: "supplier", label: __("Supplier"), fieldtype: "Link", options: "Supplier" });
		this.item_type = field({ fieldname: "item_type", label: __("Item Type"), fieldtype: "Select", options: BWSL_ITEM_TYPES.join("\n") });
		this.status = field({ fieldname: "status", label: __("Expiry Status"), fieldtype: "Select", options: BWSL_STATUSES.join("\n") });
		this.status.set_value("All");
		$("<button class=\"btn btn-primary btn-sm\" style=\"white-space:nowrap\">" + __("Generate") + "</button>").appendTo($("<div style=\"flex:0 0 auto\"></div>").appendTo(row)).on("click", () => this.generate());
	}

	show_batch_supplier() {
		const batch_no = this.batch_no.get_value();
		if (!batch_no) {
			this.batch_supplier_note.text("");
			return;
		}
		frappe.db.get_value("Batch", batch_no, "supplier", (r) => {
			this.batch_supplier_note.text(r && r.supplier ? `${__("Supplier")}: ${r.supplier}` : __("No supplier on record for this batch."));
		});
	}

	generate() {
		frappe.call({ method: "metta.stock.page.batch_wise_stock_listing.batch_wise_stock_listing.get_data", args: { as_on_date:this.as_on_date.get_value(), warehouse:this.warehouse.get_value(), item:this.item.get_value(), item_type:this.item_type.get_value(), batch_no:this.batch_no.get_value(), status:this.status.get_value(), supplier:this.supplier.get_value() }, freeze:true, callback: (r) => this.render(r.message || []) });
	}

	render(rows) {
		this.all_rows = rows;
		const expired = rows.filter(r => r.status === "Expired");
		const expiring = rows.filter(r => r.status === "Expiring in 30 Days");
		const qty = rows.reduce((sum, r) => sum + flt(r.available_qty), 0);
		const value = rows.reduce((sum, r) => sum + flt(r.stock_value), 0);
		this.cards_area.html(`<div class="bwsl-card"><div class="bwsl-label">${__("Active Batches")}</div><div class="bwsl-value">${rows.length}</div></div><div class="bwsl-card"><div class="bwsl-label">${__("Available Stock Qty")}</div><div class="bwsl-value">${qty}</div></div><div class="bwsl-card warning"><div class="bwsl-label">${__("Expiring in 30 Days")}</div><div class="bwsl-value">${expiring.length}</div></div><div class="bwsl-card danger"><div class="bwsl-label">${__("Expired Batches")}</div><div class="bwsl-value">${expired.length}</div></div><div class="bwsl-card"><div class="bwsl-label">${__("Stock Value")}</div><div class="bwsl-value">${format_currency(value)}</div></div>`);
		if (!rows.length) { this.table_area.html(`<p class="text-muted">${__("No available batches found for this filter.")}</p>`); return; }
		const columns = ["Item","Item Name","Item Type","Warehouse","Batch No.","Mfg. Date","Expiry Date","Days Left","Available Qty","Shelf","Stock Value","Status"];
		const body = rows.map(r => `<tr class="${r.status === "Expired" ? "bwsl-expired" : ""}"><td>${frappe.utils.escape_html(r.item || "")}</td><td>${frappe.utils.escape_html(r.item_name || "")}</td><td>${frappe.utils.escape_html(r.item_type || "")}</td><td>${frappe.utils.escape_html(r.warehouse || "")}</td><td>${frappe.utils.escape_html(r.batch_no || "")}</td><td class="text-center">${bwsl_date(r.manufacturing_date)}</td><td class="text-center">${bwsl_date(r.expiry_date)}</td><td class="text-center">${r.days_to_expiry ?? ""}</td><td class="text-center">${flt(r.available_qty)}</td><td>${frappe.utils.escape_html(r.rack_location || "")}</td><td class="text-center">${format_currency(r.stock_value)}</td><td><span class="indicator-pill ${BWSL_INDICATORS[r.status] || "gray"}"><span>${__(r.status)}</span></span></td></tr>`).join("");
		this.table_area.html(`<table class="table table-hover"><thead><tr>${columns.map(c => `<th>${__(c)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`);
	}

	get_export_data() {
		if (!this.all_rows) return null;
		const columns = ["Item","Item Name","Item Type","Warehouse","Batch No.","Mfg. Date","Expiry Date","Days Left","Available Qty","Shelf","Stock Value","Status"].map(c => __(c));
		const rows = this.all_rows.map(r => [r.item,r.item_name,r.item_type,r.warehouse,r.batch_no,bwsl_date(r.manufacturing_date),bwsl_date(r.expiry_date),r.days_to_expiry ?? "",flt(r.available_qty),r.rack_location,format_currency(r.stock_value),__(r.status)]);
		return { title:__("Batch-wise Stock Listing"), subtitle:`${__("As on Date")}: ${bwsl_date(this.as_on_date.get_value())}`, columns, rows, filename:"Batch_Wise_Stock_Listing" };
	}
}
