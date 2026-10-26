// Billing module: bills, patient advances, discharge bills and sales
// returns - a list and a form each ('new' for a new one).
export default [
  { path: '/billing', name: 'BillingList', component: () => import('@/pages/Billing/BillingList.vue') },
  { path: '/billing/:name', name: 'BillingForm', component: () => import('@/pages/Billing/BillingForm.vue'), props: true },
  { path: '/patient-advance', name: 'BillingAdvanceList', component: () => import('@/pages/Billing/AdvanceList.vue') },
  { path: '/patient-advance/:name', name: 'BillingAdvanceForm', component: () => import('@/pages/Billing/AdvanceForm.vue'), props: true },
  { path: '/discharge-bill', name: 'BillingDischargeBillList', component: () => import('@/pages/Billing/DischargeBillList.vue') },
  { path: '/discharge-bill/:name', name: 'BillingDischargeBillForm', component: () => import('@/pages/Billing/DischargeBillForm.vue'), props: true },
  { path: '/sales-return', name: 'BillingSalesReturnList', component: () => import('@/pages/Billing/SalesReturnList.vue') },
  { path: '/sales-return/:name', name: 'BillingSalesReturnForm', component: () => import('@/pages/Billing/SalesReturnForm.vue'), props: true },
]
