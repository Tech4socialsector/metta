// The lab's status workflow on top of Diagnostic Test's own Status field.
// The server only allows one step forward at a time (or Cancel), so these
// buttons are the usual path; the dropdown can't skip a step either.
export const DT = 'Diagnostic Test'
export const LAB_API = 'metta.vue.lab'
// Sample collection lives on the doctype's own module so Desk uses it too.
export const LAB_API_DT = 'metta.metta.doctype.diagnostic_test.diagnostic_test'

// Desk's print view with the Lab Report format (phase 4).
export function printUrl(name) {
  return `/printview?doctype=${encodeURIComponent(DT)}&name=${encodeURIComponent(name)}&format=${encodeURIComponent('Lab Report')}&no_letterhead=0`
}

// Roles that may verify a lab test and release it to the doctor.
export const VERIFIER_ROLES = ['Lab Verifier', 'System Manager']

export const NEXT_STEP = {
  Ordered: { label: 'Mark sample collected', to: 'Sample Collected' },
  'Sample Collected': { label: 'Save result', to: 'Result Entered', needsResult: true },
  'Result Entered': { label: 'Report', to: 'Reported', verify: true, verifyLabel: 'Verify & report' },
}

// Statuses a test can still be cancelled from (Reported is final work).
export const CANCELLABLE = ['Ordered', 'Sample Collected', 'Result Entered']

export const NEEDS_RESULT_MSG = 'Enter every result or attach the report first.'

// "Now" as a Datetime value, pinned to Asia/Kolkata like the rest of the
// app, so the browser's own timezone never shifts the recorded time.
export function nowIST() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type) => parts.find((p) => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

// The same flag rule as DiagnosticTest's result_flag() on the server, so the
// flag shows while typing; the server sets the stored value on save.
export function resultFlag(r) {
  const value = String(r.result_value ?? '').trim()
  if (!value) return ''
  // "Normal" when it can be judged and passes (user, 2026-10-28); empty when
  // there is nothing to judge against.
  if (r.value_type !== 'Number') {
    if (!r.normal_text) return ''
    return value.toLowerCase() === String(r.normal_text).trim().toLowerCase() ? 'Normal' : 'Abnormal'
  }
  const v = Number(value)
  if (Number.isNaN(v)) return ''
  // Critical first; 0 means "not set", as on the server.
  if (r.critical_low && v < r.critical_low) return 'Critical Low'
  if (r.critical_high && v > r.critical_high) return 'Critical High'
  if (r.low && v < r.low) return 'Low'
  if (r.high && v > r.high) return 'High'
  return r.low || r.high || r.critical_low || r.critical_high ? 'Normal' : ''
}

// One colour scale for flags everywhere (same as Desk and the printed
// report): green normal, blue low, orange high/abnormal, red critical.
// Full class names, so Tailwind keeps them.
// Solid fills, not coloured text (user, 2026-10-28).
export const FLAG_CLASS = {
  Normal: 'bg-green-600 text-white ring-green-600',
  Low: 'bg-blue-600 text-white ring-blue-600',
  High: 'bg-orange-500 text-white ring-orange-500',
  Abnormal: 'bg-orange-500 text-white ring-orange-500',
  'Critical Low': 'bg-red-600 text-white ring-red-600',
  'Critical High': 'bg-red-600 text-white ring-red-600',
}
// The result box itself takes a light shade of the same colour. Inline
// style, so it wins over the input's own grey/white background.
export const FLAG_BG = {
  Normal: { background: '#dcfce7', borderColor: '#86efac' },
  Low: { background: '#dbeafe', borderColor: '#93c5fd' },
  High: { background: '#ffedd5', borderColor: '#fdba74' },
  Abnormal: { background: '#ffedd5', borderColor: '#fdba74' },
  'Critical Low': { background: '#fee2e2', borderColor: '#f87171' },
  'Critical High': { background: '#fee2e2', borderColor: '#f87171' },
}
export const FLAG_ARROW = { Low: '↓', High: '↑', 'Critical Low': '↓↓', 'Critical High': '↑↑' }

// A template test needs every row filled; any other test needs the
// free-text result or an attachment (same rule as the server).
export function hasResult(doc) {
  if (doc.results?.length) return doc.results.every((r) => String(r.result_value || '').trim())
  return !!(String(doc.result || '').trim() || doc.result_attachment)
}
