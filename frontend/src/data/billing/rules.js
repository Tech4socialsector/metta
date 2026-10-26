// Ports of the Desk client rules for Billing (billing.js) and its server
// recompute (Billing.validate in billing.py). Each function names what it
// mirrors - change both together. The server stays authoritative: every
// figure here is recomputed by validate() on save.
import { flt } from '@/data/registrationRules'

export const BILLING = 'metta.sales.doctype.billing.billing'
export const ADVANCE = 'metta.sales.doctype.patient_advance.patient_advance'
export const DISCHARGE = 'metta.sales.doctype.discharge_bill.discharge_bill'
export const SLE = 'metta.stock.doctype.stock_ledger_entry.stock_ledger_entry'
export const RECEIPT = 'metta.purchase_order.doctype.purchase_receipt.purchase_receipt'

// Select options, copied from the doctype JSON.
export const OPTIONS = {
  bill_type: ['', 'Pharmacy', 'Service', 'Mixed'],
  charity_scope: ['Both', 'Pharmacy', 'Service'],
  payment_mode: ['', 'Cash', 'UPI', 'Card', 'Credit - Corporate'],
  advance_payment_mode: ['Cash', 'UPI', 'Card'],
  return_payment_mode: ['', 'Cash', 'Credit'],
  return_status: ['Draft', 'Submitted', 'Cancelled'],
  return_reason: ['', 'Not Required', 'Discontinued by Doctor', 'Excess Dispensed', 'Adverse Reaction / Allergy', 'Damaged', 'Contaminated'],
}

// Frappe's flt(value, 2) with its default (legacy) rounding: half away from
// zero after trimming float noise at 8 places - the same rounding the server
// applies, so the preview never differs from what gets stored.
export function round2(v) {
  const n = flt(v)
  const r = Math.round(+(Math.abs(n) * 100).toFixed(8)) / 100
  return n < 0 ? -r : r
}

