// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Return", {
	setup(frm) {
		// Services aren't stocked and Assets aren't dispensed to patients -
		// only Medicine/Consumable make sense to return here.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable"]] },
		}));
		// Only show bills/issues belonging to the selected patient, so the
		// picker doesn't force scrolling through every patient's documents -
		// which field to filter on depends on which type is currently chosen.
		frm.set_query("against_document", () => {
			if (!frm.doc.source_type || !frm.doc.patient) return {};
			if (frm.doc.source_type === "Sales Bill") {
				return { filters: { patient: frm.doc.patient, docstatus: 1 } };
			}
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
		// Prefill with the patient's single most recent bill/issue (whichever
		// type that turns out to be) as a starting point - still just a
		// convenience, not a lock; staff can pick a different one via the
		// (patient-filtered) link query if needed.
		frm.set_value("source_type", "");
		frm.set_value("against_document", "");
		if (!frm.doc.patient) return;

		Promise.all([
			frappe.db.get_list("Sales Bill", {
				filters: { patient: frm.doc.patient, docstatus: 1 },
				fields: ["name", "sale_datetime"],
				order_by: "sale_datetime desc",
				limit: 1,
			}),
			frappe.db.get_list("Material Issue", {
				filters: { visit_reference: frm.doc.patient, docstatus: 1 },
				fields: ["name", "issue_date_time"],
				order_by: "issue_date_time desc",
				limit: 1,
			}),
		]).then(([bills, issues]) => {
			const bill = bills[0];
			const issue = issues[0];
			if (!bill && !issue) return;
			const use_bill = bill && (!issue || bill.sale_datetime >= issue.issue_date_time);
			// source_type's own change-trigger clears against_document (see
			// below) - awaiting it here means that clear runs BEFORE this sets
			// the real value, instead of racing it and wiping it out after.
			if (use_bill) {
				frm.set_value("source_type", "Sales Bill").then(() => {
					frm.set_value("against_document", bill.name).then(() => {
						// Changing source_type rebuilds the Dynamic Link's input
						// control - without this, the value is set on the doc
						// but the box on screen can be left showing empty.
						frm.refresh_field("against_document");
					});
				});
			} else {
				frm.set_value("source_type", "Material Issue").then(() => {
					frm.set_value("against_document", issue.name).then(() => {
						frm.refresh_field("against_document");
					});
				});
			}
		});
	},
	source_type(frm) {
		// Whatever was picked under the previous type doesn't belong to the
		// new one - clear it rather than leave a mismatched value sitting there.
		// (The patient handler above awaits this before setting a fresh value,
		// so a real auto-fetched ID never gets wiped out by this.)
		frm.set_value("against_document", "");
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
		frappe.db.get_value("Item", row.item, ["item_name", "standard_selling_rate"], (r) => {
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
			frappe.model.set_value(cdt, cdn, "rate", flt(r.standard_selling_rate));
		});
		// If this Item already has a Batch on record, pre-fill it as a
		// convenience - still just a starting point, not a lock; change it
		// if this return is actually a different batch than what's on record.
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
