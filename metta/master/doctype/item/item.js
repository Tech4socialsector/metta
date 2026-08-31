// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Item", {
	setup(frm) {
		// Category only ever lists categories that belong to the selected
		// Group - Pharmacy Store items shouldn't see General Store categories
		// and vice versa.
		frm.set_query("category", () => ({
			filters: { item_group: frm.doc.item_group || "" },
		}));
	},
	item_group(frm) {
		// A category picked under the old Group would no longer be valid -
		// clear it rather than silently leaving a mismatched value saved.
		frm.set_value("category", "");
		// Item Type is derived straight from Group now (mirrors
		// ITEM_TYPE_BY_GROUP in item.py) - set live here so the right
		// sections show immediately, not just after the next save.
		const item_type_by_group = { "Pharmacy Store": "Medicine", "General Store": "Consumable", Service: "Service" };
		frm.set_value("item_type", item_type_by_group[frm.doc.item_group] || "");
	},
	item_type(frm) {
		// Each behaviour only ever fills in its own section - clear the
		// others so switching Group can't leave behind fields that no longer
		// apply (and would otherwise still get saved, invisibly).
		const stock_pricing_fields = [
			"unit_of_measure",
			"has_batch",
			"has_expiry",
			"standard_purchase_rate",
			"rack_location",
		];
		const medicine_fields = ["manufacturer", "hsn_code", "gst_percent", "chemical_composition"];
		const service_fields = ["department"];

		const keep =
			frm.doc.item_type === "Medicine"
				? [...stock_pricing_fields, ...medicine_fields]
				: frm.doc.item_type === "Consumable"
				? stock_pricing_fields
				: frm.doc.item_type === "Service"
				? service_fields
				: [];

		[...stock_pricing_fields, ...medicine_fields, ...service_fields]
			.filter((f) => !keep.includes(f))
			.forEach((f) => frm.set_value(f, ""));

		// Reorder Levels only ever applies to Medicine/Consumable - clear it on
		// any switch away so stale rows can't linger and get saved.
		if (frm.doc.item_type !== "Medicine" && frm.doc.item_type !== "Consumable") {
			frm.clear_table("reorder_levels");
		}
		frm.refresh_fields();
	},
});
