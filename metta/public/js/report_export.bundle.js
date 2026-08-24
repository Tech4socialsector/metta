frappe.provide("metta.report_export");

// Shared by every custom report Page (Previous Day Stock Report, Purchase
// Analysis, Outletwise Stock Transfer Summary, Date wise Purchase Order
// Details) so the "Export" button, the download mechanics, and the
// hospital letterhead stay identical across all of them.
//
// get_export_data() is called fresh on each click (not cached at page-load)
// since the report's filters/results can change between clicks.
// A report with several tables (Daily Collection Report's User Wise
// Details + Advances + Item Type Collection) passes `sections`: an array of
// {heading, columns, rows}, one per table, all stacked into a single
// export. Every other report still passes plain columns/rows for its one
// table - has_rows/build_args handle both shapes the same way.
const has_rows = (data) =>
	data.sections ? data.sections.some((s) => s.rows && s.rows.length) : !!(data.rows && data.rows.length);

const build_args = (data) =>
	data.sections
		? { sections: JSON.stringify(data.sections) }
		: { columns: JSON.stringify(data.columns), rows: JSON.stringify(data.rows) };

metta.report_export.add_buttons = function (page, get_export_data) {
	const download = (cmd, extra_args, open_in_new_tab) => {
		const data = get_export_data();
		if (!data || !has_rows(data)) {
			frappe.msgprint(__("Nothing to export. Generate the report first."));
			return;
		}
		// PDF is served with Content-Disposition: inline, so opening it in a
		// new tab shows it straight in the browser's own PDF viewer instead
		// of just triggering a silent download - Excel still downloads as a
		// file either way, so it isn't opened this way.
		open_url_post(
			frappe.request.url,
			{
				cmd,
				title: data.title,
				subtitle: data.subtitle || "",
				...build_args(data),
				filename: data.filename || data.title,
				...extra_args,
			},
			open_in_new_tab
		);
	};

	const prompt_pdf_options = () => {
		const data = get_export_data();
		if (!data || !has_rows(data)) {
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
				download("metta.utils.report_export.export_pdf", values, true);
				dialog.hide();
			},
		});
		dialog.show();
	};

	page.add_inner_button(__("Excel"), () => download("metta.utils.report_export.export_excel"), __("Export"));
	page.add_inner_button(__("PDF"), () => prompt_pdf_options(), __("Export"));
};
