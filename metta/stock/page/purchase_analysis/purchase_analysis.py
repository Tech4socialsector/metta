# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_data(from_date, to_date, supplier=None, item=None):
	# Qty Ordered/Received are already cached directly on Purchase Order Item,
	# so that part needs no join at all. Billed amount is the only figure
	# that has to be traced through: PO -> Purchase Receipt (purchase_order)
	# -> Purchase Bill (purchase_receipt) -> Purchase Bill Item (matched by
	# item), summed per PO+item since one PO can span multiple receipts/bills.
	frappe.has_permission("Purchase Order", "read", throw=True)

	conditions = ["po.order_date >= %(from_date)s", "po.order_date <= %(to_date)s"]
	values = {"from_date": f"{from_date} 00:00:00", "to_date": f"{to_date} 23:59:59"}

	if supplier:
		conditions.append("po.supplier = %(supplier)s")
		values["supplier"] = supplier
	if item:
		conditions.append("poi.item = %(item)s")
		values["item"] = item

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			po.name AS purchase_order, po.order_date, po.supplier, po.status,
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
		ORDER BY po.order_date ASC, po.name ASC
		""",
		values,
		as_dict=True,
	)
