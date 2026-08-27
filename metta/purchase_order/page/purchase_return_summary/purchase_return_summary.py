# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_data(from_date, to_date, supplier=None, warehouse=None, status=None, return_reason=None):
	# One row per return item line, same "flat rows -> grouped in JS"
	# convention as Supplier Wise Purchase. Two Purchase Receipts are joined
	# in besides the Return itself:
	#   - orig_pr: the receipt the return was raised against, so its own
	#     purchase_order tells you which PO the damaged/expired stock
	#     originally came from.
	#   - repl_pr: a *different* receipt that names this return as what it's
	#     replacing (Purchase Receipt.replacement_for) - only present once
	#     the supplier has actually sent replacement stock back, so this is
	#     how "which replacement PO closed out this return" is answered
	#     without a new field anywhere.
	frappe.has_permission("Purchase Return", "read", throw=True)

	# Draft returns haven't been submitted (no stock/credit impact yet, see
	# PurchaseReturn.on_submit) so they're excluded the same way Draft Stock
	# Indents are left out of Stock Position - only real events count here.
	conditions = [
		"pret.docstatus != 0",
		"DATE(pret.return_date_time) >= %(from_date)s",
		"DATE(pret.return_date_time) <= %(to_date)s",
	]
	values = {"from_date": from_date, "to_date": to_date}

	if supplier:
		conditions.append("pret.supplier = %(supplier)s")
		values["supplier"] = supplier
	if warehouse:
		conditions.append("pret.from_warehouse = %(warehouse)s")
		values["warehouse"] = warehouse
	if status:
		conditions.append("pret.status = %(status)s")
		values["status"] = status
	if return_reason:
		conditions.append("pri.return_reason = %(return_reason)s")
		values["return_reason"] = return_reason

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			pret.name AS purchase_return, pret.supplier, pret.return_date_time, pret.from_warehouse,
			pret.against_purchase_receipt, pret.total_credit_amount, pret.status, pret.docstatus,
			orig_pr.purchase_order AS original_purchase_order,
			repl_pr.name AS replacement_receipt, repl_pr.purchase_order AS replacement_purchase_order,
			pri.item, pri.item_name, pri.batch, pri.qty_returned, pri.rate, pri.amount, pri.return_reason
		FROM `tabPurchase Return Item` pri
		INNER JOIN `tabPurchase Return` pret ON pret.name = pri.parent
		LEFT JOIN `tabPurchase Receipt` orig_pr ON orig_pr.name = pret.against_purchase_receipt
		LEFT JOIN `tabPurchase Receipt` repl_pr ON repl_pr.replacement_for = pret.name AND repl_pr.docstatus = 1
		WHERE {where_clause}
		ORDER BY pret.return_date_time DESC, pret.name ASC
		""",
		values,
		as_dict=True,
	)
