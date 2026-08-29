import frappe

def cancel_and_delete(doctype, name):
	try:
		doc = frappe.get_doc(doctype, name)
		if doc.docstatus == 1:
			doc.cancel()
		frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
		print(f"Cleaned: {doctype} {name}")
	except Exception as e:
		print(f"Could not clean {doctype} {name}: {e}")

def run():
	frappe.set_user("Administrator")
	frappe.db.commit()

	billing_names = [r[0] for r in frappe.db.sql("SELECT parent FROM `tabSales Bill Item` WHERE item='FLOWTEST001'")]
	for n in set(billing_names):
		cancel_and_delete("Billing", n)

	transfer_names = [r[0] for r in frappe.db.sql("SELECT parent FROM `tabStock Transfer Item` WHERE item='FLOWTEST001'")]
	for n in set(transfer_names):
		cancel_and_delete("Stock Transfer", n)

	indent_names = [r[0] for r in frappe.db.sql("SELECT parent FROM `tabStock Indent Item` WHERE item='FLOWTEST001'")]
	for n in set(indent_names):
		cancel_and_delete("Stock Indent", n)

	bill_names = [r[0] for r in frappe.db.sql("SELECT parent FROM `tabPurchase Bill Item` WHERE item='FLOWTEST001'")]
	for n in set(bill_names):
		cancel_and_delete("Purchase Bill", n)

	receipt_names = [r[0] for r in frappe.db.sql("SELECT parent FROM `tabPurchase Receipt Item` WHERE item='FLOWTEST001'")]
	for n in set(receipt_names):
		cancel_and_delete("Purchase Receipt", n)

	po_names = [r[0] for r in frappe.db.sql("SELECT parent FROM `tabPurchase Order Item` WHERE item='FLOWTEST001'")]
	for n in set(po_names):
		cancel_and_delete("Purchase Order", n)

	batch_names = [r[0] for r in frappe.db.sql("SELECT name FROM `tabBatch` WHERE item='FLOWTEST001'")]
	for n in set(batch_names):
		try:
			frappe.get_doc("Batch", n).db_set("disabled", 1)
			print("Disabled batch (kept, not deleted, since Stock Ledger history references it):", n)
		except Exception as e:
			print("Could not disable batch", n, e)

	try:
		frappe.delete_doc("Item", "FLOWTEST001", force=True, ignore_permissions=True)
		print("Cleaned: Item FLOWTEST001")
	except Exception as e:
		print("Could not delete Item FLOWTEST001:", e)

	frappe.db.commit()
