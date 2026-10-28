// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Diagnostic Test", {
	setup(frm) {
		// A suggested test has to be a real, priced Service item - same
		// constraint as suggested_tests on Doctor Consultation.
		frm.set_query("item", () => ({
			filters: { item_type: "Service", is_active: 1 },
		}));
	},

	refresh(frm) {
		// Result rows come from the Lab Test Template; only their values are typed.
		frm.set_df_property("results", "cannot_add_rows", true);
		frm.set_df_property("results", "cannot_delete_rows", true);
		if (frm.doc.status === "Ordered" && !frm.doc.is_paid && !frm.is_new()) {
			frm.dashboard.set_headline(__("Not paid yet. This turns to Paid when Billing submits the bill."), "orange");
		}
		if (frm.doc.status === "Ordered" && frm.doc.is_paid && frm.perm[0]?.write) {
			frm.add_custom_button(__("Collect Sample"), () => collect_sample_dialog(frm)).addClass("btn-primary");
		}
	},
});

// The patient's other paid tests are offered too, so one visit to the lab
// counter gives one tube per sample type instead of one per test.
function collect_sample_dialog(frm) {
	frappe.call({
		method: "metta.metta.doctype.diagnostic_test.diagnostic_test.get_collection_queue",
		args: { patient_visit: frm.doc.patient_visit },
		callback(r) {
			const tests = (r.message || [])[0]?.tests || [];
			const label = (t) =>
				`${t.item_name}${t.sample_type ? ` · ${t.sample_type}` : ""}${t.tube_colour ? ` (${t.tube_colour})` : ""}`;
			const d = new frappe.ui.Dialog({
				title: __("Collect Sample: {0}", [frm.doc.patient_name]),
				fields: [
					{
						fieldname: "tests",
						fieldtype: "MultiCheck",
						label: __("Tests"),
						columns: 1,
						options: tests.map((t) => ({ label: label(t), value: t.name, checked: 1 })),
					},
				],
				primary_action_label: __("Collect"),
				primary_action(values) {
					if (!values.tests || !values.tests.length) return;
					frappe.call({
						method: "metta.metta.doctype.diagnostic_test.diagnostic_test.collect_samples",
						args: { tests: values.tests },
						freeze: true,
						callback(res) {
							d.hide();
							const ids = (res.message || []).map((s) => `${s.sample} (${s.sample_type})`).join(", ");
							frappe.show_alert({ message: ids ? __("Sample ID: {0}", [ids]) : __("Collected"), indicator: "green" });
							frm.reload_doc();
						},
					});
				},
			});
			d.show();
		},
	});
}

frappe.ui.form.on("Diagnostic Test Result", {
	// Same rule as result_flag() in diagnostic_test.py, so the flag shows while
	// typing; the server sets the stored value again on save.
	result_value(frm, cdt, cdn) {
		const r = locals[cdt][cdn];
		const value = String(r.result_value || "").trim();
		let flag = "";
		if (value && r.value_type !== "Number") {
			if (r.normal_text) flag = value.toLowerCase() === r.normal_text.trim().toLowerCase() ? "Normal" : "Abnormal";
		} else if (value && !isNaN(Number(value))) {
			const v = Number(value);
			if (r.critical_low && v < r.critical_low) flag = "Critical Low";
			else if (r.critical_high && v > r.critical_high) flag = "Critical High";
			else if (r.low && v < r.low) flag = "Low";
			else if (r.high && v > r.high) flag = "High";
			else if (r.low || r.high || r.critical_low || r.critical_high) flag = "Normal";
		}
		frappe.model.set_value(cdt, cdn, "flag", flag);
	},
});
