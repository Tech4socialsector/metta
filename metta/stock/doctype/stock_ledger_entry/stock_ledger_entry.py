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
	new_qty = flt(stock_balance_doc.actual_qty) + flt(qty_change)

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
	return sle


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
