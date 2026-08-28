// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Billing", {
	setup(frm) {
		// Pharmacy Items and Service Items are two separate tables now - each
		// one's own picker only ever offers the item types that actually
		// belong there, so staff can't put a medicine in the service table
		// or a charge in the pharmacy table by mistake.
		// Custom query so typing a Chemical Term/Composition name (e.g.
		// "para") surfaces a matching item even when the brand name itself
		// doesn't contain it - staff often know the salt name, not the brand.
		frm.set_query("item", "pharmacy_items", () => ({
			query: "metta.master.doctype.item.item.item_query",
			filters: { item_type: ["in", ["Medicine", "Consumable"]] },
		}));
		frm.set_query("item", "service_items", () => ({
			query: "metta.master.doctype.item.item.item_query",
			filters: { item_type: "Service" },
		}));
		// Never let a row's batch belong to a different item - the field was
		// completely unrestricted before, which is how a mismatched batch
		// could accidentally get typed in.
		frm.set_query("batch_no", "pharmacy_items", (doc, cdt, cdn) => {
			const row = locals[cdt][cdn];
			return { filters: { item: row.item } };
		});
		// Custom queries so the dropdown shows the patient's name as a small
		// line under each ID - needed since Patient Visit's title (patient
		// name) would otherwise be the only thing shown while searching,
		// making same-named patients indistinguishable.
		frm.set_query("op_id", () => ({ query: "metta.sales.doctype.billing.billing.op_id_query" }));
		frm.set_query("ip_id", () => ({ query: "metta.sales.doctype.billing.billing.ip_id_query" }));
		// Once something's picked though, Patient Visit's doctype-wide "show
		// title instead of ID" setting would replace the input's own display
		// with the patient's name - overridden just for these two fields, to
		// keep is_title_link() itself (and so the dropdown's ID line above)
		// untouched, and only skip the title lookup for what ends up shown.
		frm.fields_dict.op_id.set_link_title = function (value) {
			this.translate_and_set_input_value(value, value);
		};
		frm.fields_dict.ip_id.set_link_title = function (value) {
			this.translate_and_set_input_value(value, value);
		};
		// A submitted/read-only doc renders this same field through a
		// completely different path (set_disp_area, not set_link_title) -
		// forcing options.label keeps the click-through link but shows the
		// ID as its text instead of the title formatter's usual pick.
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
		// An existing bill saved before OP ID / IP ID existed only has
		// `patient` on it - infer which box that belongs in so it doesn't
		// show up blank on reopening.
		if (frm.doc.patient && !frm.doc.op_id && !frm.doc.ip_id) {
			if (frm.doc.registration_category === "IP") {
				frm.set_value("ip_id", frm.doc.patient);
				frappe.db.get_value("Patient Visit", frm.doc.patient, "converted_from_registration", (r) => {
					if (r && r.converted_from_registration) frm.set_value("op_id", r.converted_from_registration);
				});
			} else {
				frm.set_value("op_id", frm.doc.patient);
			}
		}

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
					set_advance_balance_fields(frm);
				},
			});
		} else {
			add_advance_button(frm);
			set_advance_balance_fields(frm);
		}

		// Only IP admissions have a running stay of Billing entries worth
		// consolidating into one final bill - an OP visit is always just this
		// one bill on its own. Even then, the button only appears once the
		// doctor has actually completed the Discharge Summary - the clinical
		// sign-off has to come first, Billing can't hand over a "discharge"
		// bill before that's on record.
		if (!frm.is_new() && frm.doc.registration_category === "IP") {
			frappe.call({
				method: "metta.sales.doctype.billing.billing.has_discharge_summary",
				args: { patient_visit: frm.doc.patient },
				callback(r) {
					if (r.message) add_discharge_bill_button(frm);
				},
			});
		}

		// Quick-add widgets - only meaningful while the bill is still a draft
		// (their own depends_on already hides them once submitted; this just
		// skips wiring up event handlers on a widget nobody can see).
		if (frm.doc.docstatus === 0) {
			render_item_search(frm, {
				field: "pharmacy_item_search_area",
				table: "pharmacy_items",
				css_prefix: "billing-pharmacy",
				qty_label: __("Qty"),
				show_avail_qty: true,
			});
			render_item_search(frm, {
				field: "service_item_search_area",
				table: "service_items",
				css_prefix: "billing-service",
				qty_label: __("Qty"),
				show_avail_qty: false,
			});
		}
	},
	// Typing the OP ID auto-fills the IP ID the moment that OP visit has
	// actually been admitted - staff don't need to already know the IP
	// number to look it up. `patient` (hidden) is what actually drives
	// everything else, and is set here to whichever one currently applies -
	// the IP admission once it exists, otherwise the OP visit itself.
	op_id(frm) {
		if (!frm.doc.op_id) {
			if (!frm.doc.ip_id) frm.set_value("patient", "");
			return;
		}
		frappe.call({
			method: "metta.sales.doctype.billing.billing.get_ip_id_for_op",
			args: { op_id: frm.doc.op_id },
			callback(r) {
				if (r.message) {
					frm.set_value("ip_id", r.message);
					frm.set_value("patient", r.message);
				} else {
					frm.set_value("patient", frm.doc.op_id);
				}
			},
		});
	},
	// The common case for IP billing - typing the IP number directly still
	// surfaces the OP visit it came from, for reference.
	ip_id(frm) {
		if (!frm.doc.ip_id) {
			frm.set_value("patient", frm.doc.op_id || "");
			return;
		}
		frm.set_value("patient", frm.doc.ip_id);
		frappe.call({
			method: "metta.sales.doctype.billing.billing.get_op_id_for_ip",
			args: { ip_id: frm.doc.ip_id },
			callback(r) {
				if (r.message) frm.set_value("op_id", r.message);
			},
		});
	},
	// Patient Visit doesn't carry the patient's actual name itself -
	// only a link (uhin_id) to the demographics record that does, so this
	// can't be a plain fetch_from.
	patient(frm) {
		frm.clear_custom_buttons();
		frm._advance_balance = null;
		if (!frm.doc.patient) {
			frm.set_value("customer_name", "");
			set_advance_balance_fields(frm);
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
		add_admission_charge_if_due(frm);
		frappe.call({
			method: "metta.sales.doctype.patient_advance.patient_advance.get_advance_balance",
			args: { patient_visit: frm.doc.patient },
			callback(r) {
				frm._advance_balance = r.message || null;
				add_advance_button(frm);
				set_advance_balance_fields(frm);
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
	warehouse(frm) {
		// Items typed in before Warehouse was picked couldn't be batch-
		// allocated yet (no warehouse to check stock in) - resolve them now.
		// Only Pharmacy Items are ever batch-tracked - Service Items never
		// carry a batch_no at all.
		(frm.doc.pharmacy_items || []).forEach((row) => {
			if (row.item && row.qty && !row.batch_no) {
				maybe_allocate_batches(frm, row.doctype, row.name);
			}
		});
	},
});

frappe.ui.form.on("Sales Bill Item", {
	// fetch_from only pre-fills the collapsed grid row's display, not the
	// stored value - same issue already hit on Purchase Order/Purchase
	// Receipt, so UOM, Rate and GST % are fetched explicitly here instead.
	item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, "batch_no", "");
		if (!row.item) {
			frappe.model.set_value(cdt, cdn, "uom", "");
			frappe.model.set_value(cdt, cdn, "item_name", "");
			return;
		}
		frappe.db.get_value(
			"Item",
			row.item,
			["sale_uom", "standard_selling_rate", "gst_percent", "item_name", "item_type", "has_batch"],
			(r) => {
				frappe.model.set_value(cdt, cdn, "uom", r.sale_uom || "");
				frappe.model.set_value(cdt, cdn, "gst_percent", flt(r.gst_percent));
				frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
				frappe.model.set_value(cdt, cdn, "item_type", r.item_type || "");
				if (r.has_batch) {
					// Batch-specific pricing - rate is resolved once Qty is
					// also known and a batch (or split of batches) can be
					// worked out, not a fixed per-item number. Awaited so
					// maybe_allocate_batches' own "already resolved" guard
					// definitely sees batch_no cleared, not a stale value.
					frappe.model.set_value(cdt, cdn, "rate", 0).then(() => {
						maybe_allocate_batches(frm, cdt, cdn);
					});
				} else {
					// Services/Assets aren't batch-tracked - unchanged.
					frappe.model.set_value(cdt, cdn, "rate", flt(r.standard_selling_rate));
				}
			}
		);
	},
	qty(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
		maybe_allocate_batches(frm, cdt, cdn);
	},
	rate(frm, cdt, cdn) {
		calculate_amount(frm, cdt, cdn);
	},
	batch_no(frm, cdt, cdn) {
		// Covers a manual override - staff clearing an auto-picked batch and
		// choosing a different one themselves.
		const row = locals[cdt][cdn];
		if (!row.batch_no) return;
		frappe.db.get_value("Batch", row.batch_no, "selling_rate", (r) => {
			frappe.model.set_value(cdt, cdn, "rate", flt(r.selling_rate));
		});
	},
	gst_percent(frm) {
		calculate_totals(frm);
	},
	pharmacy_items_add(frm) {
		calculate_totals(frm);
	},
	pharmacy_items_remove(frm) {
		calculate_totals(frm);
	},
	service_items_add(frm) {
		calculate_totals(frm);
	},
	service_items_remove(frm) {
		calculate_totals(frm);
	},
});

function maybe_allocate_batches(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	if (!row.item || !row.qty || flt(row.qty) <= 0) return;
	if (row.batch_no) return; // already resolved - a later Qty edit is a deliberate manual change, not a re-split

	// Warehouse is only auto-set server-side on Save (set_pharmacy_warehouse()) -
	// on a brand-new unsaved bill frm.doc.warehouse is still blank, so the
	// same "one active Pharmacy warehouse" lookup is done here too, rather
	// than silently skipping allocation until after the first Save.
	const warehouse_ready = frm.doc.warehouse
		? Promise.resolve(frm.doc.warehouse)
		: frappe.db
				.get_list("Warehouse", {
					filters: { warehouse_type: "Pharmacy", is_active: 1 },
					fields: ["name"],
					limit: 1,
				})
				.then((rows) => (rows && rows[0] ? rows[0].name : null));

	warehouse_ready.then((warehouse) => {
		if (!warehouse) return; // no active Pharmacy warehouse set up - nothing to allocate against yet
		allocate_batches_for_row(frm, cdt, cdn, warehouse);
	});
}

function allocate_batches_for_row(frm, cdt, cdn, warehouse) {
	const row = locals[cdt][cdn];
	if (row.batch_no) return; // resolved by the time the warehouse lookup came back

	frappe.call({
		method: "metta.stock.doctype.stock_ledger_entry.stock_ledger_entry.allocate_batches_for_qty",
		args: { item: row.item, warehouse, qty_needed: row.qty },
		callback(r) {
			const allocations = r.message || [];
			if (!allocations.length) return;

			// First allocation lands on this same row.
			const first = allocations[0];
			frappe.model.set_value(cdt, cdn, "batch_no", first.batch);
			frappe.model.set_value(cdt, cdn, "qty", first.qty);
			frappe.model.set_value(cdt, cdn, "rate", first.rate);

			// Anything left over becomes its own row(s) for the same item -
			// staff never has to work this split out themselves.
			if (allocations.length > 1) {
				const current_row = locals[cdt][cdn];
				allocations.slice(1).forEach((alloc) => {
					const new_row = frm.add_child(current_row.parentfield, {
						item: current_row.item,
						item_name: current_row.item_name,
						item_type: current_row.item_type,
						uom: current_row.uom,
						gst_percent: current_row.gst_percent,
						batch_no: alloc.batch,
						qty: alloc.qty,
						rate: alloc.rate,
					});
					calculate_amount(frm, new_row.doctype, new_row.name);
				});
				frm.refresh_field(current_row.parentfield);
				const summary = allocations.map((a) => `${a.qty} @ ${format_currency(a.rate)} (${a.batch})`).join(", ");
				frappe.show_alert({
					message: __("{0} split across {1} batches - {2}", [
						current_row.item,
						allocations.length,
						summary,
					]),
					indicator: "blue",
				});
			}
			calculate_amount(frm, cdt, cdn);
		},
	});
}

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

	// Rounded to currency precision at every step, same as the server -
	// otherwise an unrounded float preview here can flash a value that
	// differs from what actually gets saved at the 15th decimal place.
	[...(frm.doc.pharmacy_items || []), ...(frm.doc.service_items || [])].forEach((row) => {
		const amount = flt(row.amount);
		const taxable_value = amount * (1 - signed_percent / 100);
		const gst_amount = flt((taxable_value * flt(row.gst_percent)) / 100, 2);
		frappe.model.set_value(row.doctype, row.name, "gst_amount", gst_amount);
		subtotal += amount;
		gst_total += gst_amount;
	});
	subtotal = flt(subtotal, 2);

	const discount_amount = flt((subtotal * signed_percent) / 100, 2);
	const net_amount = flt(subtotal - discount_amount + gst_total, 2);
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

function add_discharge_bill_button(frm) {
	// A real, saved, printable Discharge Bill document now - not just a
	// preview dialog - so there's an actual permanent record of exactly
	// what was billed and handed to the patient at discharge. Opens the
	// existing one for this admission if it's already been made, otherwise
	// starts a new one pre-filled with this same IP ID.
	frm.add_custom_button(__("Discharge Bill"), () => {
		frappe.db.get_value(
			"Discharge Bill",
			{ ip_id: frm.doc.patient, docstatus: ["!=", 2] },
			"name",
			(r) => {
				if (r && r.name) {
					frappe.set_route("Form", "Discharge Bill", r.name);
				} else {
					frappe.new_doc("Discharge Bill", { ip_id: frm.doc.patient });
				}
			}
		);
	});
}

function add_advance_button(frm) {
	// The cached balance is only used to decide whether the button is worth
	// showing at all - the actual amount applied on click is always
	// re-fetched fresh, since another bill for this same patient could have
	// been submitted (in another tab, or by someone else) since this form
	// was first opened, making the cached figure stale and too high. Applying
	// a stale, too-high amount would silently show "Amount Due: 0" here and
	// then get rejected by the server's own balance check on Save.
	const cached_balance = frm._advance_balance && flt(frm._advance_balance.balance);
	if (!cached_balance || cached_balance <= 0) return;
	frm.add_custom_button(__("Apply Advance"), () => {
		frappe.call({
			method: "metta.sales.doctype.patient_advance.patient_advance.get_advance_balance",
			args: { patient_visit: frm.doc.patient },
			callback(r) {
				frm._advance_balance = r.message || null;
				set_advance_balance_fields(frm);
				const balance = frm._advance_balance ? flt(frm._advance_balance.balance) : 0;
				const amount = Math.min(balance, flt(frm.doc.net_amount));
				frm.set_value("advance_adjusted", amount);
			},
		});
	});
}

function set_advance_balance_fields(frm) {
	const balance = frm._advance_balance;
	frm.set_value("advance_collected", balance ? flt(balance.total_collected) : 0);
	frm.set_value("advance_used", balance ? flt(balance.total_adjusted) : 0);
	frm.set_value("advance_available", balance ? flt(balance.balance) : 0);
}

function ensure_bill_type_includes(frm, kind) {
	// kind is "Pharmacy" or "Service" - widens Bill Type only as far as
	// needed to reveal that section (Pharmacy+Service both present -> Mixed),
	// never narrows a choice that already covers it.
	const bt = frm.doc.bill_type;
	if (bt === kind || bt === "Mixed") return;
	frm.set_value("bill_type", bt ? "Mixed" : kind);
}

function add_admission_charge_if_due(frm) {
	// Mirrors the legacy system - converting a patient to IP brings a flat
	// admission charge onto the bill automatically the moment the IP visit
	// is entered here. The server checks this same patient's other bills so
	// it's never added twice for one admission.
	frappe.call({
		method: "metta.sales.doctype.billing.billing.get_admission_charge_row",
		args: { patient: frm.doc.patient },
		callback(r) {
			if (!r.message) return;
			// It's a charge, not a stock item - Service Items, not Pharmacy
			// Items. Make sure Bill Type actually reveals that section, since
			// this row is about to land in it regardless of what's picked.
			ensure_bill_type_includes(frm, "Service");
			// Reuse an existing blank row in that table if one's already
			// sitting there empty, rather than adding a second row next to it.
			const blank_row = (frm.doc.service_items || []).find((row) => !row.item);
			const row = blank_row || frm.add_child("service_items");
			Object.keys(r.message).forEach((fieldname) => {
				frappe.model.set_value(row.doctype, row.name, fieldname, r.message[fieldname]);
			});
			frm.refresh_field("service_items");
			calculate_amount(frm, row.doctype, row.name);
		},
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

function render_item_search(frm, opts) {
	// Same search-and-add pattern as Purchase Order/Stock Indent's item
	// widget - one instance of this per table (Pharmacy Items, Service
	// Items), each scoped to only search/add its own item types.
	const { field, table, css_prefix, qty_label, show_avail_qty } = opts;
	const wrapper = frm.fields_dict[field].$wrapper;
	wrapper.html(`
		<div class="${css_prefix}-item-search-widget" style="border:1px solid var(--border-color, #d1d8dd); border-radius:6px; padding:12px; margin-bottom:10px;">
			<div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
				<div style="flex:2; min-width:220px; position:relative;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${__(
						"Item Name"
					)}</label>
					<input type="text" class="form-control ${css_prefix}-item-search" placeholder="${__(
						"Search item..."
					)}" autocomplete="off">
					<div class="${css_prefix}-item-results" style="display:none; position:absolute; z-index:50; background:var(--fg-color,#fff); border:1px solid var(--border-color,#d1d8dd); width:100%; max-height:260px; overflow:auto; box-shadow:0 2px 6px rgba(0,0,0,0.15);"></div>
				</div>
				<div style="width:100px;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${qty_label}</label>
					<input type="text" inputmode="decimal" class="form-control ${css_prefix}-item-qty" value="1">
				</div>
				<div>
					<button class="btn btn-primary btn-sm ${css_prefix}-item-add">${__("Add")}</button>
				</div>
			</div>
			<div class="${css_prefix}-item-selected text-muted" style="margin-top:6px; font-size:12px;"></div>
		</div>
	`);

	let selected = null;
	let current_rows = [];
	let highlighted = -1;
	const $search = wrapper.find(`.${css_prefix}-item-search`);
	const $results = wrapper.find(`.${css_prefix}-item-results`);
	const $qty = wrapper.find(`.${css_prefix}-item-qty`);
	const $selectedNote = wrapper.find(`.${css_prefix}-item-selected`);

	const set_highlight = (idx) => {
		highlighted = idx;
		$results
			.find(`.${css_prefix}-item-row`)
			.css("background", "")
			.each(function () {
				if ($(this).data("idx") === highlighted) {
					$(this).css("background", "var(--bg-light-gray, #f4f5f6)");
					this.scrollIntoView({ block: "nearest" });
				}
			});
	};

	const select_row = (idx) => {
		if (!current_rows[idx]) return;
		selected = current_rows[idx];
		$search.val(selected.name);
		$selectedNote.text(__("Selected: {0} ({1})", [selected.name, selected.item_code]));
		$results.hide();
		// Straight into Qty next - picking the item is done with the keyboard
		// alone (arrow keys + Enter), no mouse/touch needed at any point.
		$qty.trigger("focus").trigger("select");
	};

	const render_results = (rows) => {
		current_rows = rows || [];
		if (!current_rows.length) {
			$results.html(`<div class="text-muted" style="padding:8px;">${__("No matches")}</div>`).show();
			return;
		}
		const avail_col = show_avail_qty ? `<th class="text-right">${__("Avail. Qty")}</th>` : "";
		const header = `
			<table class="table table-condensed" style="margin-bottom:0;">
				<thead>
					<tr>
						<th>${__("Name")}</th>
						<th class="text-right">${__("Rate")}</th>
						${avail_col}
					</tr>
				</thead>
				<tbody>
					${current_rows
						.map((r, i) => {
							const avail_cell = show_avail_qty
								? `<td class="text-right" style="${r.avail_qty === 0 ? "color:#dc3545;" : ""}">${r.avail_qty}</td>`
								: "";
							return `
						<tr class="${css_prefix}-item-row" data-idx="${i}" style="cursor:pointer;">
							<td>${frappe.utils.escape_html(r.name)}</td>
							<td class="text-right">${flt(r.rate).toFixed(2)}</td>
							${avail_cell}
						</tr>`;
						})
						.join("")}
				</tbody>
			</table>`;
		$results.html(header).show();

		$results.find(`.${css_prefix}-item-row`).on("click", function () {
			select_row($(this).data("idx"));
		});

		// First result pre-highlighted - Enter picks it immediately without
		// needing an ArrowDown first, same as most search-as-you-type boxes.
		set_highlight(0);
	};

	const do_search = frappe.utils.debounce(() => {
		const term = $search.val();
		if (!term) {
			$results.hide();
			return;
		}
		frappe.call({
			method: "metta.sales.doctype.billing.billing.search_items_for_billing",
			args: { search_term: term, table },
			callback(r) {
				render_results(r.message);
			},
		});
	}, 300);

	$search.on("input", () => {
		selected = null;
		$selectedNote.text("");
		do_search();
	});

	// Full keyboard flow: type to search, Up/Down to move through the
	// results, Enter to pick the highlighted one (or close on Escape) -
	// mouse/touch is never required to pick an item.
	$search.on("keydown", (e) => {
		if (!$results.is(":visible") || !current_rows.length) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			set_highlight(Math.min(highlighted + 1, current_rows.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			set_highlight(Math.max(highlighted - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			select_row(highlighted);
		} else if (e.key === "Escape") {
			$results.hide();
		}
	});

	const try_add_item = () => {
		if (!selected) {
			frappe.msgprint(__("Please search and select an item first."));
			return;
		}
		const qty = flt($qty.val());
		if (!qty || qty <= 0) {
			frappe.msgprint(__("Please enter a Qty greater than 0."));
			return;
		}

		frappe.call({
			method: "metta.sales.doctype.billing.billing.get_billing_item_row",
			args: { item_code: selected.item_code, qty },
			callback(r) {
				const data = r.message || {};

				// Frappe auto-adds one blank starter row to the table - remove
				// it before adding the first real item, so it doesn't linger
				// as an empty row forever.
				const existing_rows = frm.doc[table] || [];
				if (existing_rows.length && existing_rows.every((row) => !row.item)) {
					frm.clear_table(table);
				}

				const new_row = frm.add_child(table, data);
				frm.refresh_field(table);
				calculate_totals(frm);

				// Medicine/Consumable pricing is batch-specific and can span
				// more than one batch - re-resolve via full allocation rather
				// than trusting the single-batch guess get_billing_item_row
				// already filled in, same logic the plain grid uses.
				if (data.item_type === "Medicine" || data.item_type === "Consumable") {
					// set_value is async - maybe_allocate_batches' own guard
					// (skip if batch_no is already set) would otherwise see
					// the stale pre-fetched value and bail out immediately.
					frappe.model.set_value(new_row.doctype, new_row.name, "batch_no", "").then(() => {
						maybe_allocate_batches(frm, new_row.doctype, new_row.name);
					});
				}

				selected = null;
				$search.val("");
				$qty.val("1");
				$selectedNote.text("");
				$results.hide();
				// Back to Item Name, ready for the next one - the whole
				// add-a-line loop never needs the mouse.
				$search.trigger("focus");
			},
		});
	};

	wrapper.find(`.${css_prefix}-item-add`).on("click", try_add_item);
	// Enter in Qty submits the same as clicking Add - the last step of the
	// keyboard-only flow (search -> arrow keys -> Enter -> type qty -> Enter).
	$qty.on("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			try_add_item();
		}
	});

	// Clicking elsewhere on the form closes the results dropdown.
	$(document).on(`click.${css_prefix}-item-search`, (e) => {
		if (!$(e.target).closest(`.${css_prefix}-item-search-widget`).length) {
			$results.hide();
		}
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
			// A brand-new Billing starts with one blank row in each grid the
			// grid adds on its own - loading the prescribed items should
			// replace those, not leave them sitting there as extra rows with
			// no Item on them.
			frm.doc.pharmacy_items = (frm.doc.pharmacy_items || []).filter((row) => row.item);
			frm.doc.service_items = (frm.doc.service_items || []).filter((row) => row.item);
			// A full prefill (item, rate, uom, gst, amount) rather than just
			// the item code - child-row fetch_from/change-handlers don't fire
			// for values set this way, so everything Billing needs to see is
			// filled in directly. Medicines go to Pharmacy Items, tests go to
			// Service Items.
			const fill_row = (table, i) => {
				const row = frm.add_child(table);
				row.item = i.item;
				row.item_name = i.item_name;
				row.qty = i.qty;
				row.uom = i.uom;
				row.rate = i.rate;
				row.gst_percent = i.gst_percent;
				row.amount = i.amount;
			};
			data.pharmacy_items.forEach((i) => fill_row("pharmacy_items", i));
			data.service_items.forEach((i) => fill_row("service_items", i));
			if (data.pharmacy_items.length) ensure_bill_type_includes(frm, "Pharmacy");
			if (data.service_items.length) ensure_bill_type_includes(frm, "Service");
			frm.refresh_field("pharmacy_items");
			frm.refresh_field("service_items");
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
