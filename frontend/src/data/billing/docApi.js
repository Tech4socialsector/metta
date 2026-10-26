// Save / submit / cancel / amend for the Billing module's screens - the same
// frappe.client calls Desk makes, so every server rule (validate, on_submit,
// on_cancel) runs exactly as it does from Desk.
import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { call } from 'frappe-ui'
import { toPayload } from '@/data/formEngine'

export function getPerms(doctype, name) {
  return call('metta.api.get_doc_permissions', name ? { doctype, name } : { doctype })
}

export function saveDoc(doc) {
  const payload = toPayload(doc)
  return doc.__islocal ? call('frappe.client.insert', { doc: payload }) : call('frappe.client.save', { doc: payload })
}

export function submitDoc(doc) {
  return call('frappe.client.submit', { doc: toPayload(doc) })
}

export function cancelDoc(doctype, name) {
  return call('frappe.client.cancel', { doctype, name })
}

export function deleteDoc(doctype, name) {
  return call('frappe.client.delete', { doctype, name })
}

// Desk's Amend: a copy of the cancelled document linked back through
// amended_from; the server names it <name>-1.
export async function amendCopy(doctype, name) {
  const src = await call('frappe.client.get', { doctype, name })
  const strip = (r) => {
    for (const k of ['name', 'owner', 'creation', 'modified', 'modified_by', 'parent', 'docstatus']) delete r[k]
    r.__new = 1
    return r
  }
  const copy = { ...src, __islocal: 1, docstatus: 0, amended_from: name }
  for (const k of ['name', 'owner', 'creation', 'modified', 'modified_by']) delete copy[k]
  for (const [k, v] of Object.entries(copy)) if (Array.isArray(v)) copy[k] = v.map((r) => strip({ ...r }))
  return copy
}

export function statusOf(doc) {
  if (!doc || doc.__islocal) return ''
  return ['Draft', 'Submitted', 'Cancelled'][doc.docstatus] || ''
}

export function openPrint(doctype, name, format) {
  const q = new URLSearchParams({ doctype, name, ...(format ? { format } : {}) })
  window.open(`/printview?${q}`, '_blank')
}

// Desk's dirty-form behaviour: Ctrl/Cmd+S saves, leaving asks first.
export function useFormGuard(isDirty, onSave) {
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      onSave()
    }
  }
  const onUnload = (e) => {
    if (isDirty()) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  onBeforeRouteLeave(() => !isDirty() || window.confirm('You have unsaved changes. Leave without saving?'))
  onMounted(() => {
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('beforeunload', onUnload)
  })
}
