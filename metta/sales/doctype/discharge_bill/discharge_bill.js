// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Discharge Bill", {
	setup(frm) {
		frm.set_query("op_id", () => ({ filters: { registration_category: "OP" } }));
		frm.set_query("ip_id", () => ({ filters: { registration_category: "IP" } }));
		// Same fix as Billing's OP ID / IP ID - Patient Visit's doctype-wide
		// "show title instead of ID" setting would otherwise replace these
		// with the patient's name; Patient Name below already covers that.
		// is_title_link() itself is left alone (not overridden) so the search
		// dropdown still shows the ID as its description line under the
		// name - only what ends up shown once picked is overridden here.
		frm.fields_dict.op_id.set_link_title = function (value) {
			this.translate_and_set_input_value(value, value);
		};
		frm.fields_dict.ip_id.set_link_title = function (value) {
			this.translate_and_set_input_value(value, value);
		};
		const show_id_not_title = function (value) {
			value = this.value || value;
			const doc = this.doc || (this.frm && this.frm.doc);
			const display_value = frappe.format(value, this.df, { no_icon: true, inline: true, label: value }, doc);
			if (this.disp_area) $(this.disp_area).html(display_value);
		};
		frm.fields_dict.op_id.set_disp_area = show_id_not_title;
		frm.fields_dict.ip_id.set_disp_area = show_id_not_title;
	},
	refresh(frm) {
		// Only meaningful once saved (frm.doc.name is a real document to
		// render) - same "dialog with a Print button" pattern already used
		// for Patient Visit's Receipt Preview / Doctor Consultation's Print
		// Prescription, rather than frm.print_doc()'s full-page navigation.
		if (frm.is_new()) return;
		frm.add_custom_button(__("Print Bill"), () => {
			frappe.call({
				method: "metta.sales.doctype.discharge_bill.discharge_bill.get_print_html",
				args: { discharge_bill: frm.doc.name },
				callback(r) {
					if (!r.message) return;
					const bill_html = r.message;
					const dialog = new frappe.ui.Dialog({
						title: __("Discharge Bill"),
						size: "large",
						fields: [{ fieldtype: "HTML", fieldname: "discharge_bill_preview", options: bill_html }],
						primary_action_label: __("Print"),
						primary_action() {
							const print_window = window.open("", "_blank");
							print_window.document.write(
								`<html><head><title>${frappe.utils.escape_html(
									frm.doc.name
								)}</title></head><body>${bill_html}</body></html>`
							);
							print_window.document.close();
							print_window.focus();
							print_window.print();
						},
					});
					dialog.show();
				},
			});
		}).addClass("btn-primary");
	},
	op_id(frm) {
		if (!frm.doc.op_id) {
			if (!frm.doc.ip_id) frm.set_value("ip_id", "");
			return;
		}
		frappe.call({
			method: "metta.sales.doctype.billing.billing.get_ip_id_for_op",
			args: { op_id: frm.doc.op_id },
			callback(r) {
				if (r.message) frm.set_value("ip_id", r.message);
			},
		});
	},
	ip_id(frm) {
		if (!frm.doc.ip_id) {
			frm.clear_table("bill_items");
			frm.refresh_field("bill_items");
			["total_billed", "advance_paid", "advance_adjusted", "amount_collected", "balance_due"].forEach((f) =>
				frm.set_value(f, 0)
			);
			return;
		}
		frappe.call({
			method: "metta.sales.doctype.billing.billing.get_op_id_for_ip",
			args: { ip_id: frm.doc.ip_id },
			callback(r) {
				if (r.message) frm.set_value("op_id", r.message);
			},
		});
		frappe.call({
			method: "metta.sales.doctype.discharge_bill.discharge_bill.preview_discharge_bill",
			args: { ip_id: frm.doc.ip_id },
			callback(r) {
				const data = r.message;
				if (!data) return;
				frm.clear_table("bill_items");
				data.bill_items.forEach((row) => {
					const child = frm.add_child("bill_items");
					Object.assign(child, row);
				});
				frm.refresh_field("bill_items");
				frm.set_value("total_billed", data.total_billed);
				frm.set_value("advance_paid", data.advance_paid);
				frm.set_value("advance_adjusted", data.advance_adjusted);
				frm.set_value("amount_collected", data.amount_collected);
				frm.set_value("balance_due", data.balance_due);
			},
		});
	},
});
