
import frappe


def run():
	pr = frappe.get_doc(
		{
			"doctype": "Patient Registration",
			"registration_category": "OP",
			"uhin_id": "HIN-000001",
			"first_name": "placeholder",
			"sex": "Female",
		}
	)
	pr.insert(ignore_permissions=True)

	ni = frappe.get_all(
		"Nurse Interventions",
		filters={"patient_registration": pr.name},
		fields=["name", "status", "patient_unique_id", "patient_name"],
	)
	
	result = {"registration": pr.name, "nurse_interventions": ni}

	# cleanup
	for row in ni:
		frappe.delete_doc("Nurse Interventions", row.name, force=True, ignore_permissions=True)
	frappe.delete_doc("Patient Registration", pr.name, force=True, ignore
				   _permissions=True)

	return