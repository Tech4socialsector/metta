import frappe

# A user's saved Desktop Layout overrides Desktop Icon.hidden, so after
# single_hmis_workspace the old role tiles still showed for anyone who had a
# layout saved. Deleting the saved layouts (Frappe's own "Reset to default")
# lets Desk show only the visible icons: HMIS and CHW App (user, 2026-11-02).


def execute():
	for user in frappe.get_all("Desktop Layout", pluck="name"):
		frappe.delete_doc("Desktop Layout", user, ignore_permissions=True, force=True)
	frappe.cache.delete_key("desktop_icons")
	frappe.cache.delete_key("bootinfo")
