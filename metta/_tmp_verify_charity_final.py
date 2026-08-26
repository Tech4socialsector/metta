import frappe

def run():
    frappe.set_user("Administrator")

    uid = "CHARITYFINAL-1"
    if frappe.db.exists("Patient Registration", {"uid": uid}):
        frappe.delete_doc("Patient Registration", frappe.db.get_value("Patient Registration", {"uid": uid}, "name"), force=True, ignore_permissions=True)

    reg = frappe.get_doc({
        "doctype": "Patient Registration",
        "first_name": "Poor Village Patient",
        "uid": uid,
        "sex": "Male",
        "charity_amount": 300,
    }).insert(ignore_permissions=True)
    print("1. Registration charity_amount:", reg.charity_amount)
    assert float(reg.charity_amount) == 300

    reg_type = frappe.get_all("Registration type Master", limit=1, pluck="name")[0]
    visit = frappe.get_doc({
        "doctype": "Patient Visit", "uhin_id": reg.name, "registration_category": "OP", "registration_type": reg_type,
    }).insert(ignore_permissions=True)
    print("2. Visit charity_amount (inherited default):", visit.charity_amount, "fee_amount:", visit.fee_amount,
          "discount_amount:", visit.discount_amount, "net_amount:", visit.net_amount)
    assert float(visit.charity_amount) == 300
    assert float(visit.discount_amount) == min(300, float(visit.fee_amount))

    # Override with an independent Visit-time decision - must actually stick now
    visit.charity_amount = 100
    visit.save(ignore_permissions=True)
    print("3. Visit charity_amount (overridden to 100):", visit.charity_amount, "discount_amount:", visit.discount_amount)
    assert float(visit.charity_amount) == 100, f"BUG STILL PRESENT: {visit.charity_amount}"
    assert float(visit.discount_amount) == 100

    # Save AGAIN with no changes - must still stick (not silently revert)
    visit.save(ignore_permissions=True)
    print("4. Visit charity_amount (after a 2nd untouched save):", visit.charity_amount)
    assert float(visit.charity_amount) == 100, f"BUG STILL PRESENT ON RE-SAVE: {visit.charity_amount}"

    # Switch to percentage-based discount instead (clear charity_amount, set billing_category+percent)
    visit.charity_amount = 0
    visit.billing_category = "General"
    visit.discount_percent = 15
    visit.save(ignore_permissions=True)
    print("5. Visit with discount_percent=15 (charity_amount cleared):", visit.discount_percent, "discount_amount:", visit.discount_amount)
    assert float(visit.discount_percent) == 15, f"discount_percent bug: {visit.discount_percent}"
    assert abs(float(visit.discount_amount) - float(visit.fee_amount) * 0.15) < 0.01

    # Re-save again untouched - percent must still stick
    visit.save(ignore_permissions=True)
    print("6. discount_percent after untouched re-save:", visit.discount_percent)
    assert float(visit.discount_percent) == 15, f"BUG on re-save: {visit.discount_percent}"

    # Cap test: charity larger than fee
    visit.charity_amount = 999999
    visit.save(ignore_permissions=True)
    print("7. Huge charity_amount capped - discount_amount:", visit.discount_amount, "net_amount:", visit.net_amount)
    assert float(visit.net_amount) == 0
    assert float(visit.discount_amount) == float(visit.fee_amount)

    print("ALL CHECKS PASSED")

    frappe.delete_doc("Patient Visit", visit.name, force=True, ignore_permissions=True)
    frappe.delete_doc("Patient Registration", reg.name, force=True, ignore_permissions=True)
    frappe.db.commit()
    print("cleaned up")
