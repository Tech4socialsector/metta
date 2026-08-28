# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, today


class ServiceRateList(Document):
	def validate(self):
		self.validate_item_is_service()
		self.sync_item_rate()

	def validate_item_is_service(self):
		item_type = frappe.db.get_value("Item", self.item, "item_type")
		if item_type != "Service":
			frappe.throw(_("Service Rate List can only be created for a Service item."))

	def sync_item_rate(self):
		# Item.standard_selling_rate stays a read-only cache of this record's
		# Current Rate - Billing keeps reading it directly off the Item the
		# same way it always has, without needing to know this doctype exists.
		frappe.db.set_value("Item", self.item, "standard_selling_rate", flt(self.current_rate))


@frappe.whitelist()
def update_rate(name, new_rate, new_start_date=None):
	# The only path allowed to actually change Current Rate - closes out the
	# old rate's period (Start Date -> this change's date) into history, then
	# opens a new one for the new rate with no End Date yet, since it's the
	# active one now.
	doc = frappe.get_doc("Service Rate List", name)
	doc.check_permission("write")
	new_rate = flt(new_rate)
	if new_rate <= 0:
		frappe.throw(_("New Rate must be greater than 0."))
	new_start_date = new_start_date or today()

	doc.append(
		"rate_history",
		{
			"start_date": doc.start_date,
			"end_date": new_start_date,
			"rate": doc.current_rate,
			"updated_by": frappe.session.user,
		},
	)
	doc.current_rate = new_rate
	doc.start_date = new_start_date
	doc.end_date = None
	doc.save()
	return doc.current_rate
