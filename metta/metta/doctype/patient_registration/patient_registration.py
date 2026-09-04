# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import requests

import frappe
from frappe.model.document import Document
from frappe.utils import flt, getdate, today

from metta.metta.utils import validate_phone_number

PINCODE_API_URL = "https://api.postalpincode.in/pincode/{pincode}"

# Billing Category names this feature manages - matched exactly, so renaming
# one of these Category Price Adjustment records breaks the automatic
# assignment below until it's renamed back.
STAFF_CATEGORY = "Staff"
STAFF_DEPENDENT_CATEGORY = "Staff Dependent"
GENERAL_CATEGORY = "General"

# A Son/Daughter is the only relationship that ages out of the Staff
# Dependent charity - Husband/Wife/Father/Mother never do, since a spouse or
# parent's own age has no bearing on their dependent status.
CHILD_RELATIONSHIPS = {"Son", "Daughter"}
DEPENDENT_CHILD_AGE_LIMIT = 21


class PatientRegistration(Document):
	def validate(self):
		validate_phone_number(self.phone, "Phone")
		# Age is derived from Date of Birth when it's known, same as Patient
		# Visit and Nurse Interventions - but here DOB itself is optional, so
		# a manually typed Age is kept as-is when there's no DOB to compute it
		# from instead.
		if self.dob:
			self.age = calculate_age(self.dob)
		# Full Name is always derived from First/Last Name, never typed
		# separately - same reasoning as Age above.
		self.patient_name = calculate_full_name(self.first_name, self.last_name)
		self.validate_staff_dependent()
		self.validate_charity_percent()

	def validate_charity_percent(self):
		# Charity Percent is editable only for a General (i.e. not
		# Staff-related) patient - a hand-typed rate for this specific
		# person's situation, independent of Billing Category, since it's a
		# one-off judgment call, not a standing rule. Staff/Staff Dependent
		# already gets its charity automatically from Billing Category, so a
		# hand-typed rate on top of that would be a second, conflicting one -
		# the field is read-only for them in the UI, but that's only a
		# convenience, so it's enforced here too for any API call/import.
		if self.billing_category == GENERAL_CATEGORY:
			if flt(self.charity_percent) < 0:
				frappe.throw(frappe._("Charity Percent cannot be negative."))
			if flt(self.charity_percent) > 100:
				frappe.throw(frappe._("Charity Percent cannot exceed 100%."))
		elif self.billing_category:
			# Not trusted from whatever the client's own fetch_from last put
			# here - re-fetched fresh so a read-only field being bypassed via
			# the API can't smuggle in a rate that doesn't match this
			# category's own current one.
			self.charity_percent = (
				frappe.db.get_value("Category Price Adjustment", self.billing_category, "charity_percent") or 0
			)

	def validate_staff_dependent(self):
		# Billing Category is picked directly now (Staff/Staff Dependent/
		# General/...) - the only thing still enforced here is downgrading a
		# Staff Dependent who's aged out of it, same rule the daily
		# age_out_staff_dependents() job re-checks passively over time.
		if self.billing_category != STAFF_DEPENDENT_CATEGORY:
			return
		if not check_dependent_aged_out(self.dependent_relationship, self.age):
			return
		self.billing_category = GENERAL_CATEGORY
		# charity_percent is normally kept correct by the client's own
		# fetch_from - but this can also run with no client involved (the
		# daily age-out job), so it's resynced here directly rather than
		# trusting whatever charity_percent happened to already be on
		# the document.
		self.charity_percent = (
			frappe.db.get_value("Category Price Adjustment", GENERAL_CATEGORY, "charity_percent") or 0
		)


@frappe.whitelist()
def find_possible_duplicates(phone, exclude=None):
	# phone isn't unique (uid is) - this only warns Front Desk so they can
	# decide whether it's genuinely the same returning patient before a
	# second record splits their history across two UIDs; it never blocks
	# the save, since two people can legitimately share one phone number.
	frappe.has_permission("Patient Registration", "read", throw=True)
	if not phone:
		return []
	filters = {"phone": phone}
	if exclude:
		filters["name"] = ["!=", exclude]
	return frappe.get_all(
		"Patient Registration", filters=filters, fields=["name", "patient_name", "uid"]
	)


