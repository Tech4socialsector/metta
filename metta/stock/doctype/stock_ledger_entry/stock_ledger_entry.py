# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class StockLedgerEntry(Document):
	pass


def create_stock_ledger_entry(
	item, warehouse, batch_no, posting_datetime, voucher_type, voucher_no, qty_change, valuation_rate=0
):
	# Stock Balance's qty is derived FROM the ledger, not the other way round -
	# so the new running balance is computed here (current + this change) and
	# both records are written together, keeping them always in sync.
	from metta.stock.doctype.stock_balance.stock_balance import get_or_create_stock_balance

	stock_balance_doc = get_or_create_stock_balance(item, warehouse)
	old_qty = flt(stock_balance_doc.actual_qty)
	new_qty = old_qty + flt(qty_change)

	sle = frappe.get_doc(
		{
			"doctype": "Stock Ledger Entry",
			"item": item,
			"warehouse": warehouse,
			"batch_no": batch_no,
			"posting_datetime": posting_datetime,
			"voucher_type": voucher_type,
			"voucher_no": voucher_no,
			"qty_change": qty_change,
			"qty_after_transaction": new_qty,
			"valuation_rate": valuation_rate,
			"amount": flt(qty_change) * flt(valuation_rate),
		}
	)
	sle.insert(ignore_permissions=True)
	stock_balance_doc.db_set("actual_qty", new_qty, update_modified=False)
	_notify_if_reorder_crossed(item, warehouse, old_qty, new_qty)
	return sle


def _notify_if_reorder_crossed(item, warehouse, old_qty, new_qty):
	# Only fire the moment stock crosses downward through the reorder level -
	# comparing old vs new (not just checking new <= level) means someone
	# already below the level doesn't get re-emailed on every further
	# transaction, but does get a fresh email if it dips again after a restock.
	if new_qty >= old_qty:
		return

	reorder_row = frappe.db.get_value(
		"Item Reorder Level",
		{"parent": item, "warehouse": warehouse},
		["reorder_level", "reorder_qty", "notify_user"],
		as_dict=True,
	)
	if not reorder_row or not reorder_row.notify_user:
		return
	if not (old_qty > flt(reorder_row.reorder_level) >= new_qty):
		return

	# notify_user is a Link to User, which stores the account's name, not
	# necessarily its email - the two happen to match for ordinary staff
	# accounts, but not for "Administrator", so the real email is looked
	# up explicitly rather than assumed.
	recipient_email = frappe.db.get_value("User", reorder_row.notify_user, "email")
	if not recipient_email:
		return

	item_details = frappe.db.get_value(
		"Item", item, ["item_name", "stock_uom", "rack_location", "standard_purchase_rate"], as_dict=True
	) or {}
	reorder_qty = flt(reorder_row.reorder_qty)
	estimated_cost = reorder_qty * flt(item_details.get("standard_purchase_rate"))

	frappe.sendmail(
		recipients=[recipient_email],
		subject=frappe._("Reorder Level Reached: {0} at {1}").format(
			item_details.get("item_name") or item, warehouse
		),
		message=frappe.render_template(
			"""
			<p>Stock of <b>{{ item_name }}</b> ({{ item }}) at <b>{{ warehouse }}</b> has
			dropped to <b>{{ new_qty }} {{ stock_uom }}</b>, at or below the configured
			reorder level of <b>{{ reorder_level }} {{ stock_uom }}</b>.</p>
			<p>
				Suggested reorder quantity: <b>{{ reorder_qty }} {{ stock_uom }}</b>
				{% if estimated_cost %}(estimated cost: <b>{{ estimated_cost }}</b>){% endif %}<br>
				{% if rack_location %}Rack / Shelf: <b>{{ rack_location }}</b><br>{% endif %}
			</p>
			<p><a href="{{ item_link }}">View {{ item_name }}</a></p>
			""",
			{
				"item": item,
				"item_name": item_details.get("item_name") or item,
				"warehouse": warehouse,
				"new_qty": new_qty,
				"stock_uom": item_details.get("stock_uom") or "",
				"reorder_level": reorder_row.reorder_level,
				"reorder_qty": reorder_qty,
				"estimated_cost": estimated_cost,
				"rack_location": item_details.get("rack_location"),
				"item_link": frappe.utils.get_url_to_form("Item", item),
			},
		),
	)


