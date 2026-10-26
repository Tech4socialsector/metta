# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

# Server methods for the HMIS Vue frontend (frontend/, served at /hmis). Desk
# keeps working exactly as before - nothing here replaces a Desk form; these
# only give the Vue screens the same records and the same validations.

import re

import frappe
from frappe import _

from metta.metta.doctype.patient_registration.patient_registration import link_chw_field_record

# Copied from the Patient Registration onto the new OP visit - the same values
# Patient Visit's own fetch_from (uhin_id.*) pulls in when Desk picks a UHIN.
VISIT_FIELDS_FROM_REGISTRATION = {
	"first_name": "first_name",
	"last_name": "last_name",
	"patient_name": "patient_name",
	"sex": "sex",
	"dob": "dob",
	"blood_group": "blood_group",
	"marital_status": "marital_status",
	"uid": "uid",
	"phone": "phone",
	"email": "email",
	"address": "address",
	"billing_category": "billing_category",
	"company_name": "corporate_customer",
}

# Never taken from the browser - Frappe owns these on every insert.
PROTECTED_KEYS = {"name", "doctype", "docstatus", "owner", "creation", "modified", "modified_by", "idx"}


def _clean(values, doctype):
	# Only real fields of the doctype go through, so a stray key from the
	# browser can't set something the Desk form would never let anyone set.
	valid = {df.fieldname for df in frappe.get_meta(doctype).fields}
	return {k: v for k, v in (values or {}).items() if k in valid and k not in PROTECTED_KEYS}


@frappe.whitelist(methods=["POST"])
def register_patient(registration, visit, chw_family_member=None):
	"""New patient walk-in: Patient Registration (UHIN) + today's OP Patient Visit.

	Both inserts run through each doctype's own validate()/after_insert, with
	the caller's own permissions - exactly what saving the two Desk forms one
	after the other does. They share this request's transaction, so a visit
	that fails validation (e.g. missing Gender) also undoes the registration,
	instead of leaving a half-registered patient behind.
	"""
	registration = frappe.parse_json(registration)
	visit = frappe.parse_json(visit)

	reg = frappe.get_doc({"doctype": "Patient Registration", **_clean(registration, "Patient Registration")})
	reg.insert()

	# First visit: the visit's billing category and company are the patient's.
	pv = _insert_op_visit(reg, _clean(visit, "Patient Visit"), visit_has_own_category=False)

	# Same write-back Desk does in Patient Registration's after_save, once the
	# registration has its real HIN name.
	if chw_family_member:
		link_chw_field_record(reg.name, chw_family_member)

	return {"patient_registration": reg.name, "patient_visit": pv.name}


@frappe.whitelist(methods=["POST"])
def create_op_visit(uhin_id, visit):
	"""Returning patient: a new OP Patient Visit against their existing UHIN.

	Registration happens once per patient; every later visit is only this.
	Same as Desk's New Patient Visit with the UHIN picked.
	"""
	reg = frappe.get_doc("Patient Registration", uhin_id)
	reg.check_permission("read")
	pv = _insert_op_visit(reg, _clean(frappe.parse_json(visit), "Patient Visit"), visit_has_own_category=True)
	return {"patient_registration": reg.name, "patient_visit": pv.name}


@frappe.whitelist(methods=["POST"])
def create_ip_admission(op_visit, admission):
	"""OP -> IP: the Vue counterpart of Desk's "Admit Patient" button.

	get_admission_defaults() is the same call the Desk button makes - it
	refuses anything but an OP visit, and an OP visit that was already
	admitted. The new IP visit then goes through Patient Visit's own validate
	(bed/room occupied, inactive room, MLC No required, IP needs
	converted_from_registration), exactly as when it is saved in Desk.
	"""
	from metta.metta.doctype.patient_visit.patient_visit import get_admission_defaults

	defaults = get_admission_defaults(op_visit)
	reg = frappe.get_doc("Patient Registration", defaults["uhin_id"])
	reg.check_permission("read")

	values = _clean(frappe.parse_json(admission), "Patient Visit")
	# Desk's new form starts from these defaults; Front Desk may still change
	# department / doctor on the admission itself.
	for key, value in defaults.items():
		if key in ("department_name", "doctor_name") and values.get(key):
			continue
		values[key] = value
	# Demographics, as the IP form's fetch_from (uhin_id.*) fills them. Billing
	# category / company come from the OP visit's defaults, not re-fetched.
	for visit_field, reg_field in VISIT_FIELDS_FROM_REGISTRATION.items():
		if visit_field in ("billing_category", "company_name"):
			continue
		values[visit_field] = reg.get(reg_field)
	values["registration_category"] = "IP"
	pv = frappe.get_doc({"doctype": "Patient Visit", **values})
	pv.insert()
	return {"patient_registration": reg.name, "patient_visit": pv.name}


