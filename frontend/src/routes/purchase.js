// Purchase module: order -> receipt -> quality inspection -> bill, and
// returns - a list and a form each ('new' for a new one).
export default [
  { path: '/purchase-order', name: 'PurchaseOrderList', component: () => import('@/pages/Purchase/PurchaseList.vue'), props: { doctype: 'Purchase Order' } },
  { path: '/purchase-order/:name', name: 'PurchaseOrderForm', component: () => import('@/pages/Purchase/PurchaseOrderForm.vue'), props: true },
  { path: '/purchase-receipt', name: 'PurchaseReceiptList', component: () => import('@/pages/Purchase/PurchaseList.vue'), props: { doctype: 'Purchase Receipt' } },
  { path: '/purchase-receipt/:name', name: 'PurchaseReceiptForm', component: () => import('@/pages/Purchase/PurchaseReceiptForm.vue'), props: true },
  { path: '/quality-inspection', name: 'QualityInspectionList', component: () => import('@/pages/Purchase/PurchaseList.vue'), props: { doctype: 'Quality Inspection' } },
  { path: '/quality-inspection/:name', name: 'QualityInspectionForm', component: () => import('@/pages/Purchase/QualityInspectionForm.vue'), props: true },
  { path: '/purchase-bill', name: 'PurchaseBillList', component: () => import('@/pages/Purchase/PurchaseList.vue'), props: { doctype: 'Purchase Bill' } },
  { path: '/purchase-bill/:name', name: 'PurchaseBillForm', component: () => import('@/pages/Purchase/PurchaseBillForm.vue'), props: true },
  { path: '/purchase-return', name: 'PurchaseReturnList', component: () => import('@/pages/Purchase/PurchaseList.vue'), props: { doctype: 'Purchase Return' } },
  { path: '/purchase-return/:name', name: 'PurchaseReturnForm', component: () => import('@/pages/Purchase/PurchaseReturnForm.vue'), props: true },
]
