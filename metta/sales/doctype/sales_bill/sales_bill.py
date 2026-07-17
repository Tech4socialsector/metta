# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SalesBill(Document):
	def validate(self):
		# mandatory_depends_on only blocks the Save button in the browser -
		# it isn't checked by Frappe's server-side mandatory-field validation,
		# so API calls/imports could skip this without a check here.
		if self.payment_mode == "Credit - Corporate" and not self.corporate_customer:
			frappe.throw(
				_("Corporate Customer is mandatory when Payment Mode is Credit - Corporate."),
				title=_("Corporate Customer Required"),
			)
