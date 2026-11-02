# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_print_format_html(doctype, docname, print_format):
	"""Shared by every doctype's "Print" button (see
	public/js/print_preview.bundle.js, and the Vue app's own equivalent for
	CHW forms) - renders the named Print Format's HTML against the given
	document, the same way Desk's own print view does it, but through a
	plain dialog instead of a full-page navigation."""
	doc = frappe.get_doc(doctype, docname)
	doc.check_permission("read")
	pf = frappe.get_doc("Print Format", print_format)
	# The live Document, not doc.as_dict(): a dict's real .items() method
	# would shadow a child table literally named "items" (Purchase Order,
	# Purchase Receipt, Purchase Bill, Purchase Return, Quality Inspection
	# all have one) - Jinja's `doc.items` would resolve to that method
	# instead of the field and crash every render.
	return frappe.render_template(pf.html, {"doc": doc})
