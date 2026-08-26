import frappe

def run():
    frappe.set_user("Administrator")

    uid = "NURSETEST-1"
    if frappe.db.exists("Patient Registration", {"uid": uid}):
        old = frappe.db.get_value("Patient Registration", {"uid": uid}, "name")
        for v in frappe.get_all("Patient Visit", filters={"uhin_id": old}, pluck="name"):
            frappe.delete_doc("Nurse Interventions", {"patient_registration": v}, force=True, ignore_permissions=True) if frappe.db.exists("Nurse Interventions", {"patient_registration": v}) else None
            frappe.delete_doc("Patient Visit", v, force=True, ignore_permissions=True)
        frappe.delete_doc("Patient Registration", old, force=True, ignore_permissions=True)

    reg = frappe.get_doc({
        "doctype": "Patient Registration", "first_name": "Nurse Test", "uid": uid, "sex": "Female",
    }).insert(ignore_permissions=True)

    reg_type = frappe.get_all("Registration type Master", limit=1, pluck="name")[0]
    visit1 = frappe.get_doc({
        "doctype": "Patient Visit", "uhin_id": reg.name, "registration_category": "OP", "registration_type": reg_type,
    }).insert(ignore_permissions=True)

    # First Nurse Interventions record - high blood sugar
    ni1 = frappe.get_doc({
        "doctype": "Nurse Interventions", "patient_registration": visit1.name, "rbg_level": 220,
    }).insert(ignore_permissions=True)
    print("ni1 status:", ni1.status, "| gender:", ni1.gender, "| blood_sugar_status:", ni1.blood_sugar_status)
    assert ni1.status == "Completed"
    assert ni1.gender == "Female"
    assert ni1.blood_sugar_status == "High"
    assert not hasattr(ni1, "occupation")

    from metta.metta.doctype.nurse_interventions.nurse_interventions import get_high_blood_sugar_history
    hist = get_high_blood_sugar_history(reg.name, exclude=ni1.name)
    print("history for a fresh 2nd record (excluding ni1):", hist)
    assert len(hist) == 1
    assert hist[0]["name"] == ni1.name

    print("ALL CHECKS PASSED")

    frappe.delete_doc("Nurse Interventions", ni1.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Visit", visit1.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Registration", reg.name, force=True, ignore_permissions=True)
    frappe.db.commit()
    print("cleaned up")
