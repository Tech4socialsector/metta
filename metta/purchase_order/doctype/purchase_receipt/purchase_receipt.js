// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Receipt", {
	setup(frm) {
		// Services aren't bought from a supplier or held in stock - only
		// let physical, purchasable item types be picked here.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
	refresh(frm) {
		show_get_items_button(frm);
	},
	// Selecting a value in a Link field doesn't fire "refresh" on its own in
	// Frappe - only a reload/save does - so without this the button would
	// only appear after saving once, not the moment Purchase Order is picked.
	purchase_order(frm) {
		frm.refresh();
	},
});

function show_get_items_button(frm) {
	if (frm.doc.docstatus !== 0 || !frm.doc.purchase_order) return;

	frm.add_custom_button(__("Get Items From Purchase Order"), () => {
		frappe.call({
			method: "metta.purchase_order.doctype.purchase_receipt.purchase_receipt.get_pending_items",
			args: { purchase_order: frm.doc.purchase_order },
			callback(r) {
				const rows = r.message || [];
				if (!rows.length) {
					frappe.msgprint(__("Nothing pending to receive on this Purchase Order."));
					return;
				}
				// Always start from a clean table - Frappe's auto-added blank
				// starter row, and any rows pulled in from a Purchase Order
				// that was since swapped out, must not linger alongside the
				// fresh list for whichever Purchase Order is selected now.
				frm.clear_table("items");
				rows.forEach((row) => frm.add_child("items", row));
				frm.refresh_field("items");
				frappe.show_alert({
					message: __("{0} item(s) pulled in - fill in Batch No, Expiry Date and confirm Qty Received.", [
						rows.length,
					]),
					indicator: "green",
				});
			},
		});
	}).addClass("btn-primary");
}

frappe.ui.form.on("Purchase Receipt Item", {
	// fetch_from only pre-fills the display in the collapsed grid row, not the
	// stored value, when the Item is picked without opening the row in the
	// full edit view - so Save can still fail with "Unit of Measure missing"
	// even though the grid shows it. Fetching explicitly here always commits
	// the real value onto the row.
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "unit_of_measure", "");
			frappe.model.set_value(cdt, cdn, "qty_ordered", 0);
			frappe.model.set_value(cdt, cdn, "item_name", "");
			return;
		}
		frappe.db.get_value("Item", row.item, ["purchase_uom", "item_name"], (r) => {
			frappe.model.set_value(cdt, cdn, "unit_of_measure", r.purchase_uom || "");
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
		// Qty Ordered can't be a plain fetch_from - it depends on both the
		// Purchase Order and this specific Item, not just the Item alone.
		if (frm.doc.purchase_order) {
			frappe.call({
				method: "metta.purchase_order.doctype.purchase_receipt.purchase_receipt.get_qty_ordered",
				args: { purchase_order: frm.doc.purchase_order, item: row.item },
				callback(r) {
					frappe.model.set_value(cdt, cdn, "qty_ordered", flt(r.message));
				},
			});
		}
		find_and_fill_quality_inspection(frm, cdt, cdn);
	},
	batch_no(frm, cdt, cdn) {
		find_and_fill_quality_inspection(frm, cdt, cdn);
	},
});

function find_and_fill_quality_inspection(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	// A Quality Inspection links to this exact Purchase Receipt by name, so
	// there's nothing to match against until this document has actually been
	// saved at least once (frm.is_new() means the name is still a placeholder).
	if (frm.is_new() || !row.item || !row.batch_no) return;

	frappe.call({
		method:
			"metta.purchase_order.doctype.purchase_receipt.purchase_receipt.find_matching_quality_inspection",
		args: {
			purchase_receipt: frm.doc.name,
			item: row.item,
			batch_no: row.batch_no,
		},
		callback(r) {
			const match = r.message;
			if (!match) return;
			frappe.model.set_value(cdt, cdn, "quality_inspection", match.name);
			if (match.result === "Rejected") {
				frappe.msgprint({
					title: __("Quality Inspection Failed"),
					message: __(
						"Row for Item {0}, Batch {1}: the matching Quality Inspection {2} was Rejected.",
						[row.item, row.batch_no, match.name]
					),
					indicator: "red",
				});
			}
		},
	});
}
