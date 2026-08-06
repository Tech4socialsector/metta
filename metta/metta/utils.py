# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _


def validate_phone_number(value, label):
	# Phone/Contact Number fields across the app must be digits only, up to
	# 10 characters - not a business rule specific to any one doctype, so
	# every doctype with such a field calls this instead of duplicating the
	# same regex check.
	if not value:
		return
	if not re.fullmatch(r"\d{1,10}", value):
		frappe.throw(
			_("{0} must contain digits only, up to 10 characters.").format(label),
			title=_("Invalid Phone Number"),
		)
