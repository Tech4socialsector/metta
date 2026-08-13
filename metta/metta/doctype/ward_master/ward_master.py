# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class WardMaster(Document):
	def validate(self):
		# Wards with an enumerated bed list use that list as the single source
		# of truth for total_beds, so admin-entered counts can never drift out
		# of sync with the actual beds defined below. Wards without an
		# enumerated list (e.g. legacy ones like ICU) keep their manual count.
		if self.beds:
			self.total_beds = len(self.beds)

	@property
	def occupied_beds(self):
		# Computed live rather than stored, so this can't go stale the way a
		# manually-maintained counter field would.
		return frappe.db.count(
			"Patient Visit",
			{
				"ward": self.name,
				"registration_category": "IP",
				"admission_status": "Admitted",
			},
		)

	@property
	def available_beds(self):
		return max(0, (self.total_beds or 0) - self.occupied_beds)

	def get_bed_status_list(self):
		"""Per-bed Available/Occupied status, only for wards with beds enumerated."""
		# Only Admitted IP registrations occupy a bed; everything else in this
		# ward's bed list is available.
		occupied_bed_nos = set(
			frappe.get_all(
				"Patient Visit",
				filters={
					"ward": self.name,
					"registration_category": "IP",
					"admission_status": "Admitted",
				},
				pluck="bed_no",
			)
		)
		return [
			{
				"bed_no": bed.bed_no,
				"status": "Occupied" if bed.bed_no in occupied_bed_nos else "Available",
			}
			for bed in self.beds
		]
