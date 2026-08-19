# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BedTransfer(Document):
	def before_insert(self):
		if not self.transferred_by:
			self.transferred_by = frappe.session.user
