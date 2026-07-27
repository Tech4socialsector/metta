// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Indent", {
	onload(frm) {
		// Best-effort UX: grey out today and earlier in the calendar widget
		// itself. Not guaranteed to re-apply on every render, so the
		// required_by change handler below is what actually enforces this.
		if (frm.fields_dict.required_by) {
			frm.fields_dict.required_by.df.min_date = frappe.datetime.str_to_obj(
				frappe.datetime.add_days(frappe.datetime.get_today(), 1)
			);
		}
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.requested_by) {
			frm.set_value("requested_by", frappe.session.user);
		}
		render_item_search(frm);
	},
	required_by(frm) {
		// The real gate is validate_required_by() on the server - this is
		// just an instant popup instead of making the user wait for Save to fail.
		if (!frm.doc.required_by) return;
		if (frappe.datetime.get_diff(frm.doc.required_by, frappe.datetime.get_today()) <= 0) {
			frappe.msgprint({
				title: __("Invalid Required By Date"),
				indicator: "red",
				message: __("Required By must be a date after today. Please pick a later date."),
			});
			frm.set_value("required_by", "");
		}
	},
	requesting_warehouse(frm) {
		// Avail Qty in the search results depends on which warehouse is
		// selected, so re-run the current search if the warehouse changes.
		const $search = frm.fields_dict.item_search_area.$wrapper.find(".indent-item-search");
		if ($search.val()) {
			$search.trigger("input");
		}
	},
});

frappe.ui.form.on("Stock Indent Item", {
	// The search widget's Add button already fills item_name in - this only
	// covers rows added directly via the standard grid's "Add row" instead.
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
});

function render_item_search(frm) {
	const wrapper = frm.fields_dict.item_search_area.$wrapper;
	wrapper.html(`
		<div class="indent-item-search-widget" style="border:1px solid var(--border-color, #d1d8dd); border-radius:6px; padding:12px; margin-bottom:10px;">
			<div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
				<div style="flex:2; min-width:220px; position:relative;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${__(
						"Product Name"
					)}</label>
					<input type="text" class="form-control indent-item-search" placeholder="${__(
						"Search item..."
					)}" autocomplete="off">
					<div class="indent-item-results" style="display:none; position:absolute; z-index:50; background:var(--fg-color,#fff); border:1px solid var(--border-color,#d1d8dd); width:100%; max-height:260px; overflow:auto; box-shadow:0 2px 6px rgba(0,0,0,0.15);"></div>
				</div>
				<div style="width:120px;">
					<label class="control-label" style="display:block; font-size:12px; margin-bottom:2px;">${__(
						"Req. Qty"
					)}</label>
					<input type="number" class="form-control indent-item-qty" min="0">
				</div>
				<div>
					<button class="btn btn-primary btn-sm indent-item-add">${__("Add")}</button>
				</div>
			</div>
			<div class="indent-item-selected text-muted" style="margin-top:6px; font-size:12px;"></div>
		</div>
	`);

	let selected = null;
	const $search = wrapper.find(".indent-item-search");
	const $results = wrapper.find(".indent-item-results");
	const $qty = wrapper.find(".indent-item-qty");
	const $selectedNote = wrapper.find(".indent-item-selected");

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
						<th class="text-right">${__("Avail. Qty")}</th>
						<th>${__("Manufacturer")}</th>
						<th>${__("Rack/Shelf")}</th>
					</tr>
				</thead>
				<tbody>
					${rows
						.map(
							(r, i) => `
						<tr class="indent-item-row" data-idx="${i}" style="cursor:pointer;">
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

		$results.find(".indent-item-row").on("click", function () {
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
			method:
				"metta.purchase_request.doctype.stock_indent.stock_indent.search_items_for_indent",
			args: { warehouse: frm.doc.requesting_warehouse, search_term: term },
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

	wrapper.find(".indent-item-add").on("click", () => {
		if (!selected) {
			frappe.msgprint(__("Please search and select an item first."));
			return;
		}
		const qty = flt($qty.val());
		if (!qty || qty <= 0) {
			frappe.msgprint(__("Please enter a Req. Qty greater than 0."));
			return;
		}
		const row = frm.add_child("items", {
			item: selected.item_code,
			item_name: selected.name,
			qty_requested: qty,
		});
		frm.refresh_field("items");

		selected = null;
		$search.val("");
		$qty.val("");
		$selectedNote.text("");
		$results.hide();
	});

	// Clicking elsewhere on the form closes the results dropdown.
	$(document).on("click.indent-item-search", (e) => {
		if (!$(e.target).closest(".indent-item-search-widget").length) {
			$results.hide();
		}
	});
}
