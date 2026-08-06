# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import getdate, today

from metta.metta.utils import validate_phone_number


class PatientRegistration(Document):
	def validate(self):
		validate_phone_number(self.phone, "Phone")


def calculate_age(dob):
	# Shared by Patient Consultation and Nurse Interventions - Age is always
	# derived from Date of Birth, never entered or fetched directly, so it
	# can't silently go stale like a plain fetch_from would.
	if not dob:
		return None
	dob = getdate(dob)
	current = getdate(today())
	return current.year - dob.year - ((current.month, current.day) < (dob.month, dob.day))
