import frappe

def run():
	frappe.set_user("Administrator")
	if frappe.db.exists("Service Rate List", "CONSULT-FEE"):
		doc = frappe.get_doc("Service Rate List", "CONSULT-FEE")
		print("Already exists, current_rate:", doc.current_rate)
	else:
		doc = frappe.get_doc({
			"doctype": "Service Rate List",
			"item": "CONSULT-FEE",
			"current_rate": 500,
			"start_date": frappe.utils.today(),
		})
		doc.insert()
		frappe.db.commit()
		print("Created Service Rate List:", doc.name)

	rate_after = frappe.db.get_value("Item", "CONSULT-FEE", "standard_selling_rate")
	print("Item.standard_selling_rate after sync:", rate_after)

	# Now test update_rate() - the real user-facing rate-change path
	from metta.master.doctype.service_rate_list.service_rate_list import update_rate
	new_rate = update_rate(doc.name, 600)
	print("update_rate() returned:", new_rate)
	rate_after_update = frappe.db.get_value("Item", "CONSULT-FEE", "standard_selling_rate")
	print("Item.standard_selling_rate after update_rate:", rate_after_update)

	# Confirm Billing's own row-builder picks up the new rate correctly
	from metta.sales.doctype.billing.billing import _billing_row
	row = _billing_row("CONSULT-FEE", "Doctor Consultation Fee", 1)
	print("Billing row rate:", row["rate"], "| uom:", row["uom"])
