// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Billing", {
	setup(frm) {
		// Picking Bill Type first narrows this to just the relevant items -
		// Pharmacy shows medicines/consumables, Service shows only services -
		// so Billing isn't hunting through the whole Item master to find what
		// they actually need. Left blank (or "Mixed", for a bill auto-created
		// from a consultation with both), it falls back to showing everything -
		// never a fixed asset either way, that's never billed to a patient.
		frm.set_query("item", "items", () => {
			const by_bill_type = {
				Pharmacy: ["Medicine", "Consumable"],
				Service: ["Service"],
			};
			return {
				filters: { item_type: ["in", by_bill_type[frm.doc.bill_type] || ["Medicine", "Consumable", "Service"]] },
			};
		});
		// Central Store only ever receives from suppliers and distributes to
		// sub-stores - it never dispenses directly to a patient, so it has no
		// business being billed from here.
		frm.set_query("warehouse", () => ({
			filters: { warehouse_type: ["!=", "Central Store"] },
		}));
	},
	refresh(frm) {
		// billing_category can already be set when the form first loads (an
		// existing bill, or one prefilled by the Pharmacy Dashboard's Dispense
		// action) without the field's own change handler ever having fired to
		// populate frm._category_adjustment - fetch it now so the discount
		// preview isn't stuck showing zero until the user re-touches the field.
		if (frm.doc.billing_category && !frm._category_adjustment) {
			frappe.call({
				method: "metta.sales.doctype.billing.billing.get_category_adjustment",
				args: { billing_category: frm.doc.billing_category },
				callback(r) {
					frm._category_adjustment = r.message || null;
					calculate_totals(frm);
				},
			});
		} else {
			calculate_totals(frm);
		}

		// Same reasoning as billing_category above - an existing bill loads
		// with `patient` already set but this form's own patient(frm) handler
		// never fired, so the advance balance (and its button) would otherwise
		// stay missing until the user re-picks the patient by hand.
		if (frm.doc.patient && !frm._advance_balance) {
			frappe.call({
				method: "metta.sales.doctype.patient_advance.patient_advance.get_advance_balance",
				args: { patient_visit: frm.doc.patient },
				callback(r) {
					frm._advance_balance = r.message || null;
					add_advance_button(frm);
				},
			});
		} else {
			add_advance_button(frm);
		}
	},
	// Patient Visit doesn't carry the patient's actual name itself -
	// only a link (uhin_id) to the demographics record that does, so this
	// can't be a plain fetch_from.
	patient(frm) {
		frm.clear_custom_buttons();
		frm._advance_balance = null;
		if (!frm.doc.patient) {
			frm.set_value("customer_name", "");
			calculate_totals(frm);
			return;
		}
		frappe.call({
			method: "metta.sales.doctype.billing.billing.get_patient_name",
			args: { patient: frm.doc.patient },
			callback(r) {
				frm.set_value("customer_name", r.message || "");
			},
		});
		offer_pending_consultations(frm);
		frappe.call({
			method: "metta.sales.doctype.patient_advance.patient_advance.get_advance_balance",
			args: { patient_visit: frm.doc.patient },
			callback(r) {
				frm._advance_balance = r.message || null;
				add_advance_button(frm);
				calculate_totals(frm);
			},
		});
	},
	discount_percent(frm) {
		calculate_totals(frm);
	},
	payment_mode(frm) {
		calculate_totals(frm);
	},
	advance_adjusted(frm) {
		calculate_totals(frm);
	},
	// billing_category is itself a fetch_from off "patient" - its change event
	// still fires normally (this is a plain top-level field, not a grid row),
	// so this catches it either way: picked by hand, or arriving via the
	// patient fetch.
	billing_category(frm) {
		if (!frm.doc.billing_category) {
			frm._category_adjustment = null;
			calculate_totals(frm);
			return;
		}
		frappe.call({
			method: "metta.sales.doctype.billing.billing.get_category_adjustment",
			args: { billing_category: frm.doc.billing_category },
			callback(r) {
				frm._category_adjustment = r.message || null;
				calculate_totals(frm);
			},
		});
	},
});

frappe.ui.form.on("Sales Bill Item", {
	// fetch_from only pre-fills the collapsed grid row's display, not the
	// stored value - same issue already hit on Purchase Order/Purchase
	// Receipt, so UOM, Rate and GST % are fetched explicitly here instead.
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "uom", "");
			frappe.model.set_value(cdt, cdn, "item_name", "");
			return;
		}
		frappe.db.get_value(
			"Item",
			row.item,
			["sale_uom", "standard_selling_rate", "gst_percent", "item_name"],
			(r) => {
				frappe.model.set_value(cdt, cdn, "uom", r.sale_uom || "");
				frappe.model.set_value(cdt, cdn, "rate", flt(r.standard_selling_rate));
				frappe.model.set_value(cdt, cdn, "gst_percent", flt(r.gst_percent));
				frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
			}
		);
	},
	qty(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	rate(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	gst_percent(frm) {
		calculate_totals(frm);
	},
	items_add(frm) {
		calculate_totals(frm);
	},
	items_remove(frm) {
		calculate_totals(frm);
	},
});

function calculate_amount(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const amount = flt(row.qty) * flt(row.rate);
	frappe.model.set_value(cdt, cdn, "amount", amount);
	calculate_totals(frm);
}

