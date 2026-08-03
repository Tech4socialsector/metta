# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class RoomMaster(Document):
	def validate(self):
		# Rooms with an enumerated bed list use that list as the single source
		# of truth for capacity, same reasoning as Ward Master's total_beds.
		if self.beds:
			self.capacity = len(self.beds)

	@property
	def occupied_beds(self):
		# Computed live rather than stored, so this can't go stale the way a
		# manually-maintained counter field would.
		return frappe.db.count(
			"Patient Consultation",
			{
				"room": self.name,
				"registration_category": "IP",
				"admission_status": "Admitted",
			},
		)

	@property
	def available_beds(self):
		return max(0, (self.capacity or 0) - self.occupied_beds)

	def get_bed_status_list(self):
		"""Per-bed Available/Occupied status, only for rooms with beds enumerated."""
		# Only Admitted IP registrations occupy a bed; everything else in this
		# room's bed list is available.
		occupied_bed_nos = set(
			frappe.get_all(
				"Patient Consultation",
				filters={
					"room": self.name,
					"registration_category": "IP",
					"admission_status": "Admitted",
				},
				pluck="room_bed_no",
			)
		)
		return [
			{
				"bed_no": bed.bed_no,
				"status": "Occupied" if bed.bed_no in occupied_bed_nos else "Available",
			}
			for bed in self.beds
		]
