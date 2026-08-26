import frappe

def run():
    print("System Settings time_zone:", frappe.db.get_single_value("System Settings", "time_zone"))
    print("frappe.utils.now():", frappe.utils.now())
    print("frappe.utils.now_datetime():", frappe.utils.now_datetime())
