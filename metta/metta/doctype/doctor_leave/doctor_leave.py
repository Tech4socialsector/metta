# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class DoctorLeave(Document):
	def validate(self):
		if getdate(self.from_date) > getdate(self.to_date):
			frappe.throw(_("From Date must be on or before To Date."))


def get_permission_query_conditions(user=None):
	# A Doctor only ever needs their own leave records - System Manager and
	# Front Desk keep seeing everyone's, same scoping shape as Doctor
	# Consultation/Appointment.
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabDoctor Leave`.doctor = {frappe.db.escape(doctor)}"""


def has_permission(doc, ptype, user):
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Front Desk" in roles or "Doctor" not in roles:
		return True

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	return bool(doctor) and doc.doctor == doctor
