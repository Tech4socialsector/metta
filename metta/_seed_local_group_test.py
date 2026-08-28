import frappe
from frappe.utils import today

from metta.sales.doctype.billing.billing import _billing_row
from metta.sales.page.daily_collection_report.daily_collection_report import get_local_group_wise_details

DUMMY_ITEMS = [
	("ZZZ-DUMMY-DENTAL", "ZZZ-Dummy Dental Checkup", "Dental", 100),
	("ZZZ-DUMMY-ECG", "ZZZ-Dummy ECG Test", "ECG", 100),
	("ZZZ-DUMMY-PHYSIO", "ZZZ-Dummy Physio Session", "Physiotherapy", 100),
	("ZZZ-DUMMY-ROOMWARD", "ZZZ-Dummy Room Ward Charge", "Room/Ward", 100),
]


def run():
	frappe.set_user("Administrator")

	for item_code, item_name, local_group, rate in DUMMY_ITEMS:
		if not frappe.db.exists("Item", item_code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": item_code,
					"item_name": item_name,
					"item_type": "Service",
					"local_group": local_group,
					"standard_selling_rate": rate,
				}
			).insert(ignore_permissions=True)
			print("Created item:", item_code)

	patient = frappe.db.get_value("Patient Registration", {}, "name")
	visit = frappe.get_doc(
		{
			"doctype": "Patient Visit",
			"registration_category": "OP",
			"uhin_id": patient,
			"billing_category": "General",
		}
	).insert(ignore_permissions=True)
	print("Visit:", visit.name)

	service_items = [_billing_row("CHEST-XRAY", "Chest X-Ray", 1), _billing_row("USG-ABDOMEN", "Ultrasound Abdomen", 1)]
	for item_code, item_name, _lg, _rate in DUMMY_ITEMS:
		service_items.append(_billing_row(item_code, item_name, 1))

	bill = frappe.get_doc(
		{
			"doctype": "Billing",
			"bill_type": "Service",
			"op_id": visit.name,
			"patient": visit.name,
			"customer_name": "ZZZ-Dummy TestPatient",
			"billing_category": "General",
			"service_items": service_items,
			"payment_mode": "Cash",
		}
	)
	bill.insert(ignore_permissions=True)
	bill.submit()
	print("Bill:", bill.name, "net_amount:", bill.net_amount)

	print("\nLocal Group Wise Details (today):")
	print(get_local_group_wise_details(today(), today()))
