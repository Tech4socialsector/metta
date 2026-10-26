# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DiagnosticTestResult(Document):
	# One parameter's result on a Diagnostic Test. The range is copied from the
	# Lab Test Template when the row is made, so editing the template later
	# never changes a report that was already given. Flag is set by the parent.
	pass
