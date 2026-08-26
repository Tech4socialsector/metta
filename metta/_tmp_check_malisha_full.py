import frappe

def run():
    print("Patient Registration HIN-000059:", frappe.db.get_value("Patient Registration", "HIN-000059", ["patient_name", "uid"], as_dict=True))
    visits = frappe.get_all("Patient Visit", filters={"uhin_id": "HIN-000059"}, fields=["name", "registration_type", "registration_category", "date", "time", "docstatus"])
    print("All Patient Visits for HIN-000059:")
    for v in visits:
        print(" ", v)
