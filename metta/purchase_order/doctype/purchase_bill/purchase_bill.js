// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Bill", {
	refresh(frm) {
		calculate_totals(frm);
		show_get_items_button(frm);
	},
	purchase_receipt(frm) {
		frm.refresh();
	},
	other_tax_amount(frm) {
		calculate_totals(frm);
	},
});

frappe.ui.form.on("Purchase Bill Item", {
	qty(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	rate(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	gst_percent(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	items_add(frm) {
		calculate_totals(frm);
	},
	items_remove(frm) {
		calculate_totals(frm);
	},
});

function show_get_items_button(frm) {
	if (frm.doc.docstatus !== 0 || !frm.doc.purchase_receipt) return;

	frm.add_custom_button(__("Get Items From Purchase Receipt"), () => {
		frappe.call({
			method: "metta.purchase_order.doctype.purchase_bill.purchase_bill.get_items_from_receipt",
			args: { purchase_receipt: frm.doc.purchase_receipt },
			callback(r) {
				const rows = r.message || [];
				if (!rows.length) {
					frappe.msgprint(__("This Purchase Receipt has no items to bill."));
					return;
				}
				frm.clear_table("items");
				rows.forEach((row) => frm.add_child("items", row));
				frm.refresh_field("items");
				calculate_totals(frm);
				frappe.show_alert({
					message: __("{0} item(s) pulled in with Qty and Rate already filled in.", [rows.length]),
					indicator: "green",
				});
			},
		});
	}).addClass("btn-primary");
}

function calculate_amount(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const amount = flt(row.qty) * flt(row.rate);
	frappe.model.set_value(cdt, cdn, "amount", amount);
	frappe.model.set_value(cdt, cdn, "gst_amount", (amount * flt(row.gst_percent)) / 100);
	calculate_totals(frm);
}

function calculate_totals(frm) {
	let subtotal = 0;
	let gst_total = 0;
	(frm.doc.items || []).forEach((row) => {
		subtotal += flt(row.amount);
		gst_total += flt(row.gst_amount);
	});
	frm.set_value("subtotal", subtotal);
	frm.set_value("gst_amount", gst_total);
	frm.set_value("total_amount", subtotal + gst_total + flt(frm.doc.other_tax_amount));
}
