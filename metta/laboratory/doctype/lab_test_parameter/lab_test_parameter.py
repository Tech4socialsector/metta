# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class LabTestParameter(Document):
	# One measured value of a lab test (Haemoglobin, WBC...) with its unit
	# and normal / critical limits. Checked by its parent, Lab Test Template.
	pass
