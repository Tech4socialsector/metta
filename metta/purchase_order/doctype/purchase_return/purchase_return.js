// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Return", {
	setup(frm) {
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
	quality_inspection(frm) {
		// Toolbar buttons are only (re)built on refresh, so without this the
		// "Get Rejected Items" button wouldn't appear until the next save/reload.
		frm.refresh();
	},
	refresh(frm) {
		calculate_total(frm);

		if (frm.doc.docstatus === 0 && frm.doc.quality_inspection) {
			// The Quality Inspection is what actually determined a rejection
			// happened and how much/why - Purchase Receipt only ever recorded
			// what physically arrived. This pulls the rejected rows straight
			// from the inspection instead of re-entering them by hand.
			frm.add_custom_button(__("Get Rejected Items"), () => {
				frappe.call({
					method:
						"metta.purchase_order.doctype.purchase_return.purchase_return.get_existing_return_for_quality_inspection",
					args: { quality_inspection: frm.doc.quality_inspection },
					callback(r) {
						if (r.message && r.message !== frm.doc.name) {
							frappe.msgprint(
								__("Purchase Return {0} already exists for this Quality Inspection.", [r.message])
							);
							return;
						}
						frappe.call({
							method:
								"metta.purchase_order.doctype.purchase_return.purchase_return.get_return_details_from_quality_inspection",
							args: { quality_inspection: frm.doc.quality_inspection },
							callback(res) {
								const details = res.message || {};
								if (!details.items || !details.items.length) {
									frappe.msgprint(__("No rejected items found on this Quality Inspection."));
									return;
								}
								frm.set_value("supplier", details.supplier);
								frm.set_value("against_purchase_receipt", details.against_purchase_receipt);
								frm.set_value("from_warehouse", details.from_warehouse);
								frm.clear_table("items");
								details.items.forEach((row) => frm.add_child("items", row));
								frm.refresh_field("items");
								calculate_total(frm);
								frappe.show_alert({
									message: __("{0} rejected item(s) pulled in from the Quality Inspection.", [
										details.items.length,
									]),
									indicator: "green",
								});
							},
						});
					},
				});
			}).addClass("btn-primary");
		}

		if (frm.doc.docstatus !== 1) return;

		if (frm.doc.status === "Submitted") {
			// A supplier resolves a return one of two ways - credit back, or
			// send replacement stock - one button prompts which one actually
			// happened instead of cluttering the toolbar with two.
			frm.add_custom_button(__("Mark Resolved"), () => {
				frappe.prompt(
					[
						{
							fieldname: "resolution",
							label: __("How was this resolved?"),
							fieldtype: "Select",
							options: "Credit Received\nReplacement Sent",
							reqd: 1,
						},
					],
					(values) => {
						const method =
							values.resolution === "Credit Received" ? "mark_credit_received" : "mark_replacement_sent";
						frm.call(method).then(() => frm.reload_doc());
					},
					__("Mark Purchase Return Resolved")
				);
			}).addClass("btn-primary");
		}

		if (frm.doc.status === "Replacement Pending") {
			frm.add_custom_button(__("Create Purchase Receipt"), () => {
				frappe.call({
					method:
						"metta.purchase_order.doctype.purchase_return.purchase_return.get_replacement_receipt_details",
					args: { purchase_return: frm.doc.name },
					callback(r) {
						const details = r.message;
						frappe.new_doc("Purchase Receipt", {
							supplier: details.supplier,
							purchase_order: details.purchase_order,
							receiving_warehouse: details.receiving_warehouse,
							replacement_for: details.replacement_for,
						}).then(() => {
							const new_frm = cur_frm;
							new_frm.clear_table("items");
							details.items.forEach((row) => new_frm.add_child("items", row));
							new_frm.refresh_field("items");
							new_frm.dirty();
							frappe.show_alert({
								message: __("{0} item(s) pulled in - fill in Batch No and Expiry Date once the replacement arrives.", [
									details.items.length,
								]),
								indicator: "green",
							});
						});
					},
				});
			}).addClass("btn-primary");
		}
	},
});

frappe.ui.form.on("Purchase Return Item", {
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "item_name", "");
			frappe.model.set_value(cdt, cdn, "rate", 0);
			return;
		}
		frappe.db.get_value("Item", row.item, "item_name", (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
		// Rate is what was actually paid on the original Purchase Order - it
		// can't be a plain fetch_from since it depends on both the Item and
		// which Purchase Receipt this return is against.
		if (frm.doc.against_purchase_receipt) {
			frappe.call({
				method: "metta.purchase_order.doctype.purchase_return.purchase_return.get_rate_for_item",
				args: { against_purchase_receipt: frm.doc.against_purchase_receipt, item: row.item },
				callback(r) {
					frappe.model.set_value(cdt, cdn, "rate", flt(r.message));
					calculate_amount(frm, cdt, cdn);
				},
			});
			// Qty Returned is in the same Purchase UOM the item was received
			// in - the conversion factor to Stock UOM has to come from that
			// same Purchase Receipt, not guessed from the Item master alone.
			frappe.call({
				method: "metta.purchase_order.doctype.purchase_return.purchase_return.get_uom_details_for_item",
				args: { against_purchase_receipt: frm.doc.against_purchase_receipt, item: row.item },
				callback(r) {
					const details = r.message || {};
					frappe.model.set_value(cdt, cdn, "unit_of_measure", details.unit_of_measure || "");
					frappe.model.set_value(cdt, cdn, "conversion_factor", flt(details.conversion_factor) || 1);
					calculate_stock_qty(frm, cdt, cdn);
				},
			});
		}
	},
	qty_returned(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
		calculate_stock_qty(frm, cdt, cdn);
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

function calculate_stock_qty(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "stock_qty", flt(row.qty_returned) * (flt(row.conversion_factor) || 1));
}

function calculate_total(frm) {
	const total = (frm.doc.items || []).reduce((sum, row) => sum + flt(row.amount), 0);
	frm.set_value("total_credit_amount", total);
}
