# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_time

from metta.metta.utils import validate_phone_number


class DoctorMaster(Document):
	def validate(self):
		validate_phone_number(self.mobile, "Mobile")
		self.validate_schedule_slots()

	def validate_schedule_slots(self):
		# from_time must precede to_time, and two slots on the same day can't
		# overlap - otherwise Appointment's per-slot capacity check would be
		# ambiguous about which slot/max_patients a given time belongs to.
		by_day = {}
		for row in self.weekly_schedule:
			from_time, to_time = get_time(row.from_time), get_time(row.to_time)
			if from_time >= to_time:
				frappe.throw(
					_("Row #{0}: From Time must be before To Time.").format(row.idx),
					title=_("Invalid Schedule Slot"),
				)

			for other_idx, other_from, other_to in by_day.get(row.day, []):
				if from_time < other_to and other_from < to_time:
					frappe.throw(
						_("Row #{0} overlaps with row #{1} - both are on {2} with overlapping times.").format(
							row.idx, other_idx, row.day
						),
						title=_("Overlapping Schedule Slots"),
					)
			by_day.setdefault(row.day, []).append((row.idx, from_time, to_time))
