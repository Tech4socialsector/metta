import frappe

# Management opens these records read-only from the Hospital Dashboard. The
# doctype JSONs carry that permission, but a doctype with any Custom DocPerm
# rows (set in Role Permission Manager on a site) ignores its JSON
# permissions - so the same read row is added there too. Doctypes without
# custom rows are left alone: adding one would hide every other role's
# standard permissions.
DOCTYPES = (
	"Patient Visit",
	"Patient Registration",
	"Nurse Interventions",
	"Doctor Consultation",
	"Diagnostic Test",
	"Billing",
	"Patient Advance",
	"Discharge Bill",
	"Stock Balance",
	"Batch",
	"Purchase Order",
	"Purchase Bill",
	"Material Issue",
)


def execute():
	if not frappe.db.exists("Role", "Management"):
		frappe.get_doc({"doctype": "Role", "role_name": "Management", "desk_access": 1}).insert(ignore_permissions=True)

	for doctype in DOCTYPES:
		if not frappe.db.exists("Custom DocPerm", {"parent": doctype}):
			continue
		if frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": "Management", "permlevel": 0}):
			continue
		frappe.get_doc(
			{
				"doctype": "Custom DocPerm",
				"parent": doctype,
				"parenttype": "DocType",
				"parentfield": "permissions",
				"role": "Management",
				"permlevel": 0,
				"read": 1,
			}
		).insert(ignore_permissions=True)
	frappe.clear_cache()
