import frappe

def run():
    frappe.set_user("Administrator")
    uid = "MANDTEST-1"
    if frappe.db.exists("Patient Registration", {"uid": uid}):
        old = frappe.db.get_value("Patient Registration", {"uid": uid}, "name")
        for v in frappe.get_all("Patient Visit", filters={"uhin_id": old}, pluck="name"):
            for n in frappe.get_all("Nurse Interventions", filters={"patient_registration": v}, pluck="name"):
                frappe.delete_doc("Nurse Interventions", n, force=True, ignore_permissions=True)
            frappe.delete_doc("Patient Visit", v, force=True, ignore_permissions=True)
        frappe.delete_doc("Patient Registration", old, force=True, ignore_permissions=True)

    reg = frappe.get_doc({"doctype": "Patient Registration", "first_name": "Mand Test", "uid": uid, "sex": "Male"}).insert(ignore_permissions=True)
    reg_type = frappe.get_all("Registration type Master", limit=1, pluck="name")[0]
    v = frappe.get_doc({"doctype": "Patient Visit", "uhin_id": reg.name, "registration_category": "OP", "registration_type": reg_type}).insert(ignore_permissions=True)

    try:
        ni = frappe.get_doc({"doctype": "Nurse Interventions", "patient_registration": v.name})
        ni.insert(ignore_permissions=True)
        print("ERROR: saved without mandatory vitals!")
        frappe.delete_doc("Nurse Interventions", ni.name, force=True, ignore_permissions=True)
    except frappe.MandatoryError as e:
        print("Correctly blocked missing vitals:", str(e))

    # Now with all vitals filled - should succeed
    ni2 = frappe.get_doc({
        "doctype": "Nurse Interventions", "patient_registration": v.name,
        "temperature": "98.6", "pulse": "72", "respiration": "16", "saturation": "98",
        "height": 170, "weight": 65, "blood_pressure_mmhg": "120/80",
    }).insert(ignore_permissions=True)
    print("Saved successfully with all vitals filled, status:", ni2.status)

    frappe.delete_doc("Nurse Interventions", ni2.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Visit", v.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Registration", reg.name, force=True, ignore_permissions=True)
    frappe.db.commit()
    print("cleaned up")
