# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

# Below this many days-to-expiry a batch is "Expiring Soon" rather than
# "Safe" - chosen to give staff enough lead time to use/transfer/return
# stock before it's actually wasted. Anything already past its expiry date
# is always "Expired" regardless of this threshold.
EXPIRING_SOON_DAYS = 90

STATUS_ALL = "All"
STATUS_EXPIRED = "Expired"
STATUS_EXPIRING_SOON = "Expiring Soon"
STATUS_SAFE = "Safe"


@frappe.whitelist()
def get_data(warehouse=None, item=None, item_type=None, status=None):
	# This is a snapshot of CURRENT stock, not a historical range - the last
	# ledger entry per item/warehouse/batch on or before right now already
	# IS today's on-hand qty (qty_after_transaction is a running total), same
	# technique Previous Day Stock Report and Material Analysis both use.
	frappe.has_permission("Stock Ledger Entry", "read", throw=True)

	item_conditions = []
	values = {}
	if item:
		item_conditions.append("i.name = %(item)s")
		values["item"] = item
	if item_type:
		item_conditions.append("i.item_type = %(item_type)s")
		values["item_type"] = item_type
	item_where = (" AND " + " AND ".join(item_conditions)) if item_conditions else ""

	warehouse_condition = ""
	if warehouse:
		warehouse_condition = "AND sle.warehouse = %(warehouse)s"
		values["warehouse"] = warehouse

	rows = frappe.db.sql(
		f"""
		SELECT item, item_name, item_type, rack_location, warehouse, batch_no, qty_after_transaction,
			valuation_rate, expiry_date, DATEDIFF(expiry_date, CURDATE()) AS days_to_expiry
		FROM (
			SELECT sle.item, i.item_name, i.item_type, i.rack_location, sle.warehouse, sle.batch_no,
				sle.qty_after_transaction, sle.valuation_rate, b.expiry_date,
				ROW_NUMBER() OVER (
					PARTITION BY sle.item, sle.warehouse, sle.batch_no
					ORDER BY sle.posting_datetime DESC, sle.creation DESC
				) AS rn
			FROM `tabStock Ledger Entry` sle
			INNER JOIN `tabItem` i ON i.name = sle.item
			-- b.item = sle.item guards against a mismatched/mistyped batch on
			-- a ledger entry (e.g. a Paracetamol line accidentally tagged
			-- with a Cetirizine batch) - without it, this report would
			-- silently borrow the wrong item's expiry date instead of just
			-- having no reliable expiry info for that row.
			INNER JOIN `tabBatch` b ON b.name = sle.batch_no AND b.item = sle.item
			WHERE sle.batch_no IS NOT NULL AND sle.batch_no != '' {warehouse_condition} {item_where}
		) ranked
		WHERE rn = 1 AND qty_after_transaction > 0
		""",
		values,
		as_dict=True,
	)

	for row in rows:
		# Some Item records have stray leading/trailing whitespace (even a
		# literal tab character) baked into rack_location - stripped here so
		# it doesn't render as a lopsided gap in the report.
		row["rack_location"] = (row.rack_location or "").strip()
		if row.days_to_expiry is None:
			row["status"] = STATUS_SAFE
		elif row.days_to_expiry < 0:
			row["status"] = STATUS_EXPIRED
		elif row.days_to_expiry <= EXPIRING_SOON_DAYS:
			row["status"] = STATUS_EXPIRING_SOON
		else:
			row["status"] = STATUS_SAFE
		row["closing_value"] = flt(row.qty_after_transaction) * flt(row.valuation_rate)

	if status and status != STATUS_ALL:
		rows = [r for r in rows if r["status"] == status]

	# Most urgent (already expired, or expiring soonest) surfaces first
	# instead of getting buried under whatever the SQL's natural order was.
	rows.sort(key=lambda r: (r["days_to_expiry"] if r["days_to_expiry"] is not None else 99999))
	return rows
