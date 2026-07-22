// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Bill", {
	setup(frm) {
		// A patient is billed for medicine, consumables used on them, or a
		// service (consultation, procedure) - never for a fixed asset.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Service"]] },
		}));
	},
	refresh(frm) {
		calculate_totals(frm);
	},
	discount_percent(frm) {
		calculate_totals(frm);
	},
});

frappe.ui.form.on("Sales Bill Item", {
	// fetch_from only pre-fills the collapsed grid row's display, not the
	// stored value - same issue already hit on Purchase Order/Purchase
	// Receipt, so UOM, Rate and GST % are fetched explicitly here instead.
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "uom", "");
			frappe.model.set_value(cdt, cdn, "item_name", "");
			return;
		}
		frappe.db.get_value(
			"Item",
			row.item,
			["sale_uom", "standard_selling_rate", "gst_percent", "item_name"],
			(r) => {
				frappe.model.set_value(cdt, cdn, "uom", r.sale_uom || "");
				frappe.model.set_value(cdt, cdn, "rate", flt(r.standard_selling_rate));
				frappe.model.set_value(cdt, cdn, "gst_percent", flt(r.gst_percent));
				frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
			}
		);
	},
	qty(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	rate(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	gst_percent(frm) {
		calculate_totals(frm);
	},
	items_add(frm) {
		calculate_totals(frm);
	},
	items_remove(frm) {
		calculate_totals(frm);
	},
});

function calculate_amount(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const amount = flt(row.qty) * flt(row.rate);
	frappe.model.set_value(cdt, cdn, "amount", amount);
	calculate_totals(frm);
}

function calculate_totals(frm) {
	const discount_percent = flt(frm.doc.discount_percent);
	let subtotal = 0;
	let gst_total = 0;

	(frm.doc.items || []).forEach((row) => {
		const amount = flt(row.amount);
		const taxable_value = amount * (1 - discount_percent / 100);
		const gst_amount = (taxable_value * flt(row.gst_percent)) / 100;
		frappe.model.set_value(row.doctype, row.name, "gst_amount", gst_amount);
		subtotal += amount;
		gst_total += gst_amount;
	});

	const discount_amount = (subtotal * discount_percent) / 100;
	frm.set_value("subtotal", subtotal);
	frm.set_value("discount_amount", discount_amount);
	frm.set_value("gst_amount", gst_total);
	frm.set_value("net_amount", subtotal - discount_amount + gst_total);
}
