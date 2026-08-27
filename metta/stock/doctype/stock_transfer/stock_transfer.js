// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Transfer", {
	setup(frm) {
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.issued_by) {
			frm.set_value("issued_by", frappe.session.user);
		}
		show_get_items_button(frm);

		if (frm.doc.docstatus === 1 && frm.doc.status === "Dispatched") {
			frm.add_custom_button(__("Confirm Receipt"), () => {
				frappe.confirm(
					__("Confirm the quantities received at {0}? This will add them to that warehouse's stock.", [
						frm.doc.to_warehouse,
					]),
					() => {
						frm.call("confirm_receipt").then(() => frm.reload_doc());
					}
				);
			}).addClass("btn-primary");
		}

		if (frm.doc.docstatus === 1 && frm.doc.status === "Confirmed") {
			frm.add_custom_button(__("Create Return Transfer"), () => {
				frappe.call({
					method: "metta.stock.doctype.stock_transfer.stock_transfer.get_return_transfer_details",
					args: { stock_transfer: frm.doc.name },
					callback(r) {
						const details = r.message;
						if (!details || !details.items.length) {
							frappe.msgprint(__("Nothing was actually received on this transfer to return."));
							return;
						}
						frappe.new_doc("Stock Transfer", {
							from_warehouse: details.from_warehouse,
							to_warehouse: details.to_warehouse,
							against_transfer: details.against_transfer,
						}).then(() => {
							const new_frm = cur_frm;
							new_frm.clear_table("items");
							details.items.forEach((row) => new_frm.add_child("items", row));
							new_frm.refresh_field("items");
							new_frm.dirty();
							frappe.show_alert({
								message: __(
									"{0} item(s) pulled in - fill in Batch No, and change To Warehouse if this is going somewhere other than back to {1}.",
									[details.items.length, details.to_warehouse]
								),
								indicator: "green",
							});
						});
					},
				});
			});
		}

		// Temporarily hidden - re-enable by restoring this block.
		// if (frm.doc.docstatus === 1 && frm.doc.against_indent && !frm.doc.shortfall_notice_sent) {
		// 	frappe.call({
		// 		method: "metta.stock.doctype.stock_transfer.stock_transfer.has_pending_shortfall",
		// 		args: { stock_transfer: frm.doc.name },
		// 		callback(r) {
		// 			if (!r.message) return;
		// 			frm.add_custom_button(__("Notify Requesting Warehouse"), () => {
		// 				frappe.confirm(
		// 					__(
		// 						"This will email whoever raised Indent {0}, listing what's still pending. Continue?",
		// 						[frm.doc.against_indent]
		// 					),
		// 					() => {
		// 						frm.call("notify_requesting_warehouse").then(() => {
		// 							frm.reload_doc();
		// 							frappe.show_alert({ message: __("Shortfall notice sent."), indicator: "green" });
		// 						});
		// 					}
		// 				);
		// 			});
		// 		},
		// 	});
		// }

		// Temporarily hidden - re-enable by restoring this block.
		// if (frm.doc.has_discrepancy && frm.doc.discrepancy_status === "Pending Review") {
		// 	frm.add_custom_button(__("Resolve Discrepancy"), () => {
		// 		frappe.prompt(
		// 			[
		// 				{
		// 					fieldname: "resolution",
		// 					label: __("How was this discrepancy resolved?"),
		// 					fieldtype: "Select",
		// 					options: "Written Off\nReissued",
		// 					reqd: 1,
		// 				},
		// 			],
		// 			(values) => {
		// 				frm.call("resolve_discrepancy", { resolution: values.resolution }).then(() => frm.reload_doc());
		// 			},
		// 			__("Resolve Discrepancy")
		// 		);
		// 	}).addClass("btn-primary");
		// }
	},
	// Selecting a value in a Link field doesn't fire "refresh" on its own in
	// Frappe - only a reload/save does - so without this the button would
	// only appear after saving once, not the moment an Indent is picked.
	against_indent(frm) {
		if (frm.doc.against_indent) {
			frappe.db.get_value("Stock Indent", frm.doc.against_indent, "requesting_warehouse", (r) => {
				if (r && r.requesting_warehouse) {
					frm.set_value("to_warehouse", r.requesting_warehouse);
				}
			});
			// Central Store is always who fulfils an Indent - a sub-store can
			// never be the requester (enforced on Stock Indent itself), so
			// there's nothing to actually choose here unless it's already set.
			if (!frm.doc.from_warehouse) {
				frappe.db
					.get_list("Warehouse", { filters: { warehouse_type: "Central Store" }, fields: ["name"], limit: 1 })
					.then((rows) => {
						if (rows.length) frm.set_value("from_warehouse", rows[0].name);
					});
			}
		}
		frm.refresh();
	},
});

function show_get_items_button(frm) {
	if (frm.doc.docstatus !== 0 || !frm.doc.against_indent) return;

	// The button always clears the table before repopulating, so once real
	// items are already present, showing it again would only risk wiping out
	// batch numbers already entered.
	const has_real_items = (frm.doc.items || []).some((row) => row.item);
	if (has_real_items) return;

	frm.add_custom_button(__("Get Items From Stock Indent"), () => {
		if (!frm.doc.from_warehouse) {
			frappe.msgprint(__("Please set From Warehouse first, so Available Qty can be checked against it."));
			return;
		}
		frappe.call({
			method: "metta.stock.doctype.stock_transfer.stock_transfer.get_pending_items_for_transfer",
			args: { stock_indent: frm.doc.against_indent, from_warehouse: frm.doc.from_warehouse },
			callback(r) {
				const rows = r.message || [];
				if (!rows.length) {
					frappe.msgprint(__("Nothing pending to issue on this Stock Indent."));
					return;
				}
				// Always start from a clean table - Frappe's auto-added blank
				// starter row must not linger alongside the fresh list.
				frm.clear_table("items");
				rows.forEach((row) => frm.add_child("items", row));
				frm.refresh_field("items");
				frappe.show_alert({
					message: __("{0} item(s) pulled in - fill in Batch No for each before submitting.", [
						rows.length,
					]),
					indicator: "green",
				});
			},
		});
	}).addClass("btn-primary");
}

frappe.ui.form.on("Stock Transfer Item", {
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "item_name", "");
			frappe.model.set_value(cdt, cdn, "batch", "");
			return;
		}
		frappe.db.get_value("Item", row.item, "item_name", (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
		// If this Item already has a Batch on record, pre-fill it as a
		// convenience - still just a starting point, not a lock; change it
		// if this transfer is actually moving stock from a different batch.
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
	qty_dispatched(frm, cdt, cdn) {
		// Default Qty Confirmed to Qty Dispatched so it's never left blank -
		// that way, if the receiving side later changes it to 0 (nothing
		// arrived), that's unambiguously a real total loss, not an untouched field.
		if (frm.doc.docstatus === 0) {
			const row = locals[cdt][cdn];
			frappe.model.set_value(cdt, cdn, "qty_confirmed", row.qty_dispatched);
		}
	},
});
