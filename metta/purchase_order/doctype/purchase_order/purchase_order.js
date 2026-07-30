// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Order", {
	setup(frm) {
		// Services aren't bought from a supplier or held in stock - only
		// let physical, purchasable item types be picked here.
		frm.set_query("item", "items", () => ({
			filters: { item_type: ["in", ["Medicine", "Consumable", "Asset"]] },
		}));
	},
	onload(frm) {
		// Best-effort UX: grey out today and earlier in the calendar widget
		// itself. Not guaranteed to re-apply on every render, so the
		// expected_delivery change handler below is what actually enforces this.
		if (frm.fields_dict.expected_delivery) {
			frm.fields_dict.expected_delivery.df.min_date = frappe.datetime.str_to_obj(
				frappe.datetime.add_days(frappe.datetime.get_today(), 1)
			);
		}
	},
	expected_delivery(frm) {
		// The real gate is validate_expected_delivery() on the server - this
		// is just an instant popup instead of making the user wait for Save to fail.
		if (!frm.doc.expected_delivery) return;
		if (frappe.datetime.get_diff(frm.doc.expected_delivery, frappe.datetime.get_today()) <= 0) {
			frappe.msgprint({
				title: __("Invalid Expected Delivery Date"),
				indicator: "red",
				message: __("Expected Delivery must be a date after today. Please pick a later date."),
			});
			frm.set_value("expected_delivery", "");
		}
	},
	refresh(frm) {
		calculate_total(frm);
		frm.toggle_display("item_search_area", frm.doc.docstatus === 0);
		if (frm.doc.docstatus === 0) {
			render_item_search(frm);
		}
		if (frm.doc.docstatus !== 1) return;

		// The real gate is server-side (validate_can_approve) - this just
		// avoids showing a button that would only error out for someone
		// without the role, like Store Staff who created the order.
		const can_approve = frappe.user_roles.includes("Purchase Approver") || frappe.user_roles.includes("System Manager");

		if (frm.doc.status === "Pending Approval" && can_approve) {
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

		// Goods can't arrive before the order was actually sent to the dealer -
		// "Approved" alone isn't enough yet. "Received" is excluded since
		// nothing is left pending by then.
		if (["Sent to Dealer", "Partially Received"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Create Purchase Receipt"), () => {
				frappe.call({
					method: "metta.purchase_order.doctype.purchase_receipt.purchase_receipt.get_pending_items",
					args: { purchase_order: frm.doc.name },
					callback(r) {
						const rows = r.message || [];
						if (!rows.length) {
							frappe.msgprint(__("Nothing pending to receive on this Purchase Order."));
							return;
						}
						frappe.new_doc("Purchase Receipt", {
							supplier: frm.doc.supplier,
							purchase_order: frm.doc.name,
						}).then(() => {
							const new_frm = cur_frm;
							new_frm.clear_table("items");
							rows.forEach((row) => new_frm.add_child("items", row));
							new_frm.refresh_field("items");
							new_frm.dirty();
							frappe.show_alert({
								message: __(
									"{0} item(s) pulled in - fill in Receiving Warehouse, Batch No and Expiry Date, then confirm Qty Received.",
									[rows.length]
								),
								indicator: "green",
							});
						});
					},
				});
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
			frappe.model.set_value(cdt, cdn, "item_name", "");
			frappe.model.set_value(cdt, cdn, "available_qty", 0);
			return;
		}
		frappe.db.get_value(
			"Item",
			row.item,
			["purchase_uom", "standard_purchase_rate", "item_name"],
			(r) => {
				frappe.model.set_value(cdt, cdn, "unit_of_measure", r.purchase_uom || "");
				frappe.model.set_value(cdt, cdn, "rate", flt(r.standard_purchase_rate));
				frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
			}
		);
		// Store's balance specifically - can't be a plain fetch_from since it
		// depends on a fixed warehouse, not a field on Item itself.
		frappe.call({
			method: "metta.purchase_order.doctype.purchase_order.purchase_order.get_available_qty",
			args: { item: row.item },
			callback(r) {
				frappe.model.set_value(cdt, cdn, "available_qty", flt(r.message));
			},
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

function render_item_search(frm) {
	const wrapper = frm.fields_dict.item_search_area.$wrapper;
	wrapper.html(`
		<div class="po-item-search-widget" style="border:1px solid var(--border-color, #d1d8dd); border-radius:6px; padding:12px; margin-bottom:10px;">
			<div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
				<div style="flex:2; min-width:220px; position:relative;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${__(
						"Product Name"
					)}</label>
					<input type="text" class="form-control po-item-search" placeholder="${__(
						"Search item..."
					)}" autocomplete="off">
					<div class="po-item-results" style="display:none; position:absolute; z-index:50; background:var(--fg-color,#fff); border:1px solid var(--border-color,#d1d8dd); width:100%; max-height:260px; overflow:auto; box-shadow:0 2px 6px rgba(0,0,0,0.15);"></div>
				</div>
				<div style="width:120px;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${__(
						"Qty Ordered"
					)}</label>
					<input type="number" class="form-control po-item-qty" min="0">
				</div>
				<div>
					<button class="btn btn-primary btn-sm po-item-add">${__("Add")}</button>
				</div>
			</div>
			<div class="po-item-selected text-muted" style="margin-top:6px; font-size:12px;"></div>
		</div>
	`);

	let selected = null;
	const $search = wrapper.find(".po-item-search");
	const $results = wrapper.find(".po-item-results");
	const $qty = wrapper.find(".po-item-qty");
	const $selectedNote = wrapper.find(".po-item-selected");

	const render_results = (rows) => {
		if (!rows || !rows.length) {
			$results.html(`<div class="text-muted" style="padding:8px;">${__("No matches")}</div>`).show();
			return;
		}
		const header = `
			<table class="table table-condensed" style="margin-bottom:0;">
				<thead>
					<tr>
						<th>${__("Name")}</th>
						<th class="text-right">${__("Avail. Qty (Store)")}</th>
						<th>${__("Manufacturer")}</th>
						<th>${__("Rack/Shelf")}</th>
					</tr>
				</thead>
				<tbody>
					${rows
						.map(
							(r, i) => `
						<tr class="po-item-row" data-idx="${i}" style="cursor:pointer;">
							<td>${frappe.utils.escape_html(r.name)}</td>
							<td class="text-right" style="${r.avail_qty === 0 ? "color:#dc3545;" : ""}">${r.avail_qty}</td>
							<td>${frappe.utils.escape_html(r.manufacturer || "")}</td>
							<td>${frappe.utils.escape_html(r.rack_location || "")}</td>
						</tr>`
						)
						.join("")}
				</tbody>
			</table>`;
		$results.html(header).show();

		$results.find(".po-item-row").on("click", function () {
			const idx = $(this).data("idx");
			selected = rows[idx];
			$search.val(selected.name);
			$selectedNote.text(__("Selected: {0} ({1})", [selected.name, selected.item_code]));
			$results.hide();
		});
	};

	const do_search = frappe.utils.debounce(() => {
		const term = $search.val();
		if (!term) {
			$results.hide();
			return;
		}
		frappe.call({
			method: "metta.purchase_order.doctype.purchase_order.purchase_order.search_items_for_order",
			args: { search_term: term },
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

	wrapper.find(".po-item-add").on("click", () => {
		if (!selected) {
			frappe.msgprint(__("Please search and select an item first."));
			return;
		}
		const qty = flt($qty.val());
		if (!qty || qty <= 0) {
			frappe.msgprint(__("Please enter a Qty Ordered greater than 0."));
			return;
		}

		frappe.call({
			method: "metta.purchase_order.doctype.purchase_order.purchase_order.get_item_defaults_for_order",
			args: { item: selected.item_code },
			callback(r) {
				const defaults = r.message || {};
				const rate = flt(defaults.rate);

				// Frappe auto-adds one blank starter row to a new document's
				// required Table field - remove it before adding the first
				// real item, so it doesn't linger as an empty Row 1 forever.
				const existing_rows = frm.doc.items || [];
				if (existing_rows.length && existing_rows.every((row) => !row.item)) {
					frm.clear_table("items");
				}

				frm.add_child("items", {
					item: selected.item_code,
					item_name: selected.name,
					available_qty: selected.avail_qty,
					qty_ordered: qty,
					unit_of_measure: defaults.unit_of_measure || "",
					rate: rate,
					amount: qty * rate,
				});
				frm.refresh_field("items");
				calculate_total(frm);

				selected = null;
				$search.val("");
				$qty.val("");
				$selectedNote.text("");
				$results.hide();
			},
		});
	});

	// Clicking elsewhere on the form closes the results dropdown.
	$(document).on("click.po-item-search", (e) => {
		if (!$(e.target).closest(".po-item-search-widget").length) {
			$results.hide();
		}
	});
}
