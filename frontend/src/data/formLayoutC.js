// Shared bits of the "form view C" layout for the forms built from Desk
// metadata (DocForm.vue, stock/StockForm.vue). Layout only - no field,
// rule or permission is decided here.
import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { isVisible } from '@/data/formEngine'

// Three fields per row; a lone last field takes the whole row (row-fit).
export const FORM_GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'

// Fields that need a full row of their own (tables, long text, images, buttons).
const WIDE = ['Table', 'Table MultiSelect', 'Small Text', 'Text', 'Long Text', 'Text Editor', 'Code', 'Markdown Editor', 'HTML Editor', 'JSON', 'Signature', 'Geolocation', 'HTML', 'Image', 'Attach Image', 'Heading', 'Button']

// A one-column Desk section, cut into runs in Desk's order: short fields
// side by side three per row, each wide field (a table, long text) on its
// own full row. The grid fills row by row, so the reading order is Desk's.
export function fieldRuns(col, doc) {
  const out = []
  for (const df of col) {
    if (!isVisible(df, doc)) continue
    const wide = WIDE.includes(df.fieldtype)
    const last = out[out.length - 1]
    if (!wide && last && !last.wide) last.fields.push(df)
    else out.push({ wide, fields: [df] })
  }
  return out
}

const NAME_FIELDS = ['patient_name', 'full_name', 'customer_name']
const linkValue = (meta, doc, doctype) => meta.fields.filter((f) => f.fieldtype === 'Link' && f.options === doctype).map((f) => doc[f.fieldname]).find(Boolean) || ''
const firstOf = (doc, names) => names.map((f) => doc[f]).find((v) => v !== undefined && v !== null && v !== '') ?? ''

// Who the record is for, found from the doctype itself: a Link to Patient
// Registration (UHIN) and/or Patient Visit, with name / age / sex fields on
// the doc. What the doc lacks is read from the linked visit or patient.
// Null (no bar) for doctypes without such links, e.g. stock and masters.
export function usePatientBar(metaRef, docRef) {
  const fetched = ref({})
  const own = computed(() => {
    const meta = metaRef.value
    const doc = docRef.value
    if (!meta || !doc) return null
    const uhin = linkValue(meta, doc, 'Patient Registration')
    const visit = linkValue(meta, doc, 'Patient Visit')
    if (!uhin && !visit) return null
    return { uhin, visit, name: firstOf(doc, NAME_FIELDS), age: firstOf(doc, ['age', 'patient_age']), gender: firstOf(doc, ['gender', 'sex']) }
  })
  watch(
    () => (own.value ? `${own.value.uhin}|${own.value.visit}` : ''),
    async () => {
      fetched.value = {}
      const o = own.value
      if (!o || (o.name && o.uhin && o.gender)) return
      try {
        if (o.visit) {
          const v = await call('frappe.client.get_value', { doctype: 'Patient Visit', filters: o.visit, fieldname: ['uhin_id', 'patient_name', 'age', 'sex'] })
          fetched.value = { uhin: v?.uhin_id, name: v?.patient_name, age: v?.age, gender: v?.sex }
        } else {
          const p = await call('frappe.client.get_value', { doctype: 'Patient Registration', filters: o.uhin, fieldname: ['patient_name', 'age', 'sex'] })
          fetched.value = { name: p?.patient_name, age: p?.age, gender: p?.sex }
        }
      } catch {
        // no read on the linked record - the bar shows what the doc has
      }
    },
    { immediate: true },
  )
  return computed(() => {
    const o = own.value
    if (!o) return null
    const f = fetched.value
    const out = { uhin: o.uhin || f.uhin || '', visit: o.visit, name: o.name || f.name || '', age: o.age !== '' ? o.age : f.age ?? null, gender: o.gender || f.gender || '' }
    return out.name || out.uhin ? out : null
  })
}
