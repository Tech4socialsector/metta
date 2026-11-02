frappe.provide("metta.print_preview");

// Shared by every doctype's "Print" button so the dialog-with-print-button
// UX and the print-only popup window mechanics stay identical everywhere,
// instead of each doctype.js re-implementing the same ~20 lines (this is
// the same mechanism Patient Visit's own "Receipt Preview" button already
// used, pulled out here so every other doctype can reuse it with one line).
metta.print_preview.show = function (frm, print_format, opts) {
	opts = opts || {};
	frappe.call({
		method: "metta.utils.print_utils.get_print_format_html",
		args: {
			doctype: frm.doc.doctype,
			docname: frm.doc.name,
			print_format: print_format,
		},
		callback(r) {
			if (!r.message) {
				return;
			}
			const html = r.message;
			const dialog = new frappe.ui.Dialog({
				title: opts.title || __("Print Preview"),
				size: opts.size || "large",
				fields: [
					{
						fieldtype: "HTML",
						fieldname: "preview",
						options: html,
					},
				],
				primary_action_label: __("Print"),
				primary_action() {
					// A blank print-only window keeps the browser's print dialog
					// scoped to just the document, not the whole Desk page behind it.
					const print_window = window.open("", "_blank");
					print_window.document.write(
						`<html><head><title>${frappe.utils.escape_html(frm.doc.name)}</title></head><body>${html}</body></html>`
					);
					print_window.document.close();
					print_window.focus();
					print_window.print();
				},
			});
			dialog.show();
		},
	});
};
