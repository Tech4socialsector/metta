import frappe

# Desk home shows only these two tiles (user, 2026-11-02). Everything else -
# HMIS role workspaces, Frappe's Framework folder and its Build / Data /
# Users... tiles, anything a later app adds - is hidden, not deleted, so it
# all still opens from search (Ctrl+K) or its URL.
KEEP = ("HMIS", "CHW App")
# Each kept tile shows its own picture instead of a plain letter (files in
# metta/public/images, served at /assets/metta/images).
# Picked from the comparison page (user, 2026-11-02): H1 hospital, C4 caring hand.
# Bump ?v= when a picture changes, so browsers don't keep the cached one.
LOGOS = {"HMIS": "/assets/metta/images/desk-hmis.svg", "CHW App": "/assets/metta/images/desk-chw.svg?v=2"}


def keep_only_hmis_and_chw():
	"""after_migrate: Frappe re-syncs its own tiles on migrate and shows a
	hidden folder's tiles on their own, so every tile is checked each time."""
	to_hide = frappe.get_all("Desktop Icon", filters={"label": ["not in", KEEP], "hidden": 0}, pluck="name")
	for name in to_hide:
		frappe.db.set_value("Desktop Icon", name, "hidden", 1, update_modified=False)
	for name in frappe.get_all("Desktop Icon", filters={"label": ["in", KEEP], "hidden": 1}, pluck="name"):
		frappe.db.set_value("Desktop Icon", name, "hidden", 0, update_modified=False)

	# CHW's own fixture resets its tile on migrate, so the picture is set here each time.
	relogo = False
	for icon in frappe.get_all("Desktop Icon", filters={"label": ["in", KEEP]}, fields=["name", "label", "logo_url"]):
		if icon.logo_url != LOGOS[icon.label]:
			frappe.db.set_value("Desktop Icon", icon.name, "logo_url", LOGOS[icon.label], update_modified=False)
			relogo = True

	fixed_layouts = _fix_saved_layouts()
	if to_hide or relogo or fixed_layouts:
		frappe.cache.delete_key("desktop_icons")
		frappe.cache.delete_key("bootinfo")


def _fix_saved_layouts():
	"""Desk home draws from each user's saved Desktop Layout - its own copy of
	every tile - not from Desktop Icon, and Desk saves a new copy on its own.
	So correct those copies in place instead of deleting them."""
	fixed = 0
	for row in frappe.get_all("Desktop Layout", fields=["name", "layout"]):
		try:
			icons = frappe.parse_json(row.layout) or []
		except Exception:
			continue
		changed = False
		for icon in icons:
			want_hidden = 0 if icon.get("label") in KEEP else 1
			want_logo = LOGOS.get(icon.get("label"), icon.get("logo_url"))
			if icon.get("hidden") != want_hidden or icon.get("logo_url") != want_logo:
				icon["hidden"], icon["logo_url"] = want_hidden, want_logo
				changed = True
		if changed:
			frappe.db.set_value("Desktop Layout", row.name, "layout", frappe.as_json(icons), update_modified=False)
			fixed += 1
	return fixed
