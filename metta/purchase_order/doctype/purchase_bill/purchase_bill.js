// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Bill", {
	setup(frm) {
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]], item_group: "Pharmacy Store", is_active: 1 },
		}));
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.entered_by) {
			frm.set_value("entered_by", frappe.session.user);
		}
		calculate_totals(frm);
		show_get_items_button(frm);
		show_create_payment_entry_button(frm);
		show_approve_reject_buttons(frm);
		show_cancel_approval_button(frm);
	},
	purchase_receipt(frm) {
		frm.refresh();
	},
	tax_on_free(frm) {
		calculate_totals(frm);
	},
});

frappe.ui.form.on("Purchase Bill Item", {
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
	packing(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	no_of_unit(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	free(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	amount(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	discount_percent(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	gst_percent(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	mrp(frm, cdt, cdn) {
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

	// The button always clears the table before repopulating, so once real
	// items are already present, showing it again would only risk wiping out
	// billing work already entered.
	const has_real_items = (frm.doc.items || []).some((row) => row.item);
	if (has_real_items) return;

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
					message: __(
						"{0} item(s) pulled in - enter Free, P Rate, Discount and MRP for each.",
						[rows.length]
					),
					indicator: "green",
				});
			},
		});
	}).addClass("btn-primary");
}

function show_approve_reject_buttons(frm) {
	if (frm.doc.docstatus !== 1 || frm.doc.status !== "Pending Approval") return;

	// The real gate is server-side (validate_can_approve) - this just avoids
	// showing a button that would only error out for someone without the
	// role, like Account Staff who created the bill.
	const can_approve = frappe.user_roles.includes("Purchase Approver") || frappe.user_roles.includes("System Manager");
	if (!can_approve) return;

	frm.add_custom_button(__("Approve"), () => {
		frm.call("approve_bill").then(() => frm.reload_doc());
	}).addClass("btn-primary");
	frm.add_custom_button(__("Reject"), () => {
		frappe.prompt(
			[
				{
					fieldname: "reason",
					label: __("Rejection Reason"),
					fieldtype: "Small Text",
					reqd: 1,
				},
			],
			(values) => {
				frm.call("reject_bill", { reason: values.reason }).then(() => frm.reload_doc());
			},
			__("Reject Purchase Bill")
		);
	});
}

function show_cancel_approval_button(frm) {
	if (frm.doc.docstatus !== 1 || frm.doc.status !== "Approved") return;

	const can_approve = frappe.user_roles.includes("Purchase Approver") || frappe.user_roles.includes("System Manager");
	if (!can_approve) return;

	// Undoes just the approval (reverses the stock it added, back to Pending
	// Approval) - the Purchase Bill document itself stays submitted and
	// linked everywhere it already is. Use the document's own Cancel instead
	// if the whole bill needs to be voided, not just the approval.
	frm.add_custom_button(__("Cancel Approval"), () => {
		frappe.confirm(
			__("This reverses the stock that was added and puts the bill back to Pending Approval. Continue?"),
			() => frm.call("cancel_approval").then(() => frm.reload_doc())
		);
	});
}

function show_create_payment_entry_button(frm) {
	// Multiple partial payments against the same bill are expected (pay 40
	// now, 60 later) - no duplicate check needed here, unlike the other
	// "Create X" buttons that should only ever produce one linked document.
	if (frm.doc.docstatus !== 1 || flt(frm.doc.balance_due) <= 0) return;
	// Store/Purchase/Warehouse staff can all view an approved bill, but
	// recording payment is Account Staff's job - hide the button rather than
	// let them hit a permission error only after opening the form.
	if (!frappe.model.can_create("Payment Entry")) return;

	frm.add_custom_button(__("Create Payment Entry"), () => {
		frappe.new_doc("Payment Entry", {
			purchase_bill: frm.doc.name,
			amount_paid: frm.doc.balance_due,
			paid_by: frappe.session.user,
		});
	}).addClass("btn-primary");
}

function calculate_amount(frm, cdt, cdn) {
	const row = locals[cdt][cdn];

	const qty = flt(row.packing) * flt(row.no_of_unit);
	frappe.model.set_value(cdt, cdn, "qty", qty);

	// Taxable Amount is entered directly, matching the supplier invoice's
	// own Taxable Amount column - P Rate per single tablet/unit is worked
	// out backward from it, not typed in. Free strips are converted to
	// tablets so they can be netted out of Qty in the same units.
	const free_qty = flt(row.free) * flt(row.packing);
	const billable_qty = qty - free_qty;
	const amount = flt(row.amount);
	const purchase_rate = billable_qty ? amount / billable_qty : 0;

	// Discount is entered as a % of the Taxable Amount - the ₹ value is
	// calculated from it, same as the supplier invoice shows both the % and
	// the resulting amount.
	const discount = (amount * flt(row.discount_percent)) / 100;

	// GST is calculated on Amount net of Discount, same as the supplier
	// invoice - Amount itself still shows the full gross value (matches the
	// invoice's own Taxable Amount column), but the tax is worked out on
	// what's actually being paid for it.
	const taxable_value = amount - discount;
	const gst_amount = (taxable_value * flt(row.gst_percent)) / 100;
	const cgst_amount = gst_amount / 2;
	const sgst_amount = gst_amount / 2;
	const igst_amount = flt(row.igst_amount); // not wired up yet - inter-state, add later

	// Landed cost per tablet/unit, net of discount, including GST.
	const discount_per_unit = qty ? discount / qty : 0;
	const net_rate = purchase_rate - discount_per_unit;
	const purchase_cost = net_rate * (1 + flt(row.gst_percent) / 100);

	frappe.model.set_value(cdt, cdn, "purchase_rate", purchase_rate);
	frappe.model.set_value(cdt, cdn, "discount", discount);
	frappe.model.set_value(cdt, cdn, "purchase_cost", purchase_cost);
	frappe.model.set_value(cdt, cdn, "gst_amount", gst_amount);
	frappe.model.set_value(cdt, cdn, "cgst_rate", flt(row.gst_percent) / 2);
	frappe.model.set_value(cdt, cdn, "cgst_amount", cgst_amount);
	frappe.model.set_value(cdt, cdn, "sgst_rate", flt(row.gst_percent) / 2);
	frappe.model.set_value(cdt, cdn, "sgst_amount", sgst_amount);
	frappe.model.set_value(cdt, cdn, "total_amount", taxable_value + cgst_amount + sgst_amount + igst_amount);

	// Selling side - what the hospital will charge the patient per
	// tablet/unit, previewed here so Selling Rate never has to be typed a
	// second time on the Item itself (pushed there on approval). Selling
	// GST % always mirrors GST % above - entered once, never typed twice.
	frappe.model.set_value(cdt, cdn, "selling_gst_percent", flt(row.gst_percent));
	const packing_mrp = flt(row.mrp) * flt(row.packing);
	const single_tablet_price = flt(row.mrp);
	const selling_gst_amount = (single_tablet_price * flt(row.gst_percent)) / 100;
	frappe.model.set_value(cdt, cdn, "packing_mrp", packing_mrp);
	frappe.model.set_value(cdt, cdn, "single_tablet_price", single_tablet_price);
	frappe.model.set_value(cdt, cdn, "selling_gst_amount", selling_gst_amount);
	frappe.model.set_value(cdt, cdn, "selling_cgst_amount", selling_gst_amount / 2);
	frappe.model.set_value(cdt, cdn, "selling_sgst_amount", selling_gst_amount / 2);
	frappe.model.set_value(cdt, cdn, "final_selling_price", single_tablet_price + selling_gst_amount);

	calculate_totals(frm);
}

function calculate_totals(frm) {
	let subtotal = 0;
	let discount_total = 0;
	let gst_total = 0;
	(frm.doc.items || []).forEach((row) => {
		subtotal += flt(row.amount);
		discount_total += flt(row.discount);
		gst_total += flt(row.gst_amount);
	});
	frm.set_value("subtotal", subtotal);
	frm.set_value("discount", discount_total);
	frm.set_value("gst_amount", gst_total);

	const net_before_round = subtotal - discount_total + flt(frm.doc.tax_on_free) + gst_total;
	const round_off = Math.round(net_before_round) - net_before_round;
	frm.set_value("round_off", round_off);
	frm.set_value("total_amount", net_before_round + round_off);
}
