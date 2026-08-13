# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_data(from_date, to_date, supplier=None, status=None):
	# One row per item line, not per PO - a 3-item order shows as 3 rows, each
	# carrying its parent PO's date/supplier/status alongside, so the report
	# reads as a true item-level daily register, not just a list of PO totals.
	frappe.has_permission("Purchase Order", "read", throw=True)

	conditions = ["po.order_date >= %(from_date)s", "po.order_date <= %(to_date)s"]
	values = {"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"}

	if supplier:
		conditions.append("po.supplier = %(supplier)s")
		values["supplier"] = supplier
	if status:
		conditions.append("po.status = %(status)s")
		values["status"] = status

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			po.order_date, po.name AS purchase_order, po.supplier, po.status,
			po.expected_delivery, poi.item, poi.item_name, poi.qty_ordered,
			poi.qty_received, poi.rate, poi.amount
		FROM `tabPurchase Order Item` poi
		INNER JOIN `tabPurchase Order` po ON po.name = poi.parent
		WHERE {where_clause}
		ORDER BY po.order_date ASC, po.name ASC
		""",
		values,
		as_dict=True,
	)
