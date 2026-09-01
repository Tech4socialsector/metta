# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


ITEM_TYPE_BY_GROUP = {
	"Pharmacy Store": "Medicine",
	"General Store": "Consumable",
	"Service": "Service",
}


class Item(Document):
	def validate(self):
		self.set_item_type()

	def set_item_type(self):
		# Item Type comes straight from Group now - Category is purely a
		# reporting/organizational label (Tablets, Lab, X-Ray, ...) with no
		# behaviour of its own, same reasoning Item Category's own
		# "Behaves As" field was removed for.
		self.item_type = ITEM_TYPE_BY_GROUP.get(self.item_group)
		if self.item_group == "Service":
			# Has Batch defaults to checked and is hidden once Service Details
			# takes over - a Service item can otherwise end up with it still
			# on underneath, which makes Billing try to batch-allocate stock
			# for something that was never stocked at all (see IP Admission
			# Charge, which hit exactly this).
			self.has_batch = 0
			self.has_expiry = 0

	def on_update(self):
		self.ensure_service_rate_list()

	def ensure_service_rate_list(self):
		# Saves staff a separate "go create the rate list too" step. Starts
		# from whatever was typed into Service Rate while this Item
		# was still new (that field locks right after this first save) - so
		# the very first price is set in one go, right here. Every rate
		# change after this one goes through Service Rate List's own
		# "Update Rate" instead, which keeps a history of each change.
		if self.item_type != "Service":
			return
		if frappe.db.exists("Service Rate List", self.name):
			return
		frappe.get_doc(
			{
				"doctype": "Service Rate List",
				"item": self.name,
				"current_rate": flt(self.standard_selling_rate),
			}
		).insert(ignore_permissions=True)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def item_query(doctype, txt, searchfield, start, page_len, filters):
	# Staff often know a drug by its salt/generic name ("para") rather than
	# the specific brand actually stocked ("Dolo 650") - matching only Item
	# Code/Name would miss it, so this also matches the linked Chemical
	# Composition's own name and the Chemical Terms inside it.
	frappe.has_permission("Item", "read", throw=True)
	# The Link control always JSON-stringifies filters before sending them,
	# even for a custom query function - frappe.parse_json leaves an
	# already-parsed dict untouched, so this handles both call styles.
	filters = frappe.parse_json(filters) if filters else {}

	conditions = ["i.is_active = 1"]
	values = {"txt": f"%{txt}%", "start": start, "page_len": page_len}

	for fieldname, value in filters.items():
		if isinstance(value, (list, tuple)) and len(value) == 2 and str(value[0]).lower() == "in":
			keys = []
			for idx, option in enumerate(value[1]):
				key = f"{fieldname}_{idx}"
				values[key] = option
				keys.append(f"%({key})s")
			conditions.append(f"i.{fieldname} IN ({', '.join(keys)})")
		else:
			values[fieldname] = value
			conditions.append(f"i.{fieldname} = %({fieldname})s")

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT DISTINCT i.name, i.item_name
		FROM `tabItem` i
		LEFT JOIN `tabChemical Composition` cc ON cc.name = i.chemical_composition
		LEFT JOIN `tabChemical Composition Term` cct ON cct.parent = cc.name
		LEFT JOIN `tabChemical Term` ct ON ct.name = cct.chemical_term
		WHERE {where_clause}
			AND (i.item_name LIKE %(txt)s
				OR cc.name LIKE %(txt)s OR ct.name LIKE %(txt)s)
		ORDER BY i.item_name
		LIMIT %(page_len)s OFFSET %(start)s
		""",
		values,
	)


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
