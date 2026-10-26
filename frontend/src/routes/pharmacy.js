// Pharmacy module: its home (stock that needs attention) and the Stock
// lookup. No dispense screen: medicines are billed at the Billing counter,
// submitting the bill reduces pharmacy stock, and the patient shows the
// paid print at the pharmacy (user, 2026-10-25). pages/Pharmacy/Dispense.vue
// is kept on disk, unused, in case it is wanted again.
export default [
  { path: '/pharmacy', name: 'PharmacyHome', component: () => import('@/pages/Pharmacy/PharmacyHome.vue') },
  { path: '/stock-lookup', name: 'StockLookup', component: () => import('@/pages/Pharmacy/StockLookup.vue') },
]
