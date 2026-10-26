// Exports go through the same server methods Desk's report pages use
// (metta.utils.report_export - hospital letterhead, logo, styling), so a
// file downloaded from Vue is identical to one downloaded from Desk.
export const EXPORT_EXCEL = 'metta.utils.report_export.export_excel'
export const EXPORT_PDF = 'metta.utils.report_export.export_pdf'

// Same check as report_export.bundle.js: single-table or multi-section.
export function hasRows(data) {
  if (!data) return false
  return data.sections ? data.sections.some((s) => s.rows && s.rows.length) : !!(data.rows && data.rows.length)
}

function buildArgs(data) {
  return data.sections
    ? { sections: JSON.stringify(data.sections) }
    : { columns: JSON.stringify(data.columns), rows: JSON.stringify(data.rows) }
}

// A file download can't come back through fetch/XHR as a save dialog, so -
// like Desk's open_url_post - a hidden form is POSTed (with the session's
// CSRF token) and the browser handles the response.
export function postDownload(method, args, newTab = false) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `/api/method/${method}`
  if (newTab) form.target = '_blank'
  const all = { ...args, csrf_token: window.csrf_token || '' }
  for (const [k, v] of Object.entries(all)) {
    if (v === undefined || v === null) continue
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = k
    input.value = typeof v === 'string' ? v : JSON.stringify(v)
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

export function exportExcel(data) {
  postDownload(EXPORT_EXCEL, { title: data.title, subtitle: data.subtitle || '', ...buildArgs(data), filename: data.filename || data.title })
}

// PDF is served inline, so (as in Desk) it opens in a new tab in the
// browser's own viewer - which is also where it's printed from.
export function exportPdf(data, { page_size = 'A4', orientation = 'Portrait' } = {}) {
  postDownload(
    EXPORT_PDF,
    { title: data.title, subtitle: data.subtitle || '', ...buildArgs(data), filename: data.filename || data.title, page_size, orientation },
    true,
  )
}

// Script reports: Desk's own query-report export (frappe.desk.query_report.export_query).
export function exportQueryReport(reportName, filters, fileFormat = 'Excel') {
  postDownload('frappe.desk.query_report.export_query', {
    report_name: reportName,
    file_format_type: fileFormat,
    filters: JSON.stringify(filters || {}),
    ignore_visible_idx: 1,
    include_indentation: 0,
  })
}

// Desk list view filtered the way a drill-down asks for, in a new tab - the
// same URL shape Hospital Overview builds (field=value or field=[op, value]).
export function deskListUrl(doctype, filters) {
  const params = new URLSearchParams()
  for (const [field, val] of Object.entries(filters || {})) {
    if (val === undefined || val === null || val === '') continue
    params.set(field, typeof val === 'string' || typeof val === 'number' ? val : JSON.stringify(val))
  }
  const slug = doctype.toLowerCase().replace(/\s+/g, '-')
  return `/desk/${slug}?${params.toString()}`
}
