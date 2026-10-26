// The generic form engine: turns a doctype's Desk definition (meta) into a
// form - layout, defaults, and the field rules Desk applies on its own
// (depends_on, mandatory_depends_on, read_only_depends_on, fetch_from,
// set_only_once, allow_on_submit). Form-specific Desk client scripts are not
// covered here; those forms get their own Vue screens.
import { evalDependsOn } from '@/data/meta'
import { todayStr } from '@/data/registrationRules'

export const LAYOUT_TYPES = ['Section Break', 'Column Break', 'Tab Break']

// The few form scripts that only filter a Link picker (set_query) or clean
// a value - ported here so these forms behave exactly as in Desk.
const digits10 = (v) => (v ? String(v).replace(/\D/g, '').slice(0, 10) : v)
const FORM_RULES = {
  // batch.js
  Batch: { filters: { item: { item_type: ['in', ['Medicine', 'Consumable']], is_active: 1 } } },
  // diagnostic_test.js
  'Diagnostic Test': { filters: { item: { item_type: 'Service', is_active: 1 } } },
  // supplier.js
  Supplier: { clean: { contact_number: digits10 } },
}

export function linkFilters(doctype, fieldname) {
  return FORM_RULES[doctype]?.filters?.[fieldname] || null
}

export function cleanValue(doctype, fieldname, value) {
  const fn = FORM_RULES[doctype]?.clean?.[fieldname]
  return fn ? fn(value) : value
}
const NO_INPUT = ['HTML', 'Button', 'Fold', 'Heading', 'Image']

// meta.fields -> [{ label, sections: [{ label, collapsible, df, columns: [[df]] }] }]
export function buildLayout(meta) {
  const tabs = []
  let tab = { label: '', df: null, sections: [] }
  let section = { label: '', collapsible: false, df: null, columns: [[]] }
  const pushSection = () => {
    if (section.columns.some((c) => c.length)) tab.sections.push(section)
  }
  for (const df of meta.fields || []) {
    if (df.fieldtype === 'Tab Break') {
      pushSection()
      if (tab.sections.length) tabs.push(tab)
      tab = { label: df.label || '', df, sections: [] }
      section = { label: '', collapsible: false, df: null, columns: [[]] }
    } else if (df.fieldtype === 'Section Break') {
      pushSection()
      section = { label: df.label || '', collapsible: !!df.collapsible, df, columns: [[]] }
    } else if (df.fieldtype === 'Column Break') {
      section.columns.push([])
    } else if (!NO_INPUT.includes(df.fieldtype)) {
      section.columns[section.columns.length - 1].push(df)
    }
  }
  pushSection()
  if (tab.sections.length) tabs.push(tab)
  return tabs
}

function nowStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// A field's starting value on a new document, as Desk sets it.
export function defaultValue(df, user) {
  const d = df.default
  if (d === undefined || d === null || d === '') {
    if (df.fieldtype === 'Check') return 0
    if (df.fieldtype === 'Select') return String(df.options || '').split('\n')[0] || ''
    if (df.fieldtype === 'Table' || df.fieldtype === 'Table MultiSelect') return []
    return null
  }
  if (d === 'Today' && df.fieldtype === 'Date') return todayStr()
  if (d === 'Today' || d === 'Now') return df.fieldtype === 'Date' ? todayStr() : nowStr()
  if (d === '__user') return user
  if (df.fieldtype === 'Check') return Number(d) ? 1 : 0
  if (['Int', 'Float', 'Currency', 'Percent'].includes(df.fieldtype)) return Number(d)
  return d
}

export function newDoc(meta, user) {
  const doc = { doctype: meta.name, __islocal: 1, docstatus: 0 }
  for (const df of meta.fields || []) {
    if (LAYOUT_TYPES.includes(df.fieldtype) || NO_INPUT.includes(df.fieldtype)) continue
    doc[df.fieldname] = defaultValue(df, user)
  }
  return doc
}

export function newChildRow(childMeta, parentDoc, parentfield, user) {
  const row = newDoc(childMeta, user)
  delete row.__islocal
  row.__new = 1
  row.parentfield = parentfield
  row.parenttype = parentDoc.doctype
  row.idx = (parentDoc[parentfield] || []).length + 1
  return row
}

export function isVisible(df, doc, parent) {
  return !df.hidden && evalDependsOn(df.depends_on, doc, parent)
}

export function isRequired(df, doc, parent) {
  return !!df.reqd || (!!df.mandatory_depends_on && evalDependsOn(df.mandatory_depends_on, doc, parent))
}

// Read-only as Desk decides it for this document's state.
export function isReadOnly(df, doc, { canWrite, original, parent } = {}) {
  if (!canWrite) return true
  if (doc.docstatus === 2) return true
  if (doc.docstatus === 1 && !df.allow_on_submit) return true
  if (df.read_only) return true
  if (df.read_only_depends_on && evalDependsOn(df.read_only_depends_on, doc, parent)) return true
  if (df.set_only_once && !doc.__islocal && original && original[df.fieldname]) return true
  return false
}

export function isEmpty(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

// Fields filled from a Link: fetch_from "link_field.source_field".
export function fetchTargets(meta, linkField) {
  return (meta.fields || [])
    .filter((f) => f.fetch_from && f.fetch_from.split('.')[0] === linkField)
    .map((f) => ({ df: f, source: f.fetch_from.split('.')[1] }))
}

// The labels of required fields that are visible and still empty -
// what Desk's "Missing Fields" dialog lists. Includes child-table rows.
export function missingFields(meta, doc, byName) {
  const out = []
  for (const df of meta.fields || []) {
    if (LAYOUT_TYPES.includes(df.fieldtype) || NO_INPUT.includes(df.fieldtype)) continue
    if (!isVisible(df, doc)) continue
    if ((df.fieldtype === 'Table' || df.fieldtype === 'Table MultiSelect') && byName[df.options]) {
      if (isRequired(df, doc) && isEmpty(doc[df.fieldname])) out.push(df.label)
      ;(doc[df.fieldname] || []).forEach((row, i) => {
        for (const cdf of byName[df.options].fields || []) {
          if (LAYOUT_TYPES.includes(cdf.fieldtype) || NO_INPUT.includes(cdf.fieldtype)) continue
          if (isVisible(cdf, row, doc) && isRequired(cdf, row, doc) && isEmpty(row[cdf.fieldname])) out.push(`${df.label} row ${i + 1}: ${cdf.label}`)
        }
      })
      continue
    }
    if (isRequired(df, doc) && isEmpty(doc[df.fieldname])) out.push(df.label)
  }
  return out
}

// What is sent to the server: no local-only keys.
export function toPayload(doc) {
  const out = {}
  for (const [k, v] of Object.entries(doc)) {
    if (k === '__new' || k === '__islocal' || k === '__unsaved') continue
    if (Array.isArray(v)) {
      out[k] = v.map((row, i) => {
        const r = { ...row, idx: i + 1 }
        if (r.__new) {
          delete r.__new
          delete r.name
        }
        return r
      })
    } else out[k] = v
  }
  return out
}