function calculate_totals(frm) {
	// Mirrors the server's validate() exactly: an Inactive category (or one
	// with no adjustment_type) contributes nothing, and "Increase" flips the
	// sign so it grows the bill instead of shrinking it.
	const adjustment = frm._category_adjustment;
	const adjustment_type =
		adjustment && adjustment.discount_status === "Active" ? adjustment.adjustment_type : null;
	const raw_percent = ["Discount", "Increase"].includes(adjustment_type) ? flt(frm.doc.discount_percent) : 0;
	const signed_percent = adjustment_type === "Increase" ? -raw_percent : raw_percent;

	let subtotal = 0;
	let gst_total = 0;

	(frm.doc.items || []).forEach((row) => {
		const amount = flt(row.amount);
		const taxable_value = amount * (1 - signed_percent / 100);
		const gst_amount = (taxable_value * flt(row.gst_percent)) / 100;
		frappe.model.set_value(row.doctype, row.name, "gst_amount", gst_amount);
		subtotal += amount;
		gst_total += gst_amount;
	});

	const discount_amount = (subtotal * signed_percent) / 100;
	const net_amount = subtotal - discount_amount + gst_total;
	frm.set_value("subtotal", subtotal);
	frm.set_value("discount_amount", discount_amount);
	frm.set_value("gst_amount", gst_total);

	frm.set_value("net_amount", net_amount);

	// Mirrors validate_advance_adjustment() on the server - just a preview,
	// the save is what actually enforces the balance cap.
	const previous_amount_due = flt(frm.doc.amount_due);
	const new_amount_due = flt(frm.doc.net_amount) - flt(frm.doc.advance_adjusted);
	frm.set_value("amount_due", new_amount_due);

	// Defaults to fully collected - staff reduce this by hand only for a
	// genuine partial payment, as the LAST step before submitting. Only reset
	// it when Amount Due itself actually changed (a real edit - items,
	// discount, advance) - calculate_totals() also runs on every refresh()
	// (e.g. right after Save, when the form re-renders), and resetting
	// unconditionally there would silently wipe out a partial payment the
	// moment the page redraws, even though nothing was actually edited.
	if (new_amount_due !== previous_amount_due) {
		frm.set_value("amount_collected", new_amount_due);
	}
}

function add_advance_button(frm) {
	const balance = frm._advance_balance && flt(frm._advance_balance.balance);
	if (!balance || balance <= 0) return;
	frm.add_custom_button(__("Apply Advance"), () => {
		const amount = Math.min(balance, flt(frm.doc.net_amount));
		frm.set_value("advance_adjusted", amount);
	});
}

function offer_pending_consultations(frm) {
	frappe.call({
		method: "metta.sales.doctype.billing.billing.get_unbilled_consultations_for_patient",
		args: { patient: frm.doc.patient },
		callback(r) {
			const consultations = r.message || [];
			if (!consultations.length) return;

			// One click either way - straight to loading if there's only one
			// consultation waiting, or a quick pick if there's more than one -
			// rather than making Billing go find and open it themselves.
			if (consultations.length === 1) {
				const c = consultations[0];
				frm.add_custom_button(__("Load Prescribed Items ({0})", [c.name]), () =>
					load_consultation_items(frm, c.name)
				).addClass("btn-primary");
			} else {
				// Consultation names never contain " - ", so splitting on the
				// first one to recover the name back out is safe - simpler
				// than a Link field, which would just re-show the same list
				// this button already fetched.
				const option_for = (c) => `${c.name} - ${frappe.datetime.str_to_user(c.consultation_datetime)} - ${c.doctor}`;
				frm.add_custom_button(__("Load Prescribed Items..."), () => {
					const dialog = new frappe.ui.Dialog({
						title: __("Which consultation?"),
						fields: [
							{
								fieldtype: "Select",
								fieldname: "consultation",
								label: __("Consultation"),
								options: consultations.map(option_for),
							},
						],
						primary_action_label: __("Load"),
						primary_action(values) {
							dialog.hide();
							load_consultation_items(frm, values.consultation.split(" - ")[0]);
						},
					});
					dialog.show();
				}).addClass("btn-primary");
			}
		},
	});
}

function load_consultation_items(frm, consultation) {
	frappe.call({
		method: "metta.sales.doctype.billing.billing.get_billing_items_for_consultation",
		args: { consultation },
		callback(r) {
			if (!r.message) return;
			const data = r.message;
			frm.set_value("doctor_consultation", consultation);
			frm.set_value("prescribed_by", data.doctor);
			frm.set_value("billing_category", data.billing_category);
			frm.set_value("bill_type", data.bill_type);
			// A brand-new Billing starts with one blank row the grid adds on
			// its own - loading the prescribed items should replace that, not
			// leave it sitting there as an extra row with no Item on it.
			frm.doc.items = (frm.doc.items || []).filter((row) => row.item);
			// A full prefill (item, rate, uom, gst, amount) rather than just
			// the item code - child-row fetch_from/change-handlers don't fire
			// for values set this way, so everything Billing needs to see is
			// filled in directly.
			data.items.forEach((i) => {
				const row = frm.add_child("items");
				row.item = i.item;
				row.item_name = i.item_name;
				row.qty = i.qty;
				row.uom = i.uom;
				row.rate = i.rate;
				row.gst_percent = i.gst_percent;
				row.amount = i.amount;
			});
			frm.refresh_field("items");
			// Only "Load Prescribed Items" itself is meant to go away once used -
			// but clear_custom_buttons() removes every button, so Apply Advance
			// (added earlier by the patient(frm) handler) has to be put back
			// here, using the already-cached balance rather than refetching it.
			frm.clear_custom_buttons();
			add_advance_button(frm);
			calculate_totals(frm);
		},
	});
}
