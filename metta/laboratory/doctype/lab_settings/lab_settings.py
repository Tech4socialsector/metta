# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class LabSettings(Document):
	# Hospital-wide lab switches, read by Diagnostic Test in later phases
	# (verify rule, pay-first rule for both OP and IP, child range age, report footer).
	pass
