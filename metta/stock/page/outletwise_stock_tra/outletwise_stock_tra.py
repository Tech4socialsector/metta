# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_data(from_date, to_date, from_warehouse=None, to_warehouse=None, status=None):
	# One row per item line - From/To Warehouse are separate directional
	# filters (e.g. From = Central Store, To = Pharmacy) so staff can see
	# exactly which route moved stock, not just "involved this warehouse".
	frappe.has_permission("Stock Transfer", "read", throw=True)

	conditions = ["st.dispatch_date_time >= %(from_date)s", "st.dispatch_date_time <= %(to_date)s"]
	values = {"from_date": from_date, "to_date": to_date}

	if from_warehouse:
		conditions.append("st.from_warehouse = %(from_warehouse)s")
		values["from_warehouse"] = from_warehouse
	if to_warehouse:
		conditions.append("st.to_warehouse = %(to_warehouse)s")
		values["to_warehouse"] = to_warehouse
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
