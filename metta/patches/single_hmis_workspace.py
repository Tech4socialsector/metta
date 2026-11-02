import frappe

# Desk keeps one HMIS tile that opens the Vue app at /hmis (user, 2026-11-02);
# the twelve role workspaces are hidden, not deleted, so every form still
# opens from search or a link and any of them can be shown again.
HMIS_ROLES = [
	"Front Desk",
	"Nurse",
	"Doctor",
	"Lab Staff",
	"Lab Verifier",
	"Billing Staff",
	"Account Staff",
	"Pharmacy Staff",
	"Store Staff",
	"Warehouse Staffs",
	"Purchase Approver",
	"Management",
	"System Manager",
]
HIDDEN = [
	"Stock and Pharmacy",
	"Master Form",
	"Front Desk",
	"Nurse",
	"Doctor",
	"Store Desk",
	"Pharmacy Desk",
	"Purchase Desk",
	"Warehouse Desk",
	"Lab",
	"Account Desk",
	"Billing Desk",
]


def execute():
	for name in HIDDEN:
		if frappe.db.exists("Desktop Icon", name):
			frappe.db.set_value("Desktop Icon", name, "hidden", 1)
		if frappe.db.exists("Workspace", name):
			frappe.db.set_value("Workspace", name, "is_hidden", 1)

	# Same as the CHW App tile: link_type "External" routes the Desk tile to
	# window.location.origin + link, and a URL workspace is a plain redirect.
	if frappe.db.exists("Desktop Icon", "HMIS"):
		icon = frappe.get_doc("Desktop Icon", "HMIS")
		icon.update({"link_type": "External", "link": "/hmis", "link_to": None, "hidden": 0})
		_set_roles(icon)
		icon.save(ignore_permissions=True)

	if frappe.db.exists("Workspace", "HMIS"):
		ws = frappe.get_doc("Workspace", "HMIS")
		ws.update({"type": "URL", "external_link": "/hmis", "is_hidden": 0})
		_set_roles(ws)
		ws.save(ignore_permissions=True)


def _set_roles(doc):
	# Before this, only System Manager could see the HMIS tile.
	doc.set("roles", [{"role": r} for r in HMIS_ROLES if frappe.db.exists("Role", r)])
