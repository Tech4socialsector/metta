# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate, today


STATUS_ALL = "All"
STATUS_EXPIRED = "Expired"
STATUS_EXPIRING_30 = "Expiring in 30 Days"
STATUS_EXPIRING_60 = "Expiring in 31-60 Days"
STATUS_EXPIRING_90 = "Expiring in 61-90 Days"
STATUS_SAFE = "Safe"


@frappe.whitelist()
def get_data(as_on_date=None, warehouse=None, item=None, item_type=None, batch_no=None, status=None):
	"""Return on-hand stock by item, warehouse, and batch as at the requested date."""
	frappe.has_permission("Batch", "read", throw=True)
	frappe.has_permission("Stock Ledger Entry", "read", throw=True)

	as_on_date = getdate(as_on_date or today())
	if as_on_date > getdate(today()):
		frappe.throw(_("As on Date cannot be in the future."), title=_("Invalid Date"))

	conditions = ["sle.posting_datetime <= %(as_on_datetime)s", "sle.batch_no IS NOT NULL", "sle.batch_no != ''"]
	values = {"as_on_datetime": f"{as_on_date} 23:59:59"}
	if warehouse:
		conditions.append("sle.warehouse = %(warehouse)s")
		values["warehouse"] = warehouse
	if item:
		conditions.append("sle.item = %(item)s")
		values["item"] = item
	if item_type:
		conditions.append("i.item_type = %(item_type)s")
		values["item_type"] = item_type
	if batch_no:
		conditions.append("sle.batch_no = %(batch_no)s")
		values["batch_no"] = batch_no
	where = " AND ".join(conditions)
	# qty_after_transaction is item/warehouse-wide, rather than batch-wide.
	# Summing signed ledger movements is therefore the authoritative batch balance.
	rows = frappe.db.sql(
		f"""
		WITH batch_quantities AS (
			SELECT sle.item, sle.warehouse, sle.batch_no, SUM(sle.qty_change) AS available_qty
			FROM `tabStock Ledger Entry` sle
			INNER JOIN `tabItem` i ON i.name = sle.item
			INNER JOIN `tabBatch` b ON b.name = sle.batch_no AND b.item = sle.item
			WHERE {where}
			GROUP BY sle.item, sle.warehouse, sle.batch_no
		), latest_rates AS (
			SELECT sle.item, sle.warehouse, sle.batch_no, sle.valuation_rate,
				ROW_NUMBER() OVER (
					PARTITION BY sle.item, sle.warehouse, sle.batch_no
					ORDER BY sle.posting_datetime DESC, sle.creation DESC
				) AS rn
			FROM `tabStock Ledger Entry` sle
			WHERE sle.posting_datetime <= %(as_on_datetime)s
		)
		SELECT q.item, i.item_name, i.item_type, i.stock_uom, i.rack_location, q.warehouse,
			q.batch_no, b.manufacturing_date, b.expiry_date,
			q.available_qty, COALESCE(lr.valuation_rate, 0) AS valuation_rate,
			DATEDIFF(b.expiry_date, %(as_on_date)s) AS days_to_expiry
		FROM batch_quantities q
		INNER JOIN `tabItem` i ON i.name = q.item
		INNER JOIN `tabBatch` b ON b.name = q.batch_no AND b.item = q.item
		LEFT JOIN latest_rates lr ON lr.item = q.item AND lr.warehouse = q.warehouse
			AND lr.batch_no = q.batch_no AND lr.rn = 1
		WHERE q.available_qty > 0
		""",
		{**values, "as_on_date": as_on_date},
		as_dict=True,
	)

	for row in rows:
		row["item_name"] = (row.item_name or "").strip()
		row["rack_location"] = (row.rack_location or "").strip()
		row["stock_value"] = flt(row.available_qty) * flt(row.valuation_rate)
		if row.days_to_expiry is None:
			row["status"] = STATUS_SAFE
		elif row.days_to_expiry < 0:
			row["status"] = STATUS_EXPIRED
		elif row.days_to_expiry <= 30:
			row["status"] = STATUS_EXPIRING_30
		elif row.days_to_expiry <= 60:
			row["status"] = STATUS_EXPIRING_60
		elif row.days_to_expiry <= 90:
			row["status"] = STATUS_EXPIRING_90
		else:
			row["status"] = STATUS_SAFE

	if status and status != STATUS_ALL:
		rows = [row for row in rows if row.status == status]

	# The most urgent usable stock is deliberately listed first.
	rows.sort(key=lambda row: (row.days_to_expiry if row.days_to_expiry is not None else 999999, row.item, row.batch_no))
	return rows
