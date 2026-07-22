// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Reconciliation", {
	setup(frm) {
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
});

frappe.ui.form.on("Stock Reconciliation Item", {
	item(frm, cdt, cdn) {
		fetch_system_qty(frm, cdt, cdn);
	},
	physical_qty(frm, cdt, cdn) {
		calculate_difference(cdt, cdn);
	},
});

function fetch_system_qty(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	if (!row.item || !frm.doc.warehouse) return;
	frappe.call({
		method: "metta.stock.doctype.stock_reconciliation.stock_reconciliation.get_current_stock_qty",
		args: { item: row.item, warehouse: frm.doc.warehouse },
		callback(r) {
			frappe.model.set_value(cdt, cdn, "system_qty", r.message || 0);
			calculate_difference(cdt, cdn);
		},
	});
}

function calculate_difference(cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "difference", flt(row.physical_qty) - flt(row.system_qty));
}
