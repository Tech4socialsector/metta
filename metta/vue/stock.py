# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

# Read-only server methods for the Vue Pharmacy home and Stock lookup
# (frontend/src/pages/Pharmacy). Nothing here changes stock - stock moves
# only through the Desk documents (Billing submit, transfers, receipts...).
#
# Batch quantity per store is not stored anywhere: it is the sum of the
# Stock Ledger Entries for that batch and warehouse, the same numbers Desk's
# Batch-wise Stock Listing adds up. Reorder levels live in Item's
# "reorder_levels" table (one row per warehouse).

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

PHARMACY_TYPES = ("Pharmacy", "Pharmacy Store")
OPEN_INDENT = ("Draft", "Submitted", "Partially Issued")


def _check(*doctypes):
	for dt in doctypes:
		if not frappe.has_permission(dt, "read"):
			frappe.throw(_("Not permitted to read {0}").format(_(dt)), frappe.PermissionError)


@frappe.whitelist()
def get_stores():
	"""Active warehouses for the store picker, pharmacy ones first."""
	_check("Stock Ledger Entry")
	rows = frappe.get_all(
		"Warehouse", filters={"is_active": 1}, fields=["name", "warehouse_type"], order_by="name asc"
	)
	rows.sort(key=lambda r: (r.warehouse_type not in PHARMACY_TYPES, r.name))
	return rows


def _default_store():
	stores = get_stores()
	return stores[0].name if stores else None


def _batch_stock(warehouse=None, item=None):
	"""On-hand quantity per batch (and warehouse), with expiry and rate.

	frappe.db here because it is an aggregate across ledger rows; the caller
	has already checked read permission on Stock Ledger Entry and Batch.
	"""
	conditions = ["sle.batch_no is not null", "sle.batch_no != ''"]
	values = {}
	if warehouse:
		conditions.append("sle.warehouse = %(warehouse)s")
		values["warehouse"] = warehouse
	if item:
		conditions.append("sle.item = %(item)s")
		values["item"] = item
	return frappe.db.sql(
		f"""
		select sle.item, sle.item_name, sle.batch_no, sle.warehouse,
			sum(sle.qty_change) as qty,
			b.batch_no as batch_number, b.expiry_date, b.selling_rate
		from `tabStock Ledger Entry` sle
		left join `tabBatch` b on b.name = sle.batch_no
		where {" and ".join(conditions)}
		group by sle.item, sle.batch_no, sle.warehouse
		having sum(sle.qty_change) > 0
		order by b.expiry_date is null, b.expiry_date asc
		""",
		values,
		as_dict=True,
	)


@frappe.whitelist()
def get_pharmacy_home(warehouse=None):
	"""Counts and rows for the four Pharmacy home cards."""
	_check("Stock Ledger Entry", "Batch", "Item")
	warehouse = warehouse or _default_store()
	if not warehouse:
		return {"warehouse": None, "low": [], "expiring": [], "expired": [], "indents": []}

	today = getdate(nowdate())
	soon = getdate(add_days(today, 30))

	# Low stock: items with a reorder level for this store whose stock is at
	# or below it (no Stock Balance row means nothing in stock).
	levels = frappe.db.get_all(
		"Item Reorder Level",
		filters={"parenttype": "Item", "warehouse": warehouse, "reorder_level": [">", 0]},
		fields=["parent as item", "reorder_level"],
	)
	low = []
	if levels:
		balance = {
			r.item: flt(r.actual_qty)
			for r in frappe.db.get_all(
				"Stock Balance",
				filters={"warehouse": warehouse, "item": ["in", [l.item for l in levels]]},
				fields=["item", "actual_qty"],
			)
		}
		items = {
			r.name: r
			for r in frappe.db.get_all(
				"Item", filters={"name": ["in", [l.item for l in levels]]}, fields=["name", "item_name", "item_group"]
			)
		}
		for l in levels:
			qty = balance.get(l.item, 0)
			if qty <= cint(l.reorder_level):
				it = items.get(l.item) or frappe._dict()
				low.append(
					{
						"item": l.item,
						"item_name": it.item_name or l.item,
						"item_group": it.item_group,
						"qty": qty,
						"reorder_level": cint(l.reorder_level),
					}
				)
		low.sort(key=lambda r: r["qty"] - r["reorder_level"])

	expiring, expired = [], []
	for b in _batch_stock(warehouse):
		if not b.expiry_date:
			continue
		row = {
			"item": b.item,
			"item_name": b.item_name,
			"batch": b.batch_number or b.batch_no,
			"qty": flt(b.qty),
			"expiry_date": b.expiry_date,
			"days_left": (getdate(b.expiry_date) - today).days,
		}
		if getdate(b.expiry_date) < today:
			expired.append(row)
		elif getdate(b.expiry_date) <= soon:
			expiring.append(row)

	# The store's open indents (permission-aware: what this user may read).
	indents = []
	if frappe.has_permission("Stock Indent", "read"):
		indents = frappe.get_list(
			"Stock Indent",
			filters={"requesting_warehouse": warehouse, "status": ["in", OPEN_INDENT]},
			fields=["name", "request_date_time", "required_by", "priority", "status"],
			order_by="request_date_time desc",
			limit_page_length=50,
		)
		if indents:
			by = {}
			for p in frappe.db.get_all(
				"Stock Indent Item",
				filters={"parent": ["in", [i.name for i in indents]], "parenttype": "Stock Indent"},
				pluck="parent",
			):
				by[p] = by.get(p, 0) + 1
			for i in indents:
				i["items"] = by.get(i.name, 0)

	return {"warehouse": warehouse, "low": low, "expiring": expiring, "expired": expired, "indents": indents}


