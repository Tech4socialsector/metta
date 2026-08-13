# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class CategoryPriceAdjustment(Document):
	def validate(self):
		if flt(self.discount_percent) < 0:
			frappe.throw(_("Discount Percent cannot be negative."))
		# A Discount above 100% would make every visit billed under this
		# category come out with a negative net_amount - catching it here
		# stops a bad category from ever being saved, rather than only
		# surfacing the problem later on each individual Patient Visit.
		if self.adjustment_type == "Discount" and flt(self.discount_percent) > 100:
			frappe.throw(_("Discount Percent cannot exceed 100% - that would make the bill negative."))
