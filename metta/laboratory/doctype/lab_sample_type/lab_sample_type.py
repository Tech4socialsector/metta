# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class LabSampleType(Document):
	# A plain master (Blood, Urine, Sputum...): picked on a Lab Test Template
	# and later on the Lab Sample. No rules of its own.
	pass
