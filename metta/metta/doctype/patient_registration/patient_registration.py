# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import requests

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

from metta.metta.utils import validate_phone_number

PINCODE_API_URL = "https://api.postalpincode.in/pincode/{pincode}"


class PatientRegistration(Document):
	def validate(self):
		validate_phone_number(self.phone, "Phone")
		# Age is always derived from Date of Birth, never entered by hand - the
		# same rule Patient Visit and Nurse Interventions already follow, using
		# this same calculate_age() (see its own docstring below).
		self.age = calculate_age(self.dob)


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


def calculate_age(dob):
	# Shared by Patient Visit and Nurse Interventions - Age is always
	# derived from Date of Birth, never entered or fetched directly, so it
	# can't silently go stale like a plain fetch_from would.
	if not dob:
		return None
	dob = getdate(dob)
	current = getdate(today())
	return current.year - dob.year - ((current.month, current.day) < (dob.month, dob.day))
