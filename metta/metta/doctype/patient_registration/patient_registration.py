# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

from metta.metta.utils import validate_phone_number


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


def calculate_age(dob):
	# Shared by Patient Visit and Nurse Interventions - Age is always
	# derived from Date of Birth, never entered or fetched directly, so it
	# can't silently go stale like a plain fetch_from would.
	if not dob:
		return None
	dob = getdate(dob)
	current = getdate(today())
	return current.year - dob.year - ((current.month, current.day) < (dob.month, dob.day))
