// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Receipt", {
	setup(frm) {
		// Services aren't bought from a supplier or held in stock - only
		// let physical, purchasable item types be picked here.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]] },
		}));
		// A supplier delivery always lands at Central Store first - sub-stores
		// only ever get stock afterward, via a Stock Transfer out of it.
		frm.set_query("receiving_warehouse", () => ({
			filters: { warehouse_type: "Central Store" },
		}));
	},
	onload(frm) {
		// Every supplier delivery lands at Central Store - looked up dynamically
		// rather than hardcoding the name, same as the Available Qty lookup, in
		// case it's ever renamed. Only for a fresh, unsaved document - never
		// override a value that's already there.
		if (frm.is_new() && !frm.doc.receiving_warehouse) {
			frappe.db.get_value("Warehouse", { warehouse_type: "Central Store" }, "name").then((r) => {
				if (r.message && r.message.name) {
					frm.set_value("receiving_warehouse", r.message.name);
				}
			});
		}
	},
	refresh(frm) {
		show_get_items_button(frm);
		show_create_document_button(frm);
	},
	// Selecting a value in a Link field doesn't fire "refresh" on its own in
	// Frappe - only a reload/save does - so without this the button would
	// only appear after saving once, not the moment Purchase Order is picked.
	purchase_order(frm) {
		frm.refresh();
	},
});

function show_get_items_button(frm) {
	// A replacement receipt already has its items pre-filled from the
	// Purchase Return it's replacing - pulling from the Purchase Order here
	// instead would wipe that out and pull in the rest of the order's
	// pending items, which has nothing to do with this replacement.
	if (frm.doc.docstatus !== 0 || !frm.doc.purchase_order || frm.doc.replacement_for) return;

	// The button always clears the table before repopulating, so once real
	// items are already present (pulled in earlier, or entered by hand),
	// showing it again would only risk wiping out work already done.
	const has_real_items = (frm.doc.items || []).some((row) => row.item);
	if (has_real_items) return;

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
					message: __("{0} item(s) pulled in - fill in Batch No, Expiry Date and confirm Packing/No of Unit.", [
						rows.length,
					]),
					indicator: "green",
				});
			},
		});
	}).addClass("btn-primary");
}

function show_create_document_button(frm) {
	// Quality Inspection can start the moment the receipt is saved (even
	// still Draft) - inspecting before deciding to finalize the receipt is a
	// normal order of work here. Billing, though, needs the receipt's
	// quantities to be final, so that option only ever appears once Submitted.
	if (frm.is_new() || frm.doc.docstatus === 2) return;

	Promise.all([
		frappe.call({
			method:
				"metta.purchase_order.doctype.quality_inspection.quality_inspection.get_existing_inspection_for_purchase_receipt",
			args: { purchase_receipt: frm.doc.name },
		}),
		frappe.call({
			method: "metta.purchase_order.doctype.purchase_bill.purchase_bill.get_existing_bill_for_purchase_receipt",
			args: { purchase_receipt: frm.doc.name },
		}),
	]).then(([qiResult, billResult]) => {
		const existingQI = qiResult.message;
		const existingBill = billResult.message;

		if (existingQI) {
			frm.add_custom_button(__("View Quality Inspection"), () => {
				frappe.set_route("Form", "Quality Inspection", existingQI);
			});
		}
		if (existingBill) {
			frm.add_custom_button(__("View Purchase Bill"), () => {
				frappe.set_route("Form", "Purchase Bill", existingBill);
			});
		}

		// One button offering only whichever of the two hasn't been created
		// yet (and are actually valid at this docstatus), instead of two
		// separate "Create X" buttons sitting side by side.
		const options = [];
		if (!existingQI) options.push("Quality Inspection");
		if (!existingBill && frm.doc.docstatus === 1) options.push("Purchase Bill");
		if (!options.length) return;

		frm.add_custom_button(__("Create Follow-up Document"), () => {
			frappe.prompt(
				[
					{
						fieldname: "doctype_choice",
						label: __("What do you want to create?"),
						fieldtype: "Select",
						options: options.join("\n"),
						reqd: 1,
					},
				],
				(values) => {
					if (values.doctype_choice === "Quality Inspection") {
						create_quality_inspection(frm);
					} else {
						create_purchase_bill(frm);
					}
				},
				__("Create Follow-up Document")
			);
		}).addClass("btn-primary");
	});
}

function create_quality_inspection(frm) {
	frappe.call({
		method: "metta.purchase_order.doctype.quality_inspection.quality_inspection.get_items_to_inspect",
		args: { purchase_receipt: frm.doc.name },
		callback(r) {
			const rows = r.message || [];
			frappe.new_doc("Quality Inspection", { purchase_receipt: frm.doc.name }).then(() => {
				const new_frm = cur_frm;
				if (rows.length) {
					new_frm.clear_table("items");
					rows.forEach((row) => new_frm.add_child("items", row));
					new_frm.refresh_field("items");
					new_frm.dirty();
				}
				frappe.show_alert({
					message: __(
						"{0} item(s) pulled in with Batch No, Expiry Date and Qty already filled in - just record the inspection result.",
						[rows.length]
					),
					indicator: "green",
				});
			});
		},
	});
}

function create_purchase_bill(frm) {
	frappe.call({
		method: "metta.purchase_order.doctype.purchase_bill.purchase_bill.get_items_from_receipt",
		args: { purchase_receipt: frm.doc.name },
		callback(r) {
			const rows = r.message || [];
			frappe.new_doc("Purchase Bill", {
				supplier: frm.doc.supplier,
				purchase_receipt: frm.doc.name,
			}).then(() => {
				const new_frm = cur_frm;
				if (rows.length) {
					new_frm.clear_table("items");
					rows.forEach((row) => new_frm.add_child("items", row));
					new_frm.refresh_field("items");
					new_frm.dirty();
				}
				frappe.show_alert({
					message: __("{0} item(s) pulled in - fill in the supplier's Invoice No and Date, then Save.", [
						rows.length,
					]),
					indicator: "green",
				});
			});
		},
	});
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
		frappe.db.get_value("Item", row.item, ["unit_of_measure", "item_name"], (r) => {
			frappe.model.set_value(cdt, cdn, "unit_of_measure", r.unit_of_measure || "");
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
		// Same call Purchase Order uses - Packing has no suggested default
		// anymore (no more Box/Strip conversion factor to suggest it from),
		// so this just picks up the rate/unit defaults now.
		frappe.call({
			method: "metta.purchase_order.doctype.purchase_order.purchase_order.get_item_defaults_for_order",
			args: { item: row.item },
			callback(r) {
				frappe.model.set_value(cdt, cdn, "packing", cint((r.message || {}).packing));
			},
		});
		// If this Item already has a Batch on record, pre-fill it as a
		// convenience - still just a starting point, not a lock; change it
		// for a genuinely new delivery with its own new batch number.
		frappe.call({
			method:
				"metta.purchase_order.doctype.purchase_receipt.purchase_receipt.get_latest_batch_for_item",
			args: { item: row.item },
			callback(r) {
				const batch = r.message;
				if (!batch) return;
				frappe.model.set_value(cdt, cdn, "batch_no", batch.batch_no || "");
				frappe.model.set_value(cdt, cdn, "expiry_date", batch.expiry_date || "");
			},
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
	packing(frm, cdt, cdn) {
		calculate_qty_received(frm, cdt, cdn);
	},
	no_of_unit(frm, cdt, cdn) {
		calculate_qty_received(frm, cdt, cdn);
	},
});

function calculate_qty_received(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "qty_received", flt(row.packing) * flt(row.no_of_unit));
}

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
