// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Quality Inspection", {
	refresh(frm) {
		show_get_items_button(frm);
	},
	// Selecting a value in a Link field doesn't fire "refresh" on its own in
	// Frappe - only a reload/save does - so without this the button would
	// only appear after saving once, not the moment Purchase Receipt is picked.
	purchase_receipt(frm) {
		frm.refresh();
	},
});

function show_get_items_button(frm) {
	if (frm.doc.docstatus !== 0 || !frm.doc.purchase_receipt) return;

	frm.add_custom_button(__("Get Items From Purchase Receipt"), () => {
		frappe.call({
			method: "metta.purchase_order.doctype.quality_inspection.quality_inspection.get_items_to_inspect",
			args: { purchase_receipt: frm.doc.purchase_receipt },
			callback(r) {
				const rows = r.message || [];
				if (!rows.length) {
					frappe.msgprint(__("This Purchase Receipt has no items to inspect."));
					return;
				}
				// Always start from a clean table - see the same fix on
				// Purchase Receipt for why (blank starter row + stale rows
				// from a previously-selected Purchase Receipt must not linger).
				frm.clear_table("items");
				rows.forEach((row) => frm.add_child("items", row));
				frm.refresh_field("items");
				frappe.show_alert({
					message: __("{0} item(s) pulled in with Batch No, Expiry Date and Qty already filled in - just record the inspection result.", [
						rows.length,
					]),
					indicator: "green",
				});
			},
		});
	}).addClass("btn-primary");
}
