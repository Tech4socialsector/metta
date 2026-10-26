import frappe

# Pack on purchase lines now links to Unit of Measure, which only held
# "Tablet" - add the common packs so the first order can pick one. The admin
# adds any others (Ampoule, Packet...) from the Unit of Measure list.
PACKS = ("Strip", "Box", "Bottle", "Vial", "Tube", "Sachet")


def execute():
	for name in PACKS:
		if not frappe.db.exists("Unit of Measure", name):
			frappe.get_doc({"doctype": "Unit of Measure"}).insert(set_name=name, ignore_permissions=True)
