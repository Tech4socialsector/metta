# Server helpers for the Vue purchase screens (frontend/src/pages/Purchase).
# Everything else those screens do reuses the Desk forms' own methods.

import frappe
from frappe import _

from metta.api import get_doc_permissions

PURCHASE_DOCTYPES = (
	"Purchase Order",
	"Purchase Receipt",
	"Quality Inspection",
	"Purchase Bill",
	"Purchase Return",
)


@frappe.whitelist()
def get_permissions(doctype, name=None):
	# Same answer as metta.api.get_doc_permissions plus "amend": a rejected
	# Purchase Bill is cancelled by reject_bill() and fixed through Amend, so
	# the Vue form must know whether to offer it - and that helper doesn't
	# report it. Limited to the purchase doctypes this screen serves.
	if doctype not in PURCHASE_DOCTYPES:
		frappe.throw(_("Not a purchase document."), frappe.PermissionError)
	perms = get_doc_permissions(doctype, name)
	doc = frappe.get_doc(doctype, name) if name else None
	perms["amend"] = bool(frappe.has_permission(doctype, "amend", doc=doc))
	return perms


@frappe.whitelist()
def get_rounding_method():
	# Purchase Bill's live totals must round exactly as flt() does on the
	# server, or a saved bill reloads looking edited. The method is a System
	# Settings value, which non-admin staff can't read directly.
	return frappe.get_system_settings("rounding_method") or "Banker's Rounding (legacy)"
