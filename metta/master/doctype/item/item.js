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
	},
	item_type(frm) {
		// Each Item Type only ever fills in its own section - clear the others
		// so switching type can't leave behind fields that no longer apply
		// (and would otherwise still get saved, invisibly).
		// standard_selling_rate is shared across Medicine/Consumable/Service
		// (only Asset has no selling rate) so it's handled separately below,
		// not as part of any one type's field group.
		const stock_pricing_fields = [
			"stock_uom",
			"purchase_uom",
			"sale_uom",
			"has_batch",
			"has_expiry",
			"shelf_life_months",
			"standard_purchase_rate",
			"rack_location",
		];
		const medicine_fields = ["manufacturer", "hsn_code", "gst_percent"];
		const asset_fields = [
			"asset_category",
			"serial_no",
			"purchase_date",
			"purchase_cost",
			"warranty_expiry_date",
			"useful_life_years",
			"status",
			"assigned_department",
		];
		const service_fields = ["service_category", "duration_minutes", "department"];

		const keep =
			frm.doc.item_type === "Medicine"
				? [...stock_pricing_fields, ...medicine_fields]
				: frm.doc.item_type === "Consumable"
				? stock_pricing_fields
				: frm.doc.item_type === "Asset"
				? asset_fields
				: frm.doc.item_type === "Service"
				? service_fields
				: [];

		[...stock_pricing_fields, ...medicine_fields, ...asset_fields, ...service_fields]
			.filter((f) => !keep.includes(f))
			.forEach((f) => frm.set_value(f, ""));

		if (frm.doc.item_type === "Asset") {
			frm.set_value("standard_selling_rate", "");
		}

		// Both tables only ever apply to Medicine/Consumable - clear them on
		// any switch away so stale rows can't linger and get saved.
		if (frm.doc.item_type !== "Medicine" && frm.doc.item_type !== "Consumable") {
			frm.clear_table("uom_conversions");
			frm.clear_table("reorder_levels");
		}
		frm.refresh_fields();
	},
});