export function nowStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function money(v) {
  return `₹${flt(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Sales Bill Item depends_on / mandatory_depends_on:
// doc.item_type=="Medicine" || doc.item_type=="Consumable"
export function isStockRow(row) {
  return row.item_type === 'Medicine' || row.item_type === 'Consumable'
}

// get_category_adjustment's answer -> the adjustment that actually applies:
// an Inactive category (or one with no type) contributes nothing.
export function adjustmentTypeOf(adjustment) {
  return adjustment && adjustment.charity_status === 'Active' ? adjustment.adjustment_type : null
}

// update_charity_field_labels: an "Increase" is labelled TDS for people.
export function charityLabels(adjustmentType) {
  const inc = adjustmentType === 'Increase'
  return {
    amount: inc ? 'TDS Amount' : 'Charity Amount',
    percent: inc ? 'TDS %' : 'Charity %',
    scope: inc ? 'Apply TDS To' : 'Apply Charity To',
    section: inc ? 'TDS' : 'Charity',
  }
}

// Billing.validate row loop: amount, GST and its CGST/SGST split, net.
export function applyRowAmounts(row) {
  row.amount = round2(flt(row.qty) * flt(row.rate))
  row.gst_amount = round2((row.amount * flt(row.gst_percent)) / 100)
  row.cgst_rate = flt(row.gst_percent) / 2
  row.cgst_amount = round2(row.gst_amount / 2)
  row.sgst_rate = flt(row.gst_percent) / 2
  row.sgst_amount = round2(row.gst_amount / 2)
  row.net_amount = round2(row.amount + row.gst_amount)
}

// calculate_totals (billing.js) / Billing.validate + validate_advance_adjustment.
// state: { adjustment, advanceBalance } - the cached server lookups.
export function calculateTotals(doc, state) {
  if (doc.docstatus !== 0) return
  const adjustmentType = adjustmentTypeOf(state.adjustment)

  let pharmacy = 0
  let service = 0
  for (const row of doc.pharmacy_items || []) {
    applyRowAmounts(row)
    pharmacy += row.net_amount
  }
  for (const row of doc.service_items || []) {
    applyRowAmounts(row)
    service += row.net_amount
  }
  doc.total_pharmacy_amount = round2(pharmacy)
  doc.total_service_amount = round2(service)
  doc.net_amount = round2(doc.total_pharmacy_amount + doc.total_service_amount)

  // Apply Charity To picks which total the charity works against.
  let base = doc.net_amount
  if (doc.charity_scope === 'Pharmacy') base = doc.total_pharmacy_amount
  else if (doc.charity_scope === 'Service') base = doc.total_service_amount

  // A hand-typed amount wins over the percentage, capped at its base, and
  // the percentage is then derived from it - never both stacked.
  if (doc.charity_amount_is_manual) {
    doc.charity_amount = Math.min(flt(doc.charity_amount), base)
    doc.charity_percent = base ? round2((doc.charity_amount / base) * 100) : 0
  } else {
    doc.charity_amount = round2((base * flt(doc.charity_percent)) / 100)
  }
  doc.payable_amount = adjustmentType === 'Increase' ? round2(doc.net_amount + doc.charity_amount) : round2(doc.net_amount - doc.charity_amount)

  autoApplyAdvance(doc, state)
  const previousDue = flt(doc.amount_due)
  const newDue = round2(flt(doc.payable_amount) - flt(doc.advance_adjusted))
  doc.amount_due = newDue
  if (doc.registration_category === 'IP') doc.advance_available = advanceAvailable(doc, state)
  // Amount Collected Now defaults to fully collected; it only follows Amount
  // Due when Amount Due itself changed, so a typed partial payment survives.
  if (newDue !== previousDue) doc.amount_collected = newDue
}

// auto_apply_advance: an IP bill uses the advance up to the Payable Amount,
// unless staff typed their own figure.
function autoApplyAdvance(doc, state) {
  if (doc.docstatus !== 0 || doc.advance_adjusted_is_manual) return
  const hasAdvance = doc.registration_category === 'IP' && doc.patient
  // Balance not fetched yet - leave the current figure until it arrives.
  if (hasAdvance && !state.advanceBalance) return
  const available = hasAdvance ? flt(state.advanceBalance.balance) : 0
  doc.advance_adjusted = round2(Math.max(Math.min(available, flt(doc.payable_amount)), 0))
}

// advance_available_for_bill: what's left once this bill's own share is taken.
export function advanceAvailable(doc, state) {
  const total = state.advanceBalance ? flt(state.advanceBalance.balance) : 0
  return round2(total - flt(doc.advance_adjusted))
}

// set_advance_balance_fields: read-only info, refetched on every load.
export function setAdvanceFields(doc, state) {
  const b = state.advanceBalance
  doc.advance_collected = b ? flt(b.total_collected) : 0
  doc.advance_used = b ? flt(b.total_adjusted) : 0
  doc.advance_available = advanceAvailable(doc, state)
}

// show_advance_low_balance_indicator - message verbatim.
export function lowAdvanceWarning(state) {
  const b = state.advanceBalance
  return b && b.is_low ? `Advance ${Math.round(b.percent_used)}% used — ask the patient's relative to pay more advance.` : ''
}

// ensure_bill_type_includes: widens Bill Type only as far as needed.
export function ensureBillTypeIncludes(doc, kind) {
  const bt = doc.bill_type
  if (bt === kind || bt === 'Mixed') return
  doc.bill_type = bt ? 'Mixed' : kind
}

// Billing's Desk mandatory checks (reqd + mandatory_depends_on), including
// Sales Bill Item rows of the sections Bill Type shows.
export function billingMissing(doc) {
  const m = []
  const empty = (v) => v === null || v === undefined || v === ''
  if (empty(doc.bill_type)) m.push('Bill Type')
  if (empty(doc.sale_datetime)) m.push('Sale Date & Time')
  if (doc.payment_mode === 'Credit - Corporate' && empty(doc.corporate_customer)) m.push('Corporate Customer')
  const tables = []
  if (['Pharmacy', 'Mixed'].includes(doc.bill_type)) tables.push(['pharmacy_items', 'Pharmacy Items'])
  if (['Service', 'Mixed'].includes(doc.bill_type)) tables.push(['service_items', 'Service Items'])
  for (const [field, label] of tables) {
    ;(doc[field] || []).forEach((row, i) => {
      const at = `${label} row ${i + 1}`
      if (empty(row.item)) m.push(`${at}: Item`)
      if (empty(row.qty)) m.push(`${at}: Qty`)
      if (empty(row.rate)) m.push(`${at}: Rate (MRP)`)
      if (isStockRow(row)) {
        if (empty(row.batch_no)) m.push(`${at}: Batch`)
        if (empty(row.uom)) m.push(`${at}: UOM`)
        if (empty(row.conversion_factor)) m.push(`${at}: Conversion Factor`)
      }
    })
  }
  return m
}
