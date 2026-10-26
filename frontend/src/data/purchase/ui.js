// Button styles shared by the purchase screens, matching DocForm's.
export const BTN = {
  primary: 'flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60',
  plain: 'flex h-9 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60',
  danger: 'flex h-9 items-center rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60',
}

// The Vue screen for each purchase doctype (see routes/purchase.js).
export const SCREENS = {
  'Purchase Order': { list: 'PurchaseOrderList', form: 'PurchaseOrderForm' },
  'Purchase Receipt': { list: 'PurchaseReceiptList', form: 'PurchaseReceiptForm' },
  'Quality Inspection': { list: 'QualityInspectionList', form: 'QualityInspectionForm' },
  'Purchase Bill': { list: 'PurchaseBillList', form: 'PurchaseBillForm' },
  'Purchase Return': { list: 'PurchaseReturnList', form: 'PurchaseReturnForm' },
}

export function formRoute(doctype, name, query) {
  return { name: SCREENS[doctype].form, params: { name }, ...(query ? { query } : {}) }
}

// FormField prints a field's Desk description under it; these screens show
// none (agreed UI rule), so fields are handed over without it.
const noHint = new WeakMap()
export function plain(df) {
  if (!df.description) return df
  if (!noHint.has(df)) noHint.set(df, { ...df, description: '' })
  return noHint.get(df)
}
