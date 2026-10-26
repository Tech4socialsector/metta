// Ports of the Desk client rules for Patient Registration and Patient Visit.
// Each function names the Desk function it mirrors - change both together.
// The server's validate() stays authoritative; these are live previews.

// patient_registration.js FIXED_BILLING_CATEGORIES
export const FIXED_BILLING_CATEGORIES = ['General', 'Staff', 'Staff Dependent']

// patient_registration.js CHILD_RELATIONSHIPS / DEPENDENT_CHILD_AGE_LIMIT
export const CHILD_RELATIONSHIPS = ['Son', 'Daughter']
export const DEPENDENT_CHILD_AGE_LIMIT = 21

// patient_registration.js CHW_GENDER_TO_SEX
export const CHW_GENDER_TO_SEX = { Male: 'Male', Female: 'Female' }

// Select options, copied from the doctype JSON.
export const OPTIONS = {
  blood_group: ['', 'A Positive', 'A Negative', 'AB Positive', 'AB Negative', 'B Positive', 'B Negative', 'O Positive', 'O Negative'],
  sex: ['', 'Male', 'Female', 'Others'],
  marital_status: ['', 'Single', 'Married', 'Divorced', 'Widow'],
  relationship_to_the_patient: ['', 'Husband', 'Wife', 'Mother', 'Father', 'Son', 'Daughter', 'Brother', 'Sister', 'Guardian', 'Friend', 'Other'],
  dependent_relationship: ['', 'Husband', 'Wife', 'Son', 'Daughter', 'Father', 'Mother'],
  default_currency: ['', 'INR', 'USD', 'AED'],
  payment_mode: ['', 'Cash', 'UPI', 'Card', 'Credit - Corporate'],
}

// phone / emergency_phone_number handlers: digits only, first 10.
export function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10)
}

// update_patient_name_preview / calculate_full_name
export function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ')
}

// update_age_preview / calculate_age. dob is "YYYY-MM-DD".
export function ageFromDob(dob) {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - y
  const month = today.getMonth() + 1
  const birthdayPassed = month > m || (month === m && today.getDate() >= d)
  if (!birthdayPassed) age -= 1
  return age
}

// check_dependent_aged_out_preview / check_dependent_aged_out
export function dependentAgedOut(relationship, age) {
  return CHILD_RELATIONSHIPS.includes(relationship) && age !== null && age !== '' && age !== undefined && Number(age) >= DEPENDENT_CHILD_AGE_LIMIT
}

// patient_visit.js cutoffs
const AFTER_HOURS_CUTOFF_MINUTES = 17 * 60 + 30
const SATURDAY_EMERGENCY_CUTOFF_MINUTES = 13 * 60 + 30
const MONDAY_EMERGENCY_END_MINUTES = 8 * 60

// parse_12h_time
export function parse12hTime(timeStr) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec((timeStr || '').trim())
  if (!match) return null
  let hours = Number(match[1]) % 12
  if (match[4].toUpperCase() === 'PM') hours += 12
  return { hours, minutes: Number(match[2]), seconds: Number(match[3]) }
}

// is_after_hours
export function isAfterHours(dateStr, timeStr) {
  const parsed = parse12hTime(timeStr)
  if (!parsed) return false
  const minutes = parsed.hours * 60 + parsed.minutes
  const [y, m, d] = (dateStr || todayStr()).split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay()
  if (weekday === 1) return minutes < MONDAY_EMERGENCY_END_MINUTES || minutes >= AFTER_HOURS_CUTOFF_MINUTES
  if (weekday >= 2 && weekday <= 5) return minutes >= AFTER_HOURS_CUTOFF_MINUTES
  if (weekday === 6) return minutes >= SATURDAY_EMERGENCY_CUTOFF_MINUTES
  return true
}

// ist_time_now_str - pinned to Asia/Kolkata for the same reason as Desk:
// a user profile's own timezone must never shift the 5:30 PM cutoff.
export function istTimeNowStr() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(new Date())
  const get = (type) => parts.find((p) => p.type === type).value
  return `${get('hour').padStart(2, '0')}:${get('minute')}:${get('second')} ${get('dayPeriod').toUpperCase()}`
}

// Date field default "Today", in India.
export function todayStr() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  return parts
}

export function flt(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// calculate_billing_totals (patient_visit.js) - same formula as the server.
export function billingTotals({ fee_amount, charity_percent, charity_amount }, adjustment) {
  const adjustmentType = adjustment && adjustment.charity_status === 'Active' ? adjustment.adjustment_type : null
  const rawPercent = ['Charity', 'Increase'].includes(adjustmentType) ? flt(charity_percent) : 0
  const fee = flt(fee_amount)
  const discount = flt(charity_amount) > 0 ? Math.min(flt(charity_amount), fee) : (fee * rawPercent) / 100
  const net = adjustmentType === 'Increase' ? fee + discount : fee - discount
  return { adjustmentType, discount_amount: discount, net_amount: net }
}
