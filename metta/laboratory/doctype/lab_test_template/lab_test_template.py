# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


RANGE_PAIRS = (
	("male_low", "male_high", "Male"),
	("female_low", "female_high", "Female"),
	("child_low", "child_high", "Child"),
	("critical_low", "critical_high", "Critical"),
)


class LabTestTemplate(Document):
	def validate(self):
		self.validate_item()
		self.validate_parameters()

	def validate_item(self):
		# The template is what Billing charges for, so it must point at a
		# Service item - a Medicine/Consumable here would reduce stock on billing.
		item_type = frappe.db.get_value("Item", self.item, "item_type")
		if item_type != "Service":
			frappe.throw(_("Billing Item {0} must be a Service item.").format(frappe.bold(self.item)))

	def validate_parameters(self):
		if self.result_type == "Text only":
			# Text-only tests (e.g. culture remarks) have no rows; drop any left
			# over from an earlier result type so they don't show on the report.
			self.parameters = []
			return

		if not self.parameters:
			frappe.throw(_("Add at least one row in Parameters for result type {0}.").format(self.result_type))

		if self.result_type == "Single value" and len(self.parameters) > 1:
			frappe.throw(_("Result type Single value can have only one parameter row."))

		seen = set()
		for row in self.parameters:
			key = (row.parameter or "").strip().lower()
			if key in seen:
				frappe.throw(_("Row {0}: parameter {1} is repeated.").format(row.idx, frappe.bold(row.parameter)))
			seen.add(key)

			if row.value_type != "Number":
				continue
			# Empty Float fields come back as 0, and a range may be one-sided
			# (e.g. "more than 40"), so only compare when a high limit is set.
			for low, high, label in RANGE_PAIRS:
				lo, hi = row.get(low) or 0, row.get(high) or 0
				if hi and lo > hi:
					frappe.throw(
						_("Row {0}: {1} low cannot be more than {1} high for {2}.").format(
							row.idx, label, frappe.bold(row.parameter)
						)
					)
