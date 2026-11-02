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

// Same limits as VITAL_RANGES in nurse_interventions.py: the lowest and
// highest each vital can possibly be, so a typing mistake (height 1000) is
// caught here before the server refuses it.
const VITAL_RANGES = {
  temperature: [90, 110, '°F'],
  pulse: [30, 220, 'beats/min'],
  respiration: [5, 60, '/min'],
  saturation: [50, 100, '%'],
  height: [30, 250, 'cm'],
  weight: [0.5, 300, 'kg'],
}
const SYSTOLIC = [50, 260]
const DIASTOLIC = [30, 160]
const BP = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/

// { fieldname: message } for every filled-in vital that is out of range;
// empty fields are left to the required check.
export function vitalErrors(form) {
  const errors = {}
  for (const [field, [low, high, unit]] of Object.entries(VITAL_RANGES)) {
    const raw = String(form[field] ?? '').trim()
    if (!raw) continue
    const n = Number(raw)
    if (Number.isNaN(n)) errors[field] = 'Enter a number'
    else if (n < low || n > high) errors[field] = `Must be ${low}–${high} ${unit}`
  }
  const bp = String(form.blood_pressure_mmhg ?? '').trim()
  if (bp) {
    const m = bp.match(BP)
    if (!m) errors.blood_pressure_mmhg = 'Enter like 120/80'
    else {
      const [sys, dia] = [Number(m[1]), Number(m[2])]
      if (sys < SYSTOLIC[0] || sys > SYSTOLIC[1]) errors.blood_pressure_mmhg = `Systolic must be ${SYSTOLIC[0]}–${SYSTOLIC[1]}`
      else if (dia < DIASTOLIC[0] || dia > DIASTOLIC[1]) errors.blood_pressure_mmhg = `Diastolic must be ${DIASTOLIC[0]}–${DIASTOLIC[1]}`
      else if (sys <= dia) errors.blood_pressure_mmhg = 'First number must be higher'
    }
  }
  return errors
}

// Usual adult values - a reading outside these only shows an amber note
// (never blocks Save). Children's normal pulse, breathing and BP are
// different, so these notes are skipped below this age.
const NORMAL = {
  temperature: [97, 99.5, '°F'],
  pulse: [60, 100, '/min'],
  respiration: [12, 20, '/min'],
  saturation: [95, 100, '%'],
}
const NORMAL_SYSTOLIC = [90, 139]
const NORMAL_DIASTOLIC = [60, 89]
const ADULT_FROM_AGE = 13

const isAdult = (age) => age === null || age === undefined || age === '' || Number(age) >= ADULT_FROM_AGE

// The grey line under each field: "Normal 97–99.5 °F" (adults only).
export function normalText(field, age) {
  if (!isAdult(age)) return ''
  if (field === 'blood_pressure_mmhg') return `Normal ${NORMAL_SYSTOLIC[0]}–${NORMAL_SYSTOLIC[1]} / ${NORMAL_DIASTOLIC[0]}–${NORMAL_DIASTOLIC[1]}`
  const r = NORMAL[field]
  return r ? `Normal ${r[0]}–${r[1]} ${r[2]}` : ''
}

// { fieldname: 'Above normal' | 'Below normal' } for readings that are
// possible but outside the usual adult values.
export function vitalWarnings(form, age) {
  const out = {}
  if (!isAdult(age)) return out
  for (const [field, [low, high]] of Object.entries(NORMAL)) {
    const raw = String(form[field] ?? '').trim()
    if (!raw || Number.isNaN(Number(raw))) continue
    if (Number(raw) < low) out[field] = 'Below normal'
    else if (Number(raw) > high) out[field] = 'Above normal'
  }
  const m = String(form.blood_pressure_mmhg ?? '').match(BP)
  if (m) {
    const [sys, dia] = [Number(m[1]), Number(m[2])]
    if (sys > NORMAL_SYSTOLIC[1] || dia > NORMAL_DIASTOLIC[1]) out.blood_pressure_mmhg = 'Above normal'
    else if (sys < NORMAL_SYSTOLIC[0] || dia < NORMAL_DIASTOLIC[0]) out.blood_pressure_mmhg = 'Below normal'
  }
  return out
}

// "120/80" <-> the two BP boxes.
export function splitBp(value) {
  const [sys = '', dia = ''] = String(value || '').split('/').map((p) => p.trim())
  return { sys, dia }
}
export function joinBp(sys, dia) {
  const s = String(sys ?? '').trim()
  const d = String(dia ?? '').trim()
  return s && d ? `${s}/${d}` : ''
}
