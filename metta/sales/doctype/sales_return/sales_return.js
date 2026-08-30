// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Return", {
	setup(frm) {
		// Services aren't stocked and Assets aren't dispensed to patients -
		// only Medicine/Consumable make sense to return here.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]], item_group: "Pharmacy Store", is_active: 1 },
		}));
		// Only show bills/issues belonging to the selected patient, so the
		// picker doesn't force scrolling through every patient's documents.
		frm.set_query("against_sales_bill", () => {
			if (!frm.doc.patient) return {};
			return { filters: { patient: frm.doc.patient, docstatus: 1 } };
		});
		frm.set_query("against_material_issue", () => {
			if (!frm.doc.patient) return {};
			return { filters: { visit_reference: frm.doc.patient, docstatus: 1 } };
		});
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.returned_by) {
			frm.set_value("returned_by", frappe.session.user);
		}
		calculate_total(frm);
	},
	patient(frm) {
		// Prefill with the patient's most recent bill/issue as a starting
		// point - still just a convenience, not a lock; staff can pick a
		// different one via the (patient-filtered) link query if needed.
		frm.set_value("against_sales_bill", "");
		frm.set_value("against_material_issue", "");
		if (!frm.doc.patient) return;

		frappe.db
			.get_list("Billing", {
				filters: { patient: frm.doc.patient, docstatus: 1 },
				fields: ["name"],
				order_by: "sale_datetime desc",
				limit: 1,
			})
			.then((rows) => {
				if (rows.length) frm.set_value("against_sales_bill", rows[0].name);
			});

		frappe.db
			.get_list("Material Issue", {
				filters: { visit_reference: frm.doc.patient, docstatus: 1 },
				fields: ["name"],
				order_by: "issue_date_time desc",
				limit: 1,
			})
			.then((rows) => {
				if (rows.length) frm.set_value("against_material_issue", rows[0].name);
			});
	},
	against_sales_bill(frm) {
		// A refund normally goes back the same way it was collected - still
		// just a starting point, staff can pick a different Payment Mode if
		// this particular refund is actually being handled differently.
		// Billing's Payment Mode has finer options (Cash/UPI/Card/Credit -
		// Corporate) than this doctype's plain Cash/Credit, so it's mapped
		// down rather than copied directly.
		if (!frm.doc.against_sales_bill) return;
		frappe.db.get_value("Billing", frm.doc.against_sales_bill, "payment_mode", (r) => {
			if (!r || !r.payment_mode) return;
			frm.set_value("payment_mode", r.payment_mode === "Credit - Corporate" ? "Credit" : "Cash");
		});
	},
});

frappe.ui.form.on("Sales Return Item", {
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "item_name", "");
			frappe.model.set_value(cdt, cdn, "batch", "");
			frappe.model.set_value(cdt, cdn, "rate", 0);
			return;
		}
		frappe.db.get_value("Item", row.item, "item_name", (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
		});
		// If this Item already has a Batch on record, pre-fill it as a
		// convenience - still just a starting point, not a lock; change it
		// if this return is actually a different batch than what's on record.
		// Rate follows whichever batch ends up set (below), since price is
		// per-batch, not a fixed Item-level number.
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
	batch(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.batch) {
			frappe.model.set_value(cdt, cdn, "rate", 0);
			return;
		}
		frappe.db.get_value("Batch", row.batch, "selling_rate", (r) => {
			frappe.model.set_value(cdt, cdn, "rate", flt(r.selling_rate));
		});
	},
	qty_returned(frm, cdt, cdn) {
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
	frappe.model.set_value(cdt, cdn, "amount", flt(row.qty_returned) * flt(row.rate));
	calculate_total(frm);
}

function calculate_total(frm) {
	const total = (frm.doc.items || []).reduce((sum, row) => sum + flt(row.amount), 0);
	frm.set_value("total_value", total);
}
