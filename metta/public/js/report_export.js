frappe.provide("metta.report_export");

// Shared by every custom report Page (Previous Day Stock Report, Purchase
// Analysis, Outletwise Stock Transfer Summary, Date wise Purchase Order
// Details) so the "Export" button, the download mechanics, and the
// hospital letterhead stay identical across all of them.
//
// get_export_data() is called fresh on each click (not cached at page-load)
// since the report's filters/results can change between clicks.
metta.report_export.add_buttons = function (page, get_export_data) {
	const download = (cmd, extra_args) => {
		const data = get_export_data();
		if (!data || !data.rows || !data.rows.length) {
			frappe.msgprint(__("Nothing to export. Generate the report first."));
			return;
		}
		open_url_post(frappe.request.url, {
			cmd,
			title: data.title,
			subtitle: data.subtitle || "",
			columns: JSON.stringify(data.columns),
			rows: JSON.stringify(data.rows),
			filename: data.filename || data.title,
			...extra_args,
		});
	};

	const prompt_pdf_options = () => {
		const data = get_export_data();
		if (!data || !data.rows || !data.rows.length) {
			frappe.msgprint(__("Nothing to export. Generate the report first."));
			return;
		}

		const dialog = new frappe.ui.Dialog({
			title: __("PDF Export Options"),
			fields: [
				{
					fieldname: "page_size",
					label: __("Page Size"),
					fieldtype: "Select",
					options: ["A4", "Letter", "Legal"].join("\n"),
					default: "A4",
					reqd: 1,
				},
				{
					fieldname: "orientation",
					label: __("Orientation"),
					fieldtype: "Select",
					options: ["Portrait", "Landscape"].join("\n"),
					default: "Portrait",
					reqd: 1,
				},
			],
			primary_action_label: __("Download"),
			primary_action: (values) => {
				download("metta.utils.report_export.export_pdf", values);
				dialog.hide();
			},
		});
		dialog.show();
	};

	page.add_inner_button(__("Excel"), () => download("metta.utils.report_export.export_excel"), __("Export"));
	page.add_inner_button(__("PDF"), () => prompt_pdf_options(), __("Export"));
};
