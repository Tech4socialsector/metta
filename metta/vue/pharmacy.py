# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

# Server methods for the Vue Pharmacy "Dispense medicines" screen
# (frontend/src/pages/Pharmacy/Dispense.vue). Read-only on purpose: in Desk,
# stock already leaves the pharmacy when Billing Staff submit the bill
# (Billing.on_submit), and there is no separate dispense/issued step to record,
# so the pharmacist only looks the bill up and hands over its medicines.

import frappe
from frappe import _

BILL_FIELDS = [
	"name",
	"customer_name",
	"patient",
	"op_id",
	"ip_id",
	"registration_category",
	"bill_type",
	"sale_datetime",
	"payment_mode",
	"net_amount",
	"payable_amount",
	"amount_collected",
	"amount_due",
]


def _check_read():
	if not frappe.has_permission("Billing", "read"):
		frappe.throw(_("Not permitted to read Billing"), frappe.PermissionError)


@frappe.whitelist()
def search_bills(query=None, limit=20):
	"""Submitted bills matching a bill no, OP/IP ID, visit or UHIN, latest first."""
	_check_read()
	query = (query or "").strip()
	if not query:
		return []

	# Billing has no UHIN of its own - its patient/op_id/ip_id all link to
	# Patient Visit, so a UHIN is turned into that patient's visit names first.
	# frappe.db (not get_list) here because Pharmacy Staff can't read Patient
	# Visit; only visit names leave this step, the bills themselves still go
	# through the permission-aware get_list below.
	visits = frappe.db.get_all("Patient Visit", filters={"uhin_id": query}, pluck="name")
	or_filters = [
		["name", "like", f"%{query}%"],
		["op_id", "=", query],
		["ip_id", "=", query],
		["patient", "=", query],
	]
	if visits:
		or_filters += [
			["patient", "in", visits],
			["op_id", "in", visits],
			["ip_id", "in", visits],
		]

	return frappe.get_list(
		"Billing",
		filters={"docstatus": 1},
		or_filters=or_filters,
		fields=BILL_FIELDS,
		order_by="sale_datetime desc, creation desc",
		limit_page_length=min(int(limit or 20), 50),
	)


@frappe.whitelist()
def get_bill(name):
	"""One submitted bill's header plus its pharmacy rows, with batch expiry."""
	_check_read()
	rows = frappe.get_list("Billing", filters={"name": name, "docstatus": 1}, fields=BILL_FIELDS, limit_page_length=1)
	if not rows:
		return None
	bill = rows[0]

	# Read access to the bill was settled above; the child rows and the
	# patient's UHIN are fetched directly since Pharmacy Staff may not read
	# Patient Visit, and child tables can't be queried with get_list.
	visit = bill.patient or bill.op_id or bill.ip_id
	bill.uhin_id = frappe.db.get_value("Patient Visit", visit, "uhin_id") if visit else None
	items = frappe.get_all(
		"Sales Bill Item",
		filters={"parent": name, "parenttype": "Billing", "parentfield": "pharmacy_items"},
		fields=["idx", "item", "item_name", "item_type", "batch_no", "qty", "uom"],
		order_by="idx asc",
	)

	# Expiry lives on Batch, not on the bill row - looked up in one query so
	# the pharmacist can check the strip in hand against it.
	batches = {i.batch_no for i in items if i.batch_no}
	expiry = (
		dict(frappe.get_all("Batch", filters={"name": ["in", list(batches)]}, fields=["name", "expiry_date"], as_list=True))
		if batches
		else {}
	)
	for i in items:
		i.expiry_date = expiry.get(i.batch_no)

	bill.pharmacy_items = items
	return bill
