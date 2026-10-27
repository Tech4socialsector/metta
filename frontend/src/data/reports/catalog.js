// One entry per Desk report (page or script report). Roles are copied from
// each page's / report's own .json "roles" list - the hub only shows a card
// to those roles (System Manager always passes, as in Desk).
export const REPORT_GROUPS = ['Collections & Accounts', 'Purchase', 'Stock', 'Laboratory']

export const REPORTS = [
  { key: 'daily-collection', title: 'Daily Collection Report', group: 'Collections & Accounts', route: 'ReportsDailyCollection', deskPage: 'daily-collection-report', roles: ['Account Staff'], blurb: 'User-wise collections, advances, charity, credit bills and tax for a period.' },
  { key: 'collection-report', title: 'Collection Report', group: 'Collections & Accounts', route: 'ReportsCollectionReport', roles: ['Account Staff'], blurb: 'Per-user gross, charity, card, Gpay, credit, returns and cash.' },
  { key: 'hospital-overview', title: 'Hospital Overview', group: 'Collections & Accounts', route: 'ReportsHospitalOverview', deskPage: 'hospital-overview', roles: [], blurb: 'Clinical, billing and stock snapshot for a date range.' },
  { key: 'date-wise-purchase-order-details', title: 'Date wise Purchase Order Details', group: 'Purchase', route: 'ReportsDateWisePurchaseOrder', deskPage: 'date-wise-purchase-order-details', roles: ['Store Staff', 'Purchase Approver'], blurb: 'Item-level register of Purchase Orders by order date.' },
  { key: 'supplier-wise-purchase', title: 'Supplier Wise Purchase', group: 'Purchase', route: 'ReportsSupplierWisePurchase', deskPage: 'supplier-wise-purchase', roles: ['Store Staff', 'Purchase Approver'], blurb: 'Supplier → Purchase Order → items, with billed status.' },
  { key: 'purchase-return-summary', title: 'Purchase Return Summary', group: 'Purchase', route: 'ReportsPurchaseReturnSummary', deskPage: 'purchase-return-summary', roles: ['Store Staff', 'Purchase Approver', 'Account Staff'], blurb: 'Supplier → return → items, with credit and replacement trace.' },
  { key: 'purchase-analysis', title: 'Purchase Analysis', group: 'Purchase', route: 'ReportsPurchaseAnalysis', deskPage: 'purchase-analysis', roles: ['Store Staff', 'Warehouse Staffs'], blurb: 'Ordered vs received vs billed, per PO item.' },
  { key: 'batch-wise-stock-listing', title: 'Batch-wise Stock Listing', group: 'Stock', route: 'ReportsBatchWiseStock', deskPage: 'batch-wise-stock-listing', roles: ['Store Staff', 'Pharmacy Staff', 'Billing Staff'], blurb: 'On-hand stock by batch as on a date, with expiry status.' },
  { key: 'fsn-analysis', title: 'FSN Analysis', group: 'Stock', route: 'ReportsFsnAnalysis', deskPage: 'fsn-analysis', roles: ['Store Staff', 'Pharmacy Staff'], blurb: 'Fast / slow / non-moving items by outward frequency.' },
  { key: 'material-analysis', title: 'Material Analysis', group: 'Stock', route: 'ReportsMaterialAnalysis', deskPage: 'material-analysis', roles: ['Store Staff', 'Pharmacy Staff', 'Warehouse Staffs'], blurb: 'Item movement registration and Stock Indent position.' },
  { key: 'outletwise-expiry-report', title: 'Outlet-wise Expiry Report', group: 'Stock', route: 'ReportsOutletwiseExpiry', deskPage: 'outletwise-expiry-report', roles: ['Store Staff', 'Pharmacy Staff'], blurb: 'Current batches by outlet, expired and expiring soon.' },
  { key: 'outletwise-stock-transfer', title: 'Outletwise Stock Transfer Summary', group: 'Stock', route: 'ReportsOutletwiseStockTransfer', deskPage: 'outletwise-stock-tra', roles: ['Store Staff', 'Warehouse Staffs'], blurb: 'Stock Transfers by route, dispatched vs confirmed.' },
  { key: 'previous-day-stock-report', title: 'Previous Day Stock Report', group: 'Stock', route: 'ReportsPreviousDayStock', deskPage: 'previous-day-stock-report', roles: ['Store Staff', 'Warehouse Staffs'], blurb: 'Closing stock per item / warehouse / batch as of a date.' },
  { key: 'stock-sale-report', title: 'Stock Sale Report', group: 'Stock', route: 'ReportsStockSale', deskPage: 'stock-sale-report', roles: ['Store Staff', 'Pharmacy Staff', 'Billing Staff'], blurb: 'Sales next to current stock, with days of stock left.' },
  { key: 'stock-ledger', title: 'Stock Ledger', group: 'Stock', route: 'ReportsStockLedger', roles: [], blurb: 'Every Stock Ledger Entry, filtered.' },
  { key: 'lab-test-register', title: 'Lab Test Register', group: 'Laboratory', route: 'ReportsLabTestRegister', roles: ['Lab Staff', 'Lab Verifier'], blurb: 'Every test with its sample, status, turnaround and late flag.' },
  { key: 'lab-workload-summary', title: 'Lab Workload Summary', group: 'Laboratory', route: 'ReportsLabWorkloadSummary', roles: ['Lab Staff', 'Lab Verifier'], blurb: 'Tests by status, late count, average turnaround and income.' },
]

export function reportByRoute(name) {
  return REPORTS.find((r) => r.route === name)
}

// The one primary button every report's filter bar ends with (Desk: Generate).
export const GEN_BTN = 'h-11 whitespace-nowrap rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800'