def validate_sufficient_stock(item, warehouse, qty_needed):
	# Every doctype that takes stock OUT (Billing, Material Issue, Stock
	# Transfer dispatch, Purchase Return, Stock Adjustment write-off) shares
	# this check so none of them can silently push a balance negative.
	from metta.stock.doctype.stock_balance.stock_balance import get_or_create_stock_balance

	stock_balance_doc = get_or_create_stock_balance(item, warehouse)
	available = flt(stock_balance_doc.actual_qty)
	if flt(qty_needed) > available:
		frappe.throw(
			frappe._(
				"Not enough stock of {0} in {1}: available {2}, needed {3}."
			).format(item, warehouse, available, qty_needed)
		)


def get_available_batches(item, warehouse):
	# Stock Balance is item+warehouse-wide, not batch-specific - a batch's
	# real remaining qty only exists as the sum of its own signed ledger
	# movements, same approach the Batch-wise Stock Listing report already
	# uses. Ordered nearest-expiry-first (FEFO) - standard pharmacy practice,
	# issues stock that would expire soonest before newer stock.
	return frappe.db.sql(
		"""
		SELECT q.batch_no AS batch, b.expiry_date, q.available_qty, b.selling_rate
		FROM (
			SELECT sle.batch_no, SUM(sle.qty_change) AS available_qty
			FROM `tabStock Ledger Entry` sle
			WHERE sle.item = %(item)s AND sle.warehouse = %(warehouse)s
				AND sle.batch_no IS NOT NULL AND sle.batch_no != ''
			GROUP BY sle.batch_no
		) q
		INNER JOIN `tabBatch` b ON b.name = q.batch_no AND b.item = %(item)s
		WHERE q.available_qty > 0 AND b.disabled != 1
		ORDER BY b.expiry_date ASC
		""",
		{"item": item, "warehouse": warehouse},
		as_dict=True,
	)


@frappe.whitelist()
def allocate_batches_for_qty(item, warehouse, qty_needed):
	# Walks available batches oldest-expiry-first, taking as much as each one
	# has until qty_needed is covered - this is what lets billing staff just
	# type an item and a quantity without ever having to know or pick a batch
	# themselves; if it takes more than one batch to cover the amount, this
	# returns one allocation entry per batch involved.
	frappe.has_permission("Batch", "read", throw=True)
	qty_needed = flt(qty_needed)
	batches = get_available_batches(item, warehouse)

	allocations = []
	remaining = qty_needed
	for batch in batches:
		if remaining <= 0:
			break
		take = min(remaining, flt(batch.available_qty))
		allocations.append(
			{
				"batch": batch.batch,
				"qty": take,
				"rate": flt(batch.selling_rate),
				"expiry_date": batch.expiry_date,
			}
		)
		remaining -= take

	if remaining > 0:
		total_available = qty_needed - remaining
		frappe.throw(
			frappe._(
				"Not enough stock of {0} in {1} across any batch: available {2}, needed {3}."
			).format(item, warehouse, total_available, qty_needed)
		)

	return allocations


def validate_sufficient_batch_stock(item, warehouse, batch_no, qty_needed):
	# validate_sufficient_stock() only guards the item+warehouse total, which
	# isn't enough once billing charges different rates per batch - this
	# stops a specific batch's stock from going negative even while other
	# batches of the same item still have plenty left.
	available = flt(
		frappe.db.sql(
			"""
			SELECT SUM(qty_change) FROM `tabStock Ledger Entry`
			WHERE item = %(item)s AND warehouse = %(warehouse)s AND batch_no = %(batch_no)s
			""",
			{"item": item, "warehouse": warehouse, "batch_no": batch_no},
		)[0][0]
	)
	if flt(qty_needed) > available:
		frappe.throw(
			frappe._(
				"Not enough stock of Batch {0} in {1}: available {2}, needed {3}."
			).format(batch_no, warehouse, available, qty_needed)
		)


def reverse_stock_ledger_entries(voucher_type, voucher_no):
	# The doctype is "no manual entry, no delete" - on cancel we don't erase
	# the original entries, we create mirrored negative ones. This keeps the
	# full audit trail ("received +50, then cancelled -50") instead of making
	# it look like the receipt never happened.
	entries = frappe.get_all(
		"Stock Ledger Entry",
		filters={"voucher_type": voucher_type, "voucher_no": voucher_no},
		fields=["item", "warehouse", "batch_no", "qty_change", "valuation_rate"],
	)
	for e in entries:
		create_stock_ledger_entry(
			item=e.item,
			warehouse=e.warehouse,
			batch_no=e.batch_no,
			posting_datetime=frappe.utils.now(),
			voucher_type=voucher_type,
			voucher_no=voucher_no,
			qty_change=-flt(e.qty_change),
			valuation_rate=e.valuation_rate,
		)
