// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Quality Inspection", {
	setup(frm) {
		// Item now lives on the Quality Inspection Item child table, not the
		// parent, since one inspection can cover a whole delivery's items.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.inspected_by) {
			frm.set_value("inspected_by", frappe.session.user);
		}
		show_get_items_button(frm);
		show_create_return_button(frm);
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

function show_create_return_button(frm) {
	if (frm.doc.docstatus !== 1) return;
	// Whether to offer a return depends on there being a rejected quantity to
	// send back - not on the Result dropdown, since a row can have some units
	// rejected (Short Expiry, etc.) while the batch overall is still marked
	// Accepted.
	const has_rejected = (frm.doc.items || []).some((row) => flt(row.qty_rejected) > 0);
	if (!has_rejected) return;

	// A Quality Inspection should only ever produce one Purchase Return - if
	// one already exists, offer to view it instead of risking a duplicate.
	frappe.call({
		method:
			"metta.purchase_order.doctype.purchase_return.purchase_return.get_existing_return_for_quality_inspection",
		args: { quality_inspection: frm.doc.name },
		callback(r) {
			if (r.message) {
				frm.add_custom_button(__("View Purchase Return"), () => {
					frappe.set_route("Form", "Purchase Return", r.message);
				}).addClass("btn-primary");
				return;
			}

			frm.add_custom_button(__("Create Purchase Return"), () => {
				frappe.call({
					method:
						"metta.purchase_order.doctype.purchase_return.purchase_return.get_return_details_from_quality_inspection",
					args: { quality_inspection: frm.doc.name },
					callback(r2) {
						const details = r2.message;
						if (!details || !details.items.length) {
							frappe.msgprint(__("No rejected items with a rejected quantity found to return."));
							return;
						}
						frappe.new_doc("Purchase Return", {
							supplier: details.supplier,
							against_purchase_receipt: details.against_purchase_receipt,
							from_warehouse: details.from_warehouse,
							quality_inspection: frm.doc.name,
						}).then(() => {
							const new_frm = cur_frm;
							new_frm.clear_table("items");
							details.items.forEach((row) => new_frm.add_child("items", row));
							new_frm.refresh_field("items");
							new_frm.dirty();
							frappe.show_alert({
								message: __("{0} rejected item(s) pulled in - review and Submit.", [
									details.items.length,
								]),
								indicator: "green",
							});
						});
					},
				});
			}).addClass("btn-primary");
		},
	});
}

frappe.ui.form.on("Quality Inspection Item", {
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "item_name", "");
			return;
		}
		frappe.db.get_value("Item", row.item, "item_name", (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
	},
	// Qty Accepted and Qty Rejected are two sides of the same number - only
	// one ever needs to be typed in, the other is always Qty Delivered minus
	// whichever one was just entered. Whichever field the inspector types
	// into drives the other, so either workflow (type what passed, or type
	// what's damaged) works the same way.
	qty_accepted(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.qty_delivered) return;
		const qty_rejected = Math.max(0, flt(row.qty_delivered) - flt(row.qty_accepted));
		frappe.model.set_value(cdt, cdn, "qty_rejected", qty_rejected);
	},
	qty_rejected(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.qty_delivered) return;
		const qty_accepted = Math.max(0, flt(row.qty_delivered) - flt(row.qty_rejected));
		frappe.model.set_value(cdt, cdn, "qty_accepted", qty_accepted);
	},
});
