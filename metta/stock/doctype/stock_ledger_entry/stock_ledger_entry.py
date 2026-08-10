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
	# Every doctype that takes stock OUT (Sales Bill, Material Issue, Stock
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