@frappe.whitelist()
def get_location_by_pincode(pincode):
	# India Post's own official lookup - one pincode commonly covers several
	# villages/post offices (confirmed true for this hospital's own 248179),
	# so State/District are safe to fill in directly but the village list is
	# handed back for the client to let the user pick the right one.
	frappe.has_permission("Patient Registration", "read", throw=True)
	pincode = (pincode or "").strip()
	if not pincode.isdigit() or len(pincode) != 6:
		frappe.throw(frappe._("Enter a valid 6-digit Pin Code."))

	try:
		# The API's own edge protection silently resets connections that carry
		# python-requests' default User-Agent - a browser-like one is needed
		# just to get past that, nothing about the request itself changes.
		response = requests.get(
			PINCODE_API_URL.format(pincode=pincode),
			timeout=5,
			headers={"User-Agent": "Mozilla/5.0 (compatible; MettaHMIS/1.0)"},
		)
		response.raise_for_status()
		result = response.json()
	except requests.RequestException:
		frappe.throw(frappe._("Could not reach the Pin Code lookup service - check your internet connection."))

	entry = result[0] if result else {}
	if entry.get("Status") != "Success" or not entry.get("PostOffice"):
		frappe.throw(frappe._("No location found for Pin Code {0}.").format(pincode))

	post_offices = entry["PostOffice"]
	return {
		"state": post_offices[0].get("State"),
		"district": post_offices[0].get("District"),
		"villages": [po.get("Name") for po in post_offices if po.get("Name")],
	}


def calculate_full_name(first_name, last_name):
	# Only First Name is mandatory - Last Name is optional, so a patient with
	# just a first name still gets a Full Name instead of a blank field.
	return " ".join(part for part in (first_name, last_name) if part)


def calculate_age(dob):
	# Shared by Patient Visit and Nurse Interventions - Age is always
	# derived from Date of Birth, never entered or fetched directly, so it
	# can't silently go stale like a plain fetch_from would.
	if not dob:
		return None
	dob = getdate(dob)
	current = getdate(today())
	return current.year - dob.year - ((current.month, current.day) < (dob.month, dob.day))


def check_dependent_aged_out(dependent_relationship, age):
	# Only a Son/Daughter ages out - Husband/Wife/Father/Mother never do,
	# since a spouse or parent's own age has no bearing on their dependent
	# status (see CHILD_RELATIONSHIPS above).
	return dependent_relationship in CHILD_RELATIONSHIPS and age is not None and age >= DEPENDENT_CHILD_AGE_LIMIT


def ensure_default_billing_categories():
	# Called once per migrate (see hooks.py's after_migrate) - creates the
	# three Billing Categories this feature depends on if the hospital
	# hasn't already set them up by hand, so Staff/Dependent auto-assignment
	# never fails with "Category Price Adjustment not found" on a fresh site.
	defaults = {
		STAFF_CATEGORY: 100,
		STAFF_DEPENDENT_CATEGORY: 60,
		GENERAL_CATEGORY: 0,
	}
	for category_name, charity_percent in defaults.items():
		if frappe.db.exists("Category Price Adjustment", category_name):
			continue
		frappe.get_doc(
			{
				"doctype": "Category Price Adjustment",
				"name": category_name,
				"adjustment_type": "Charity",
				"charity_percent": charity_percent,
				"charity_status": "Active",
			}
		).insert(ignore_permissions=True)


def age_out_staff_dependents():
	# Daily scheduled task (see hooks.py) - a dependent child crossing 21
	# happens passively with no one editing their record, so nothing would
	# otherwise trigger validate() to notice and switch them off the Staff
	# Dependent charity. Re-saving every dependent lets validate_staff_dependent()
	# recompute the same rule it already applies on every manual save.
	names = frappe.get_all(
		"Patient Registration", filters={"billing_category": STAFF_DEPENDENT_CATEGORY}, pluck="name"
	)
	for name in names:
		doc = frappe.get_doc("Patient Registration", name)
		before = doc.billing_category
		doc.save(ignore_permissions=True)
		if doc.billing_category != before:
			frappe.logger().info(
				f"Patient Registration {name}: Billing Category aged out from {before!r} to {doc.billing_category!r}"
			)
	frappe.db.commit()
