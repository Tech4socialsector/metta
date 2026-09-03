# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import cint


class PrescriptionItem(Document):
	def validate(self):
		# Dosage is Morning-Afternoon-Night (e.g. "1-0-1") - doses per day is
		# just those three numbers added up. Quantity is never typed by hand;
		# it's always this times Duration, so Pharmacy dispenses exactly what
		# the dosage actually adds up to over the full course.
		if self.dosage and self.duration:
			doses_per_day = sum(cint(part) for part in self.dosage.split("-"))
			self.qty = doses_per_day * cint(self.duration)
