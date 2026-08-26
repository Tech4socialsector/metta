import frappe

def run():
    frappe.set_user("Administrator")
    uid = "FULLFLOW-1"
    if frappe.db.exists("Patient Registration", {"uid": uid}):
        old = frappe.db.get_value("Patient Registration", {"uid": uid}, "name")
        for v in frappe.get_all("Patient Visit", filters={"uhin_id": old}, pluck="name"):
            for n in frappe.get_all("Nurse Interventions", filters={"patient_registration": v}, pluck="name"):
                frappe.delete_doc("Nurse Interventions", n, force=True, ignore_permissions=True)
            frappe.delete_doc("Patient Visit", v, force=True, ignore_permissions=True)
        frappe.delete_doc("Patient Registration", old, force=True, ignore_permissions=True)

    reg = frappe.get_doc({"doctype": "Patient Registration", "first_name": "Full Flow", "uid": uid, "sex": "Male"}).insert(ignore_permissions=True)
    reg_type = frappe.get_all("Registration type Master", limit=1, pluck="name")[0]

    # Step 1: creating the Patient Visit must succeed and auto-create a blank Pending placeholder
    v = frappe.get_doc({"doctype": "Patient Visit", "uhin_id": reg.name, "registration_category": "OP", "registration_type": reg_type}).insert(ignore_permissions=True)
    print("Patient Visit created successfully:", v.name)

    ni_list = frappe.get_all("Nurse Interventions", filters={"patient_registration": v.name}, fields=["name", "status"])
    print("Auto-created Nurse Interventions:", ni_list)
    assert len(ni_list) == 1
    assert ni_list[0]["status"] == "Pending"

    # Step 2: nurse tries to save the SAME record without vitals - should be blocked
    ni = frappe.get_doc("Nurse Interventions", ni_list[0]["name"])
    try:
        ni.save(ignore_permissions=True)
        print("ERROR: saved without vitals!")
    except frappe.MandatoryError:
        print("Correctly blocked: nurse can't save without filling in vitals")

    # Step 3: nurse fills in vitals and saves - should succeed and flip to Completed
    ni.temperature = "98.6"
    ni.pulse = "72"
    ni.respiration = "16"
    ni.saturation = "98"
    ni.height = 170
    ni.weight = 65
    ni.blood_pressure_mmhg = "120/80"
    ni.save(ignore_permissions=True)
    print("After nurse fills vitals and saves - status:", ni.status)
    assert ni.status == "Completed"

    print("ALL CHECKS PASSED")

    frappe.delete_doc("Nurse Interventions", ni.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Visit", v.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Registration", reg.name, force=True, ignore_permissions=True)
    frappe.db.commit()
    print("cleaned up")
