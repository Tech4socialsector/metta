# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_data(from_date=None, to_date=None, supplier=None, status=None):
	# One row per PO item line, same shape as Purchase Analysis - the page
	# groups these into one row per Supplier on the client, with the item
	# lines available underneath as the expandable detail (mirroring
	# Outletwise Stock Transfer Summary's group/detail pattern).
	#
	# Every filter here is optional - loading the page with none of them set
	# shows every PO across every supplier, so narrowing down to one
	# supplier's history is a matter of picking it from the filter, not a
	# prerequisite for seeing anything at all.
	frappe.has_permission("Purchase Order", "read", throw=True)
	frappe.has_permission("Purchase Bill", "read", throw=True)

	conditions = []
	values = {}

	if from_date:
		conditions.append("po.order_date >= %(from_date)s")
		values["from_date"] = f"{from_date} 00:00:00"
	if to_date:
		conditions.append("po.order_date <= %(to_date)s")
		values["to_date"] = f"{to_date} 23:59:59"
	if supplier:
		conditions.append("po.supplier = %(supplier)s")
		values["supplier"] = supplier
	if status:
		conditions.append("po.status = %(status)s")
		values["status"] = status

	where_clause = " AND ".join(conditions) if conditions else "1=1"

	return frappe.db.sql(
		f"""
		SELECT
			po.supplier, po.name AS purchase_order, po.order_date, po.status,
			poi.item, poi.item_name, poi.qty_ordered, poi.qty_received, poi.rate,
			poi.amount AS ordered_amount,
			COALESCE(billed.billed_amount, 0) AS billed_amount
		FROM `tabPurchase Order Item` poi
		INNER JOIN `tabPurchase Order` po ON po.name = poi.parent
		LEFT JOIN (
			SELECT pr.purchase_order AS po_name, pbi.item AS item, SUM(pbi.amount) AS billed_amount
			FROM `tabPurchase Receipt` pr
			INNER JOIN `tabPurchase Bill` pb ON pb.purchase_receipt = pr.name
			INNER JOIN `tabPurchase Bill Item` pbi ON pbi.parent = pb.name
			GROUP BY pr.purchase_order, pbi.item
		) billed ON billed.po_name = po.name AND billed.item = poi.item
		WHERE {where_clause}
		ORDER BY po.supplier ASC, po.order_date ASC, po.name ASC
		""",
		values,
		as_dict=True,
	)
