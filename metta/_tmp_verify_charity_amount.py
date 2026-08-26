import frappe

def run():
    frappe.set_user("Administrator")

    uid = "CHARITYTEST-1"
    if frappe.db.exists("Patient Registration", {"uid": uid}):
        frappe.delete_doc("Patient Registration", frappe.db.get_value("Patient Registration", {"uid": uid}, "name"), force=True, ignore_permissions=True)

    # 1. Patient Registration with a recommended Charity Amount (no fee to apply yet)
    reg = frappe.get_doc({
        "doctype": "Patient Registration",
        "first_name": "Poor Village Patient",
        "uid": uid,
        "sex": "Male",
        "charity_amount": 300,
    }).insert(ignore_permissions=True)
    print("Registration charity_amount:", reg.charity_amount)
    assert float(reg.charity_amount) == 300

    # 2. Create a Patient Visit for this patient - should inherit the charity_amount as a default
    reg_type = frappe.get_all("Registration type Master", limit=1, pluck="name")
    if not reg_type:
        print("No Registration type Master exists - skipping Visit test")
        frappe.delete_doc("Patient Registration", reg.name, force=True, ignore_permissions=True)
        frappe.db.commit()
        return
    reg_type = reg_type[0]
    fee = frappe.db.get_value("Registration type Master", reg_type, "fee_amount") or 500

    visit = frappe.get_doc({
        "doctype": "Patient Visit",
        "uhin_id": reg.name,
        "registration_category": "OP",
        "registration_type": reg_type,
    }).insert(ignore_permissions=True)
    print("Visit charity_amount (inherited):", visit.charity_amount, "fee_amount:", visit.fee_amount, "discount_amount:", visit.discount_amount, "net_amount:", visit.net_amount)
    assert float(visit.charity_amount) == 300
    assert float(visit.discount_amount) == min(300, float(visit.fee_amount))
    assert float(visit.net_amount) == float(visit.fee_amount) - float(visit.discount_amount)

    # 3. Now override charity_amount at Visit time with a DIFFERENT (independent) decision
    visit.charity_amount = 100
    visit.save(ignore_permissions=True)
    print("Visit charity_amount (overridden):", visit.charity_amount, "discount_amount:", visit.discount_amount, "net_amount:", visit.net_amount)
    assert float(visit.discount_amount) == 100
    assert float(visit.net_amount) == float(visit.fee_amount) - 100

    # 4. Charity amount larger than fee should cap at fee (never negative net_amount)
    visit.charity_amount = 999999
    visit.save(ignore_permissions=True)
    print("Visit charity_amount (huge, should cap):", visit.discount_amount, "net_amount:", visit.net_amount)
    assert float(visit.net_amount) == 0
    assert float(visit.discount_amount) == float(visit.fee_amount)

    print("ALL CHECKS PASSED")

    frappe.delete_doc("Patient Visit", visit.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Registration", reg.name, force=True, ignore_permissions=True)
    frappe.db.commit()
    print("cleaned up")
