import frappe

from metta.patches.reset_desktop_layouts import execute as reset_desktop_layouts

# Desk home keeps only HMIS and CHW App (user, 2026-11-02): the Framework
# folder (Build, Data, Users...) is hidden too. Its pages still open from
# search or /desk/build, so doctypes can still be changed in Desk.


def execute():
	if frappe.db.exists("Desktop Icon", "Framework"):
		frappe.db.set_value("Desktop Icon", "Framework", "hidden", 1)
	# A saved layout overrides "hidden", so clear them again.
	reset_desktop_layouts()
