// Purchase doctypes open in their own Vue screens (sidebar, lists, links)
// instead of Desk.
const entry = (list, form) => ({
  list: { name: list },
  view: (name) => ({ name: form, params: { name } }),
  create: { name: form, params: { name: 'new' } },
})

export default {
  'Purchase Order': entry('PurchaseOrderList', 'PurchaseOrderForm'),
  'Purchase Receipt': entry('PurchaseReceiptList', 'PurchaseReceiptForm'),
  'Quality Inspection': entry('QualityInspectionList', 'QualityInspectionForm'),
  'Purchase Bill': entry('PurchaseBillList', 'PurchaseBillForm'),
  'Purchase Return': entry('PurchaseReturnList', 'PurchaseReturnForm'),
}
