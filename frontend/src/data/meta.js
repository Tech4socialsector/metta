import { call } from 'frappe-ui'

// Doctype layouts come from the server (the same meta Desk renders from),
// so a field added or moved in a doctype shows up here without code edits.
const cache = new Map()

export async function getMeta(doctype) {
  if (cache.has(doctype)) return cache.get(doctype)
  const promise = call('frappe.desk.form.load.getdoctype', { doctype }).then((res) => {
    const docs = res?.docs || []
    // getdoctype returns the doctype plus every child table doctype it uses.
    const byName = Object.fromEntries(docs.map((d) => [d.name, d]))
    for (const d of docs) if (!cache.has(d.name)) cache.set(d.name, Promise.resolve({ meta: d, byName }))
    return { meta: byName[doctype], byName }
  })
  cache.set(doctype, promise)
  return promise
}

// Desk's depends_on / mandatory_depends_on: "eval:<js>" or a plain fieldname.
export function evalDependsOn(expr, doc, parent) {
  if (!expr) return true
  try {
    if (expr.startsWith('eval:')) {
      // Desk evaluates these with doc (and parent, for a child-table row).
      // eslint-disable-next-line no-new-func
      return !!new Function('doc', 'parent', `return (${expr.slice(5)})`)(doc, parent || {})
    }
    return !!doc[expr]
  } catch {
    return true
  }
}

const NO_VALUE_TYPES = ['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Button', 'Fold', 'Heading', 'Image']

// Turns meta.fields into Desk's layout: sections of columns of fields.
// Tab breaks become section headings, since this view is one long page.
export function layoutSections(meta, doc) {
  const sections = []
  let section = { label: '', columns: [[]], collapsible: false }
  let tabHidden = false
  let sectionHidden = false
  const push = () => {
    if (!sectionHidden && section.columns.some((c) => c.length)) sections.push(section)
  }
  for (const df of meta.fields || []) {
    if (df.fieldtype === 'Tab Break') {
      push()
      tabHidden = !!df.hidden || !evalDependsOn(df.depends_on, doc)
      sectionHidden = tabHidden
      section = { label: df.label || '', columns: [[]], collapsible: false }
      continue
    }
    if (df.fieldtype === 'Section Break') {
      push()
      sectionHidden = tabHidden || !!df.hidden || !evalDependsOn(df.depends_on, doc)
      section = { label: df.label || '', columns: [[]], collapsible: !!df.collapsible }
      continue
    }
    if (df.fieldtype === 'Column Break') {
      section.columns.push([])
      continue
    }
    if (NO_VALUE_TYPES.includes(df.fieldtype)) continue
    if (df.hidden || !evalDependsOn(df.depends_on, doc)) continue
    section.columns[section.columns.length - 1].push(df)
  }
  push()
  return sections
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

// Read-only display of one value, the way Desk formats it.
export function formatValue(df, value) {
  if (value === null || value === undefined || value === '') return '—'
  switch (df.fieldtype) {
    case 'Check':
      return value ? 'Yes' : 'No'
    case 'Currency':
      return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'Percent':
      return `${Number(value)}%`
    case 'Float':
      return Number(value).toLocaleString('en-IN')
    case 'Date': {
      const [y, m, d] = String(value).split('-').map(Number)
      return dateFmt.format(new Date(y, m - 1, d))
    }
    case 'Datetime': {
      const [date, time] = String(value).split(' ')
      const [y, m, d] = date.split('-').map(Number)
      return `${dateFmt.format(new Date(y, m - 1, d))} ${(time || '').slice(0, 5)}`
    }
    default:
      return String(value)
  }
}
