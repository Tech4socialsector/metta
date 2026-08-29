import frappe


def run():
	modules = frappe.get_all("Module Def", filters={"app_name": "metta"}, pluck="name")
	doctypes = frappe.get_all(
		"DocType", filters={"module": ["in", modules], "istable": 0, "issingle": 0}, pluck="name"
	)

	for doctype in doctypes:
		table = f"tab{doctype}"
		count_before = frappe.db.count(doctype)
		frappe.db.sql(f"DELETE FROM `{table}`")
		if count_before:
			print(f"{doctype}: cleared {count_before} record(s)")

	child_doctypes = frappe.get_all("DocType", filters={"module": ["in", modules], "istable": 1}, pluck="name")
	for doctype in child_doctypes:
		table = f"tab{doctype}"
		frappe.db.sql(f"DELETE FROM `{table}`")

	frappe.db.sql("DELETE FROM `tabSeries`")
	print("\nCleared naming series counters and all child table rows.")

	frappe.db.commit()
	print("\nAll test data wiped.")
