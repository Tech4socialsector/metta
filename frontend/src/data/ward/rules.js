// Small shared pieces for the ward / front-desk screens. Select options are
// copied from the doctype JSON - change both together.
import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { flt } from '@/data/registrationRules'

export const VISIT_OPTIONS = {
  accommodation_type: ['', 'Ward', 'Room'],
  admission_status: ['Admitted', 'Discharged'],
  mlc_type: ['', 'RTA (Road Traffic Accident)', 'Assault', 'Poisoning', 'Burn', 'Suicide Attempt', 'Animal Bite', 'Other'],
  brought_by: ['', 'Police', 'Relative', 'Public', 'Self'],
}

export const DISCHARGE_OPTIONS = {
  care_department: ['', 'Medicine', 'Surgery', 'Paediatrics', 'Obstetrics', 'Gynaecology', 'Eye', 'Ortho'],
  condition_at_discharge: ['', 'Improved', 'Worse', 'LAMA', 'Unchanged', 'Died', 'Transfer', 'Absconded', 'Referred'],
}

export const APPOINTMENT_STATUS = ['', 'Scheduled', 'Checked-in', 'Completed', 'Cancelled', 'No-show']

// Fields Patient Visit fetches from the patient (fetch_from uhin_id.*):
// visit field -> registration field.
export const VISIT_FROM_PATIENT = {
  first_name: 'first_name',
  last_name: 'last_name',
  patient_name: 'patient_name',
  sex: 'sex',
  dob: 'dob',
  blood_group: 'blood_group',
  marital_status: 'marital_status',
  uid: 'uid',
  phone: 'phone',
  email: 'email',
  address: 'address',
  billing_category: 'billing_category',
  company_name: 'corporate_customer',
}

export function money(v) {
  return `₹${flt(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Frappe stores Datetime as "YYYY-MM-DD HH:mm:ss"; <input type=datetime-local>
// wants "YYYY-MM-DDTHH:mm".
export function toDatetimeInput(v) {
  return v ? String(v).slice(0, 16).replace(' ', 'T') : ''
}
export function fromDatetimeInput(v) {
  return v ? `${v.replace('T', ' ')}:00` : null
}

// Prescription Item's calculate_prescription_qty (discharge_summary.js):
// Dosage "1-0-1" is doses per day, times Duration in days.
export function prescriptionQty(dosage, duration) {
  if (!dosage || !duration) return null
  const perDay = String(dosage)
    .split('-')
    .reduce((total, part) => total + (parseInt(part, 10) || 0), 0)
  return perDay * (parseInt(duration, 10) || 0)
}

// Unsaved-changes guard, as the generic form has: asks before leaving the
// page, and Ctrl/Cmd+S saves. isDirty / onSave are functions.
export function useUnsavedGuard(isDirty, onSave) {
  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      onSave()
    }
  }
  function onBeforeUnload(e) {
    if (isDirty()) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  onBeforeRouteLeave(() => !isDirty() || window.confirm('You have unsaved changes. Leave without saving?'))
  onMounted(() => {
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onBeforeUnload)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('beforeunload', onBeforeUnload)
  })
}
