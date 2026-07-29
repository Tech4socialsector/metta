// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Return", {
	setup(frm) {
		// Services aren't stocked and Assets aren't dispensed to patients -
		// only Medicine/Consumable make sense to return here.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]] },
		}));
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.returned_by) {
			frm.set_value("returned_by", frappe.session.user);
		}
		calculate_total(frm);
	},
});

frappe.ui.form.on("Sales Return Item", {
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "item_name", "");
			frappe.model.set_value(cdt, cdn, "batch", "");
			frappe.model.set_value(cdt, cdn, "rate", 0);
			return;
		}
		frappe.db.get_value("Item", row.item, ["item_name", "standard_selling_rate"], (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
			frappe.model.set_value(cdt, cdn, "rate", flt(r.standard_selling_rate));
		});
		// If this Item already has a Batch on record, pre-fill it as a
		// convenience - still just a starting point, not a lock; change it
		// if this return is actually a different batch than what's on record.
		frappe.call({
			method:
				"metta.purchase_order.doctype.purchase_receipt.purchase_receipt.get_latest_batch_for_item",
			args: { item: row.item },
			callback(r) {
				const batch = r.message;
				if (!batch) return;
				frappe.model.set_value(cdt, cdn, "batch", batch.name || "");
			},
		});
	},
	qty_returned(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	rate(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	items_add(frm) {
		calculate_total(frm);
	},
	items_remove(frm) {
		calculate_total(frm);
	},
});

function calculate_amount(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "amount", flt(row.qty_returned) * flt(row.rate));
	calculate_total(frm);
}

function calculate_total(frm) {
	const total = (frm.doc.items || []).reduce((sum, row) => sum + flt(row.amount), 0);
	frm.set_value("total_value", total);
}
