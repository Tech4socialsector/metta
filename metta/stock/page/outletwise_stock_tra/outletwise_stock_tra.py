# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_data(from_date, to_date, warehouse=None, status=None):
	# One row per item line - "outlet-wise" means the same warehouse could be
	# on either side of a transfer (a store both sends and receives), so the
	# warehouse filter matches whichever side it's on, not just the source.
	frappe.has_permission("Stock Transfer", "read", throw=True)

	conditions = ["st.dispatch_date_time >= %(from_date)s", "st.dispatch_date_time <= %(to_date)s"]
	values = {"from_date": from_date, "to_date": to_date}

	if warehouse:
		conditions.append("(st.from_warehouse = %(warehouse)s OR st.to_warehouse = %(warehouse)s)")
		values["warehouse"] = warehouse
	if status:
		conditions.append("st.status = %(status)s")
		values["status"] = status

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			st.dispatch_date_time, st.name AS stock_transfer, st.from_warehouse, st.to_warehouse,
			st.status, st.has_discrepancy, sti.item, sti.item_name, sti.batch,
			sti.qty_dispatched, sti.qty_confirmed
		FROM `tabStock Transfer Item` sti
		INNER JOIN `tabStock Transfer` st ON st.name = sti.parent
		WHERE {where_clause}
		ORDER BY st.dispatch_date_time ASC, st.name ASC
		""",
		values,
		as_dict=True,
	)
