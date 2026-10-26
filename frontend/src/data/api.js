import { call } from 'frappe-ui'

// Every Desk server method is reused as-is; these are the paths the Desk
// forms themselves call, so the Vue screens get identical answers.
export const REG = 'metta.metta.doctype.patient_registration.patient_registration'
export const VISIT = 'metta.metta.doctype.patient_visit.patient_visit'
export const DC = 'metta.metta.doctype.doctor_consultation.doctor_consultation'

export function api(method, args = {}) {
  return call(method, args)
}

export function getValue(doctype, name, fieldname) {
  return call('frappe.client.get_value', { doctype, filters: name, fieldname })
}

// Frappe's own error text, the same message Desk would show in its dialog.
export function errorText(err) {
  if (!err) return ''
  const messages = err.messages
  if (Array.isArray(messages) && messages.length) {
    return messages
      .map((m) => {
        try {
          const parsed = typeof m === 'string' ? JSON.parse(m) : m
          return parsed.message || m
        } catch {
          return m
        }
      })
      .join('\n')
      .replace(/<[^>]+>/g, '')
  }
  return String(err.message || err).replace(/<[^>]+>/g, '')
}