@frappe.whitelist()
def search_items(txt="", warehouse=None, limit=8):
	"""Active items by name or code, with their stock in the chosen store."""
	_check("Item")
	txt = (txt or "").strip()
	if len(txt) < 2:
		return []
	items = frappe.get_list(
		"Item",
		filters={"is_active": 1},
		or_filters=[["item_name", "like", f"%{txt}%"], ["name", "like", f"%{txt}%"]],
		fields=["name", "item_name", "item_group"],
		order_by="item_name asc",
		limit_page_length=cint(limit) or 8,
	)
	if items and frappe.has_permission("Stock Balance", "read"):
		filters = {"item": ["in", [i.name for i in items]]}
		if warehouse:
			filters["warehouse"] = warehouse
		qty = {}
		for r in frappe.db.get_all("Stock Balance", filters=filters, fields=["item", "actual_qty"]):
			qty[r.item] = qty.get(r.item, 0) + flt(r.actual_qty)
		for i in items:
			i["qty"] = qty.get(i.name, 0)
	return items


@frappe.whitelist()
def get_item_stock(item, warehouse=None):
	"""Everything the Stock lookup shows for one item."""
	_check("Item", "Stock Ledger Entry", "Batch")
	doc = frappe.get_doc("Item", item)
	doc.check_permission("read")

	batches = _batch_stock(warehouse or None, item)
	total = sum(flt(b.qty) for b in batches)
	# Items kept without batches still have ledger rows; count those too.
	plain = frappe.db.sql(
		"""select coalesce(sum(qty_change), 0) from `tabStock Ledger Entry`
		where item = %(item)s and (batch_no is null or batch_no = '')
		{wh}""".format(wh="and warehouse = %(warehouse)s" if warehouse else ""),
		{"item": item, "warehouse": warehouse},
	)[0][0]
	total += flt(plain)

	reorder = next((cint(r.reorder_level) for r in doc.reorder_levels if r.warehouse == warehouse), None) if warehouse else None
	dated = [b for b in batches if b.expiry_date]

	move_filters = {"item": item}
	if warehouse:
		move_filters["warehouse"] = warehouse
	moves = frappe.get_list(
		"Stock Ledger Entry",
		filters=move_filters,
		fields=["posting_datetime", "voucher_type", "voucher_no", "warehouse", "qty_change", "qty_after_transaction", "creation"],
		order_by="creation desc",
		limit_page_length=15,
	)

	return {
		"item": {
			"name": doc.name,
			"item_name": doc.item_name,
			"item_group": doc.item_group,
			"rack_location": doc.rack_location,
			"unit_of_measure": doc.unit_of_measure,
		},
		"total": total,
		"reorder_level": reorder,
		"nearest_expiry": dated[0].expiry_date if dated else None,
		"batches": [
			{
				"batch": b.batch_number or b.batch_no,
				"warehouse": b.warehouse,
				"qty": flt(b.qty),
				"expiry_date": b.expiry_date,
				"selling_rate": flt(b.selling_rate),
			}
			for b in batches
		],
		"moves": moves,
	}
