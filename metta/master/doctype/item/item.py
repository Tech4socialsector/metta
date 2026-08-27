# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Item(Document):
	pass


def record_purchase_price_history(item_code, rate, qty, date, supplier, purchase_bill):
	# Inserted directly as a child row (not via a full Item load+save) so
	# approving a Purchase Bill with many rows stays cheap - one lightweight
	# insert per item, same reasoning as approve_bill()'s own direct
	# frappe.db.set_value() calls right next to this.
	frappe.get_doc(
		{
			"doctype": "Item Purchase Price History",
			"parenttype": "Item",
			"parentfield": "purchase_price_history",
			"parent": item_code,
			"purchase_bill": purchase_bill,
			"date": date,
			"supplier": supplier,
			"rate": rate,
			"qty": qty,
		}
	).insert(ignore_permissions=True)
