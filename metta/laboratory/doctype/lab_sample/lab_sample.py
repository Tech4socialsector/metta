# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class LabSample(Document):
	# One tube / container taken from a patient. Made by collect_samples() in
	# diagnostic_test.py - one per sample type - and every Diagnostic Test it
	# serves links back through its lab_sample field. Its name (LS-...) is the
	# ID written on the tube.
	def validate(self):
		if not self.collected_by:
			self.collected_by = frappe.session.user
			self.collected_on = now_datetime()
