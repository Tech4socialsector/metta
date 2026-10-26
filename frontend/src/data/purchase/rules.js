// Ports of the Desk client-script rules for the purchase forms
// (metta/purchase_order/doctype/*/*.js). Each function names the Desk
// function it mirrors - change both together. The server's validate()
// recomputes all of this on save, so these are live previews.
import { todayStr } from '@/data/registrationRules'

// Server methods, the same paths the Desk forms call.
export const PO = 'metta.purchase_order.doctype.purchase_order.purchase_order'
export const PR = 'metta.purchase_order.doctype.purchase_receipt.purchase_receipt'
export const QI = 'metta.purchase_order.doctype.quality_inspection.quality_inspection'
export const PB = 'metta.purchase_order.doctype.purchase_bill.purchase_bill'
export const PRET = 'metta.purchase_order.doctype.purchase_return.purchase_return'

// "50 Strip × 10 Tablet = 500 Tablet" - same as purchase_order.js
// pack_sentence(). Pack is a Unit of Measure; a pack that is the unit
// itself (Tablet × 1) needs no multiplication.
export function packSentence(pack, perPack, packs, uom) {
  if (!pack || !perPack || !packs) return ''
  const unit = uom || 'units'
  if (perPack === 1 || pack === uom) return `${packs * perPack} ${unit}`
  return `${packs} ${pack} × ${perPack} ${unit} = ${packs * perPack} ${unit}`
}
export const VUE = 'metta.vue.purchase'

// Every form's setup(): frm.set_query("item", "items", ...) - services are
// never bought or stocked, so only physical, active items are offered.
export const ITEM_FILTER = { item_type: ['in', ['Medicine', 'Consumable']], is_active: 1 }

