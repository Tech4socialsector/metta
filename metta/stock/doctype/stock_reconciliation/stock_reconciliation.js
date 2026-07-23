// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Reconciliation", {
	setup(frm) {
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
		// A batch belongs to exactly one item - showing every batch in the
		// system here is how a wrong-item batch gets picked by mistake.
		frm.set_query("batch_no", "items", (doc, cdt, cdn) => {
			const row = locals[cdt][cdn];
			return { filters: { item: row.item } };
		});
	},
});

frappe.ui.form.on("Stock Reconciliation Item", {
	item(frm, cdt, cdn) {
		fetch_system_qty(frm, cdt, cdn);
		const row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, "batch_no", "");
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "item_name", "");
			return;
		}
		frappe.db.get_value("Item", row.item, "item_name", (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
		// Only auto-fill when there's exactly one batch to choose from - with
		// several batches for the item, guessing which one is being counted
		// would be wrong, so it's left for the user to pick from the
		// (now-filtered) list instead.
		frappe.call({
			method: "metta.stock.doctype.stock_reconciliation.stock_reconciliation.get_batches_for_item",
			args: { item: row.item },
			callback(r) {
				const batches = r.message || [];
				if (batches.length === 1) {
					frappe.model.set_value(cdt, cdn, "batch_no", batches[0]);
				}
			},
		});
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
