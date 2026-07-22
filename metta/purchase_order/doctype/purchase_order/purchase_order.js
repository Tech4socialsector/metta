// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Order", {
	refresh(frm) {
		calculate_total(frm);
		if (frm.doc.docstatus !== 1) return;

		if (frm.doc.status === "Pending Approval") {
			frm.add_custom_button(__("Approve"), () => {
				frm.call("approve_order").then(() => frm.reload_doc());
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
						frm.call("reject_order", { reason: values.reason }).then(() => frm.reload_doc());
					},
					__("Reject Purchase Order")
				);
			});
		}

		if (frm.doc.status === "Approved") {
			frm.add_custom_button(__("Mark Sent to Dealer"), () => {
				frm.call("mark_sent_to_dealer").then(() => frm.reload_doc());
			}).addClass("btn-primary");
		}

		if (frm.doc.status === "Received") {
			frm.add_custom_button(__("Close Order"), () => {
				frm.call("close_order").then(() => frm.reload_doc());
			}).addClass("btn-primary");
		}
	},
});

frappe.ui.form.on("Purchase Order Item", {
	// fetch_from only pre-fills the collapsed grid row's display, not the
	// stored value (same issue we hit on Purchase Receipt Item's Unit of
	// Measure) - so Unit of Measure and Rate are fetched explicitly here to
	// make sure they're actually saved, not just previewed.
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "unit_of_measure", "");
			return;
		}
		frappe.db.get_value("Medicine Item", row.item, ["purchase_uom", "standard_purchase_rate"], (r) => {
			frappe.model.set_value(cdt, cdn, "unit_of_measure", r.purchase_uom || "");
			frappe.model.set_value(cdt, cdn, "rate", flt(r.standard_purchase_rate));
		});
	},
	qty_ordered(frm, cdt, cdn) {
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
	frappe.model.set_value(cdt, cdn, "amount", flt(row.qty_ordered) * flt(row.rate));
	calculate_total(frm);
}

function calculate_total(frm) {
	const total = (frm.doc.items || []).reduce((sum, row) => sum + flt(row.amount), 0);
	frm.set_value("total_amount", total);
}