// Python's round(): half to even. purchase_bill.py rounds Net Amount with
// it, so the preview has to as well or a saved bill reloads as "changed".
export function pyRound(n) {
  const r = Math.round(n)
  return Math.abs(n % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

// Frappe's server flt(value, precision), in the site's own rounding method
// (System Settings; loaded by loadRoundingMethod()). Matching it digit for
// digit keeps these previews equal to what validate() stores, so a saved
// bill doesn't reload as "changed".
let roundingMethod = "Banker's Rounding (legacy)"

let roundingLoad = null
export function loadRoundingMethod(call) {
  if (!roundingLoad) {
    roundingLoad = call(`${VUE}.get_rounding_method`)
      .then((m) => (roundingMethod = m || roundingMethod))
      .catch(() => (roundingLoad = null))
  }
  return roundingLoad
}

export function flt(v, precision) {
  let num = parseFloat(typeof v === 'string' ? v.replace(/,/g, '') : v)
  if (!Number.isFinite(num)) num = 0
  if (precision === undefined || precision === null) return num
  return rounded(num, precision)
}

// frappe.utils.data.rounded() and its three methods.
function rounded(num, precision) {
  const m = Math.pow(10, precision)
  if (roundingMethod === 'Commercial Rounding') {
    if (num === 0) return 0
    const eps = Math.pow(2, Math.log2(Math.abs(num)) - 52)
    // toFixed rounds the float's exact decimal value, as Python's round() does.
    return +(num + Math.sign(num) * eps).toFixed(precision)
  }
  if (roundingMethod === "Banker's Rounding") {
    const n = +(num * m).toFixed(12)
    if (n === 0) return 0
    const floor = Math.floor(n)
    const eps = Math.pow(2, Math.log2(Math.abs(n)) - 52)
    return (Math.abs(n - floor - 0.5) < eps ? (floor % 2 === 0 ? floor : floor + 1) : pyRound(n)) / m
  }
  // "Banker's Rounding (legacy)"
  let n = +(precision ? num * m : num).toFixed(8)
  const floor = Math.floor(n)
  const dec = n - floor
  if (!precision && dec === 0.5) n = floor % 2 === 0 ? floor : floor + 1
  else if (dec === 0.5) n = floor + 1
  else n = pyRound(n)
  return precision ? n / m : n
}

export function cint(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

// "Has any row got an item?" - the Get Items buttons hide once real rows
// exist, so pulling again can't wipe work already done.
export function hasRealItems(doc) {
  return (doc.items || []).some((row) => row.item)
}

// expected_delivery / required_by handlers: today is fine, the past is not.
export function isPastDate(d) {
  return !!d && d < todayStr()
}

// --- Purchase Order (purchase_order.js) ---

// calculate_qty_ordered + calculate_amount
export function poRow(row) {
  row.qty_ordered = flt(row.packing) * flt(row.no_of_unit)
  row.amount = flt(row.qty_ordered) * flt(row.rate)
}

// calculate_total
export function poTotal(doc) {
  doc.total_amount = (doc.items || []).reduce((sum, row) => sum + flt(row.amount), 0)
}

// --- Purchase Receipt (purchase_receipt.js) ---

// calculate_qty_received
export function prRow(row) {
  row.qty_received = flt(row.packing) * flt(row.no_of_unit)
  // Same as the server's validate(): Stock Qty follows Qty Received even in draft.
  row.stock_qty = row.qty_received
}

// --- Quality Inspection (quality_inspection.js) ---

// qty_accepted / qty_rejected handlers: whichever was typed drives the other.
export function qiFromAccepted(row) {
  if (!row.qty_delivered) return
  row.qty_rejected = Math.max(0, flt(row.qty_delivered) - flt(row.qty_accepted))
}
export function qiFromRejected(row) {
  if (!row.qty_delivered) return
  row.qty_accepted = Math.max(0, flt(row.qty_delivered) - flt(row.qty_rejected))
}

// --- Purchase Bill (purchase_bill.js) ---

// calculate_amount - rounded at every step exactly as Desk and the server
// do, so a saved bill doesn't look edited again.
export function billRow(row) {
  const qty = flt(row.packing) * flt(row.no_of_unit)
  row.qty = qty

  // Taxable Amount is typed from the invoice; P Rate is worked back from it.
  // Free is extra on top of No. of Packs (added to stock at approval), so it
  // never reduces the divisor - same as purchase_bill.py / .js now.
  const billableQty = qty
  const amount = flt(row.amount)
  const purchaseRate = billableQty ? flt(amount / billableQty, 2) : 0

  const discount = flt((amount * flt(row.discount_percent)) / 100, 2)

  // GST is on the amount net of discount, as on the supplier invoice.
  const taxable = amount - discount
  const gstAmount = flt((taxable * flt(row.gst_percent)) / 100, 2)
  const cgstAmount = flt(gstAmount / 2, 2)
  const sgstAmount = flt(gstAmount / 2, 2)
  const igstAmount = flt(row.igst_amount) // inter-state not wired up yet

  // Landed cost per tablet/unit, net of discount, including GST.
  const discountPerUnit = qty ? discount / qty : 0
  const netRate = purchaseRate - discountPerUnit
  row.purchase_rate = purchaseRate
  row.discount = discount
  row.purchase_cost = flt(netRate * (1 + flt(row.gst_percent) / 100), 2)
  row.gst_amount = gstAmount
  row.cgst_rate = flt(row.gst_percent) / 2
  row.cgst_amount = cgstAmount
  row.sgst_rate = flt(row.gst_percent) / 2
  row.sgst_amount = sgstAmount
  row.total_amount = flt(taxable + cgstAmount + sgstAmount + igstAmount, 2)

  // MRP is tax-inclusive by law, so GST is taken out of the pack MRP, then
  // split per tablet; GST added back at sale lands exactly on MRP.
  row.selling_gst_percent = flt(row.gst_percent)
  const packSellingPrice = flt(row.packing_mrp) / (1 + flt(row.gst_percent) / 100)
  const single = flt(row.packing) ? flt(packSellingPrice / flt(row.packing), 2) : 0
  const sellingGst = flt((single * flt(row.gst_percent)) / 100, 2)
  row.single_tablet_price = single
  row.selling_gst_amount = sellingGst
  row.selling_cgst_amount = flt(sellingGst / 2, 2)
  row.selling_sgst_amount = flt(sellingGst / 2, 2)
  row.final_selling_price = flt(single + sellingGst, 2)
}

// calculate_totals
export function billTotals(doc) {
  let subtotal = 0
  let discount = 0
  let gst = 0
  for (const row of doc.items || []) {
    subtotal += flt(row.amount)
    discount += flt(row.discount)
    gst += flt(row.gst_amount)
  }
  doc.subtotal = flt(subtotal, 2)
  doc.discount = flt(discount, 2)
  doc.gst_amount = flt(gst, 2)
  const net = flt(doc.subtotal - doc.discount + doc.gst_amount, 2)
  doc.round_off = flt(pyRound(net) - net, 2)
  doc.total_amount = flt(net + doc.round_off, 2)
}

// The row fields whose change reruns calculate_amount in Desk.
export const BILL_ROW_TRIGGERS = ['packing', 'no_of_unit', 'free', 'amount', 'discount_percent', 'gst_percent', 'packing_mrp']

// --- Purchase Return (purchase_return.js) ---

// calculate_amount
export function retAmount(row) {
  row.amount = flt(row.qty_returned) * flt(row.rate)
}
// calculate_stock_qty
export function retStockQty(row) {
  row.stock_qty = flt(row.qty_returned) * (flt(row.conversion_factor) || 1)
}
// calculate_total
export function retTotal(doc) {
  doc.total_credit_amount = (doc.items || []).reduce((sum, row) => sum + flt(row.amount), 0)
}
