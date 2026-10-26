// Script reports run through Desk's own frappe.desk.query_report.run, so the
// columns, rows and totals are exactly what /desk/query-report/<name> shows.
export const QUERY_REPORT_RUN = 'frappe.desk.query_report.run'

export function queryReportArgs(reportName, filters) {
  // Desk drops empty filters before sending them.
  const clean = Object.fromEntries(Object.entries(filters || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined))
  return { report_name: reportName, filters: JSON.stringify(clean), ignore_prepared_report: true, are_default_filters: false }
}

// Desk column spec ("Label:Currency/Options:120" strings or dicts) as
// { key, label, fieldtype, options } - ReportTable's type is set from fieldtype.
export function normaliseColumns(columns) {
  return (columns || []).map((c, i) => {
    let col = c
    if (typeof c === 'string') {
      const [label, typePart = 'Data'] = c.split(':')
      const [fieldtype, options] = typePart.split('/')
      col = { label, fieldtype: fieldtype || 'Data', options, fieldname: label.toLowerCase().replace(/\W+/g, '_') }
    }
    const ft = col.fieldtype || 'Data'
    const type = ft === 'Currency' ? 'currency' : ['Float', 'Int', 'Percent'].includes(ft) ? 'number' : ft === 'Date' ? 'date' : 'text'
    return { key: col.fieldname || String(i), label: col.label, fieldtype: ft, options: col.options, type }
  })
}

// Rows may be dicts or arrays (keyed by column position).
export function normaliseRows(result, cols) {
  return (result || []).map((r) => (Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c.key, r[i]])) : r))
}
