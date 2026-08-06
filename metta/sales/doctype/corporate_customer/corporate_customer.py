# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from metta.metta.utils import validate_phone_number


class CorporateCustomer(Document):
	def validate(self):
		validate_phone_number(self.contact_number, "Contact Number")
