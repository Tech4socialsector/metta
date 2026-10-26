// One purchase document on screen: load, field changes (with the Desk
// client-script hooks each form passes in), save, submit, cancel, amend,
// delete and the document's own whitelisted methods. The same steps as
// src/pages/DocForm.vue, kept here so the five purchase forms share them.
import { computed, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import { getMeta } from '@/data/meta'
import { errorText } from '@/data/api'
import { session } from '@/data/session'
import { loadFormMenu, formInfo } from '@/data/formMenu'
import { newDoc, newChildRow, missingFields, toPayload, fetchTargets, isReadOnly } from '@/data/formEngine'
import { VUE } from '@/data/purchase/rules'

const NUMBER = ['Int', 'Float', 'Currency', 'Percent']
// What Desk's Amend leaves behind when it copies a cancelled document.
const NOT_COPIED = ['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'amended_from', 'amendment_date', 'cancel_reason', 'idx', '_user_tags', '_comments', '_assign', '_liked_by', '_seen']

// Can the user create this other doctype? (Desk's frappe.model.can_create)
export async function canCreate(doctype) {
  await loadFormMenu()
  return !!formInfo(doctype)?.can_create
}

/**
 * opts: { doctype, name, routeName, listName,
 *   onChange(fieldname, value), onRowChange(tableField, row, fieldname),
 *   onRowsChange(tableField), onLoaded(query), readOnlyFields: [] }
 */
export function useDocForm(opts) {
  const route = useRoute()
  const router = useRouter()

  const meta = ref(null)
  const byName = ref({})
  const doc = ref(null)
  const original = ref({})
  const snapshot = ref('')
  const perms = ref({})
  const loadError = ref('')
  const saveError = ref('')
  const staleDoc = ref(false)
  const busy = ref(false)
  const tried = ref(false)
  // Desk's show_alert / msgprint: { kind: 'success' | 'error' | 'info', title, text }
  const notice = ref(null)

  const isNew = opts.name === 'new'
  const canWrite = computed(() => (isNew ? !!perms.value.create : !!perms.value.write))
  const editable = computed(() => canWrite.value && doc.value?.docstatus === 0)
  const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
  const missing = computed(() => (meta.value && doc.value ? missingFields(meta.value, doc.value, byName.value) : []))
  const statusLabel = computed(() => {
    if (!doc.value || isNew) return ''
    if (doc.value.docstatus === 0) return 'Draft'
    if (doc.value.docstatus === 2) return 'Cancelled'
    return doc.value.status || 'Submitted'
  })

  function field(fieldname) {
    return meta.value?.fields.find((f) => f.fieldname === fieldname)
  }
  function tableMeta(tableField) {
    return byName.value[field(tableField)?.options]
  }
  function readOnly(df) {
    if ((opts.readOnlyFields || []).includes(df.fieldname)) return true
    return isReadOnly(df, doc.value, { canWrite: canWrite.value, original: original.value })
  }
  function say(kind, text, title = '') {
    notice.value = { kind, text, title }
  }

  // A Link fills its fetch_from fields (as Desk does); clearing it clears them.
  async function fillFetches(m, target, df, v) {
    if (df.fieldtype !== 'Link') return
    const targets = fetchTargets(m, df.fieldname)
    if (!targets.length) return
    if (!v) {
      for (const t of targets) if (!t.df.fetch_if_empty) target[t.df.fieldname] = null
      return
    }
    try {
      const vals = await call('frappe.client.get_value', { doctype: df.options, filters: v, fieldname: targets.map((t) => t.source) })
      if (target[df.fieldname] !== v) return
      for (const t of targets) {
        if (t.df.fetch_if_empty && target[t.df.fieldname]) continue
        target[t.df.fieldname] = vals?.[t.source] ?? null
      }
    } catch {
      // the server fills fetched values on save
    }
  }

  async function setValue(fieldname, v, { silent = false } = {}) {
    const df = field(fieldname)
    if (df && NUMBER.includes(df.fieldtype) && typeof v === 'string') v = v === '' ? null : parseFloat(v)
    doc.value[fieldname] = v
    if (df) await fillFetches(meta.value, doc.value, df, v)
    if (!silent) await opts.onChange?.(fieldname, v)
  }

  async function setRowValue(tableField, row, fieldname, v) {
    row[fieldname] = v
    const cm = tableMeta(tableField)
    const cdf = cm?.fields.find((f) => f.fieldname === fieldname)
    if (cdf) await fillFetches(cm, row, cdf, v)
    await opts.onRowChange?.(tableField, row, fieldname)
  }

  // frm.add_child: a row with the child doctype's defaults, then the values.
  function addRow(tableField, values = {}) {
    if (!Array.isArray(doc.value[tableField])) doc.value[tableField] = []
    const row = newChildRow(tableMeta(tableField), doc.value, tableField, session.user)
    Object.assign(row, values)
    doc.value[tableField].push(row)
    return doc.value[tableField][doc.value[tableField].length - 1]
  }
  // frm.clear_table + add_child for each.
  function setRows(tableField, rows) {
    doc.value[tableField] = []
    for (const r of rows) addRow(tableField, r)
    opts.onRowsChange?.(tableField)
  }
  function removeRow(tableField, index) {
    doc.value[tableField].splice(index, 1)
    opts.onRowsChange?.(tableField)
  }
  // Desk's items_add: a blank row added from the grid.
  function addBlankRow(tableField) {
    const row = addRow(tableField)
    opts.onRowsChange?.(tableField)
    return row
  }

  function remember() {
    original.value = JSON.parse(JSON.stringify(doc.value))
    snapshot.value = JSON.stringify(toPayload(doc.value))
  }

  async function loadPerms() {
    perms.value = await call(`${VUE}.get_permissions`, { doctype: opts.doctype, name: isNew ? undefined : doc.value.name })
  }

  async function load() {
    loadError.value = ''
    saveError.value = ''
    staleDoc.value = false
    tried.value = false
    try {
      const m = await getMeta(opts.doctype)
      meta.value = m.meta
      byName.value = m.byName
      if (isNew) {
        doc.value = newDoc(m.meta, session.user)
        if (route.query.amend) await copyForAmend(String(route.query.amend))
        else {
          // Starting values from the address, like Desk's
          // frappe.new_doc(doctype, values); Links fill their fetches.
          for (const [k, v] of Object.entries(route.query)) {
            const df = field(k)
            if (df && df.fieldtype !== 'Table' && typeof v === 'string') await setValue(k, v, { silent: true })
          }
        }
      } else {
        doc.value = await call('frappe.client.get', { doctype: opts.doctype, name: opts.name })
      }
      await loadPerms()
      remember()
      await opts.onLoaded?.(route.query)
    } catch (err) {
      loadError.value = errorText(err) || `${opts.doctype} ${opts.name} could not be opened.`
    }
  }

  // Desk's Amend: a draft copy of the cancelled document, amended_from set
  // (the server then names it e.g. PB-2026-00001-1).
  async function copyForAmend(sourceName) {
    const src = await call('frappe.client.get', { doctype: opts.doctype, name: sourceName })
    for (const [k, v] of Object.entries(src)) {
      if (NOT_COPIED.includes(k)) continue
      doc.value[k] = Array.isArray(v)
        ? v.map((r) => {
            const row = { ...r, __new: 1, docstatus: 0 }
            delete row.parent
            return row
          })
        : v
    }
    doc.value.amended_from = src.name
    doc.value.docstatus = 0
  }

  function showError(err) {
    staleDoc.value = err?.exc_type === 'TimestampMismatchError'
    saveError.value = errorText(err) || 'Something went wrong. Please try again.'
  }

  async function save() {
    tried.value = true
    saveError.value = ''
    if (missing.value.length) {
      document.querySelector('[role=alert]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    busy.value = true
    try {
      const payload = toPayload(doc.value)
      const saved = isNew ? await call('frappe.client.insert', { doc: payload }) : await call('frappe.client.save', { doc: payload })
      snapshot.value = JSON.stringify(toPayload(saved))
      if (isNew) {
        router.replace({ name: opts.routeName, params: { name: saved.name } })
        return true
      }
      doc.value = saved
      remember()
      tried.value = false
      return true
    } catch (err) {
      showError(err)
      return false
    } finally {
      busy.value = false
    }
  }

  // Wraps an action: busy flag, error banner, then reload the document.
  async function act(fn, { reload = true } = {}) {
    busy.value = true
    saveError.value = ''
    try {
      await fn()
      if (reload) await load()
      return true
    } catch (err) {
      showError(err)
      return false
    } finally {
      busy.value = false
    }
  }

  const submit = () => act(() => call('frappe.client.submit', { doc: toPayload(doc.value) }))
  const cancelDoc = () => act(() => call('frappe.client.cancel', { doctype: opts.doctype, name: doc.value.name }))
  // frm.call("<method>", args): the document's own whitelisted method.
  const runMethod = (method, args) => act(() => call('run_doc_method', { dt: opts.doctype, dn: doc.value.name, method, args: args ? JSON.stringify(args) : undefined }))

  async function deleteDoc() {
    const ok = await act(() => call('frappe.client.delete', { doctype: opts.doctype, name: doc.value.name }), { reload: false })
    if (ok) {
      snapshot.value = JSON.stringify(toPayload(doc.value))
      router.replace({ name: opts.listName })
    }
  }
  function amend() {
    router.push({ name: opts.routeName, params: { name: 'new' }, query: { amend: doc.value.name } })
  }
  function discard() {
    if (isNew) router.push({ name: opts.listName })
    else load()
  }

  // Leaving with unsaved changes asks first (new drafts are left freely, as in DocForm).
  onBeforeRouteLeave(() => !(dirty.value && canWrite.value && !isNew && doc.value?.docstatus === 0) || window.confirm('You have unsaved changes. Leave without saving?'))

  return reactive({
    doctype: opts.doctype,
    routeName: opts.routeName,
    listName: opts.listName,
    isNew,
    meta,
    byName,
    doc,
    perms,
    loadError,
    saveError,
    staleDoc,
    busy,
    tried,
    notice,
    canWrite,
    editable,
    dirty,
    missing,
    statusLabel,
    field,
    tableMeta,
    readOnly,
    say,
    setValue,
    setRowValue,
    addRow,
    setRows,
    removeRow,
    addBlankRow,
    load,
    save,
    submit,
    cancelDoc,
    deleteDoc,
    runMethod,
    amend,
    discard,
  })
}
