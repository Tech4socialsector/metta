// Billing doctypes open in their own Vue screens (sidebar, lists, links)
// instead of Desk.
const entry = (list, form) => ({
  list: { name: list },
  view: (name) => ({ name: form, params: { name } }),
  create: { name: form, params: { name: 'new' } },
})

export default {
  Billing: entry('BillingList', 'BillingForm'),
  'Patient Advance': entry('BillingAdvanceList', 'BillingAdvanceForm'),
  'Discharge Bill': entry('BillingDischargeBillList', 'BillingDischargeBillForm'),
  'Sales Return': entry('BillingSalesReturnList', 'BillingSalesReturnForm'),
}
