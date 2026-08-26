import frappe

def run():
    frappe.set_user("Administrator")
    if frappe.db.exists("Staff Member", {"staff_name": "Visibility Test Staff"}):
        frappe.delete_doc("Staff Member", frappe.db.get_value("Staff Member", {"staff_name": "Visibility Test Staff"}, "name"), force=True, ignore_permissions=True)
    staff = frappe.get_doc({"doctype": "Staff Member", "staff_name": "Visibility Test Staff"}).insert(ignore_permissions=True)

    uid = "PROPERSTAFF-1"
    if frappe.db.exists("Patient Registration", {"uid": uid}):
        frappe.delete_doc("Patient Registration", frappe.db.get_value("Patient Registration", {"uid": uid}, "name"), force=True, ignore_permissions=True)
    reg = frappe.get_doc({
        "doctype": "Patient Registration", "first_name": "Proper Staff", "uid": uid, "sex": "Male",
        "staff_status": "Staff", "staff_member": staff.name,
    }).insert(ignore_permissions=True)
    print("Registration billing_category:", reg.billing_category)

    reg_type = frappe.get_all("Registration type Master", limit=1, pluck="name")[0]
    visit = frappe.get_doc({
        "doctype": "Patient Visit", "uhin_id": reg.name, "registration_category": "OP", "registration_type": reg_type,
    }).insert(ignore_permissions=True)
    print("Visit billing_category:", visit.billing_category, "net_amount:", visit.net_amount)
    assert visit.billing_category == "Staff"

    frappe.delete_doc("Patient Visit", visit.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Registration", reg.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Staff Member", staff.name, force=True, ignore_permissions=True)
    frappe.db.commit()
    print("cleaned up, ALL GOOD")
