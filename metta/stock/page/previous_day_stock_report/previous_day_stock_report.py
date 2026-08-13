# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_data(as_of_date, warehouse=None, item=None):
	# Stock Balance only ever holds the CURRENT qty - there's no stored
	# history of what it was on any past day. This reconstructs it: for each
	# item/warehouse/batch, the last ledger entry on or before the chosen
	# date IS the closing balance for that day (qty_after_transaction is a
	# running total, so whichever entry is most recent already reflects it).
	frappe.has_permission("Stock Ledger Entry", "read", throw=True)

	conditions = ["sle.posting_datetime <= %(as_of_datetime)s"]
	values = {"as_of_datetime": f"{as_of_date} 23:59:59"}

	if warehouse:
		conditions.append("sle.warehouse = %(warehouse)s")
		values["warehouse"] = warehouse
	if item:
		conditions.append("sle.item = %(item)s")
		values["item"] = item

	where_clause = " AND ".join(conditions)

	# Zero-qty rows are returned too (not filtered out here) - the page
	# needs them to compute a "how many items are at zero stock" count,
	# even though they're excluded from the main detail table on screen.
	return frappe.db.sql(
		f"""
		SELECT item, item_name, warehouse, batch_no, qty_after_transaction,
			valuation_rate, posting_datetime, voucher_type, voucher_no
		FROM (
			SELECT sle.*,
				ROW_NUMBER() OVER (
					PARTITION BY sle.item, sle.warehouse, sle.batch_no
					ORDER BY sle.posting_datetime DESC, sle.creation DESC
				) AS rn
			FROM `tabStock Ledger Entry` sle
			WHERE {where_clause}
		) ranked
		WHERE rn = 1
		ORDER BY item ASC, warehouse ASC
		""",
		values,
		as_dict=True,
	)
