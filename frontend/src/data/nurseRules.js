// Ports of nurse_interventions.js / nurse_interventions.py. Live previews
// only - the server's validate() recalculates and stores the real values.
import { flt } from '@/data/registrationRules'

// update_bmi_preview / update_bmi
export function bmiFor(heightCm, weightKg) {
  if (!flt(heightCm) || !flt(weightKg)) return { bmi: '', category: '' }
  const m = flt(heightCm) / 100
  const bmi = flt(weightKg) / (m * m)
  let category
  if (bmi < 18.5) category = 'Underweight'
  else if (bmi < 25) category = 'Normal'
  else if (bmi < 30) category = 'Overweight'
  else category = 'Obese'
  return { bmi: bmi.toFixed(1), category }
}

// update_blood_sugar_preview / update_blood_sugar_status (random glucose)
export function sugarStatus(rbg) {
  if (!flt(rbg)) return ''
  const v = flt(rbg)
  if (v < 70) return 'Low'
  if (v < 140) return 'Normal'
  return 'High'
}

// update_anemia_preview / update_anemia_status: Male 13 g/dL, others 12
export function anemiaStatus(hb, gender) {
  if (!flt(hb)) return ''
  return flt(hb) >= (gender === 'Male' ? 13.0 : 12.0) ? 'Normal' : 'Anemic'
}

// STATUS_COLORS in nurse_interventions.js: green = fine, amber = watch,
// red = act - as Tailwind classes.
const GOOD = 'bg-green-50 text-green-800'
const WATCH = 'bg-amber-50 text-amber-900'
const BAD = 'bg-red-50 text-red-800'
export const STATUS_CLASS = {
  Underweight: WATCH,
  Normal: GOOD,
  Overweight: WATCH,
  Obese: BAD,
  Low: WATCH,
  High: BAD,
  Anemic: BAD,
}

// The vitals Desk marks reqd on this doctype.
export const REQUIRED_VITALS = [
  ['temperature', 'Temperature'],
  ['pulse', 'Pulse'],
  ['respiration', 'Respiration'],
  ['saturation', 'Saturation (SpO2)'],
  ['blood_pressure_mmhg', 'Blood Pressure'],
  ['height', 'Height'],
  ['weight', 'Weight'],
]
