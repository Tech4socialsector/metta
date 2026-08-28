# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Item(Document):
	pass


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def item_query(doctype, txt, searchfield, start, page_len, filters):
	# Staff often know a drug by its salt/generic name ("para") rather than
	# the specific brand actually stocked ("Dolo 650") - matching only Item
	# Code/Name would miss it, so this also matches the linked Chemical
	# Composition's own name and the Chemical Terms inside it.
	frappe.has_permission("Item", "read", throw=True)

	conditions = ["i.is_active = 1"]
	values = {"txt": f"%{txt}%", "start": start, "page_len": page_len}

	for fieldname, value in (filters or {}).items():
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
			AND (i.item_code LIKE %(txt)s OR i.item_name LIKE %(txt)s
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