def _insert_op_visit(reg, visit_values, visit_has_own_category):
	for visit_field, reg_field in VISIT_FIELDS_FROM_REGISTRATION.items():
		# On a returning patient's visit, Billing Category / Company Name are
		# the visit's own editable fields in Desk (they only start from the
		# patient's values), so what Front Desk chose is kept.
		if visit_has_own_category and visit_field in ("billing_category", "company_name") and visit_field in visit_values:
			continue
		visit_values[visit_field] = reg.get(reg_field)
	# A walk-in always starts as OP - Patient Visit's own validate refuses a
	# new IP visit without "Admit Patient" anyway.
	visit_values["registration_category"] = "OP"
	visit_values["uhin_id"] = reg.name
	pv = frappe.get_doc({"doctype": "Patient Visit", **visit_values})
	pv.insert()
	return pv


@frappe.whitelist()
def search_patients(txt=""):
	# Front Desk's one search box: UHIN, phone number or name. get_list (not
	# get_all) so each user only ever sees what their own permissions allow.
	txt = (txt or "").strip()
	if len(txt) < 2:
		return []
	like = f"%{txt}%"
	return frappe.get_list(
		"Patient Registration",
		or_filters={"name": ["like", like], "patient_name": ["like", like], "phone": ["like", like]},
		fields=["name", "patient_name", "phone", "sex", "age", "billing_category"],
		order_by="modified desc",
		limit_page_length=10,
	)


@frappe.whitelist()
def get_form_menu():
	"""Every form of this app the user may open, for the Vue "All forms" page.

	Same rule as Desk: a form shows only if the user has read permission on
	its doctype. Child tables are left out - they live inside their parent.
	"""
	modules = frappe.get_module_list("metta")
	rows = frappe.get_all(
		"DocType",
		filters={"module": ["in", modules], "istable": 0},
		fields=["name", "module", "issingle", "is_submittable"],
		order_by="module, name",
	)
	return [
		{
			"doctype": r.name,
			"module": r.module,
			"issingle": r.issingle,
			"is_submittable": r.is_submittable,
			"can_create": bool(not r.issingle and frappe.has_permission(r.name, "create")),
			# The Vue list's Delete / Export Excel show only where Desk allows them.
			"can_delete": bool(not r.issingle and frappe.has_permission(r.name, "delete")),
			"can_export": bool(frappe.permissions.can_export(r.name)),
		}
		for r in rows
		if frappe.has_permission(r.name, "read")
	]


@frappe.whitelist()
def get_doc_permissions(doctype, name=None):
	# Which buttons the Vue form shows - checked per record, so user
	# permissions and permission hooks apply exactly as in Desk.
	doc = frappe.get_doc(doctype, name) if name else None
	check = lambda ptype: bool(frappe.has_permission(doctype, ptype, doc=doc))  # noqa: E731
	return {p: check(p) for p in ("read", "write", "create", "submit", "cancel", "delete")}


@frappe.whitelist()
def get_session_context():
	# The sidebar shows each user only the sections their roles open in Desk.
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not logged in"), frappe.PermissionError)
	return {
		"user": user,
		"full_name": frappe.utils.get_fullname(user),
		"roles": frappe.get_roles(user),
	}


# App look set from the Vue Settings screen (logo, names, the two theme
# colours). Kept as site-wide defaults rather than a new doctype, so nothing
# in Desk changes and no migrate is needed. Empty values mean "use the
# built-in look" (deep ocean blue + orange, LCH HMIS).
THEME_KEYS = ("app_name", "hospital_name", "logo", "brand_color", "accent_color")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


@frappe.whitelist(allow_guest=True)
def get_hmis_theme():
	# Guests read it too: the login page shows the hospital's logo and colours.
	return {key: frappe.db.get_default(f"hmis_theme_{key}") or "" for key in THEME_KEYS}


@frappe.whitelist(methods=["POST"])
def save_hmis_theme(theme):
	frappe.only_for("System Manager")
	theme = frappe.parse_json(theme) or {}
	for key in ("brand_color", "accent_color"):
		value = (theme.get(key) or "").strip()
		if value and not _HEX.match(value):
			frappe.throw(_("{0} must be a colour like #0C4A6E").format(key.replace("_", " ").title()))
	for key in THEME_KEYS:
		frappe.db.set_default(f"hmis_theme_{key}", (theme.get(key) or "").strip())
	return get_hmis_theme()
