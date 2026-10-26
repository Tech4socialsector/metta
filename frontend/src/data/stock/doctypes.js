// The Pharmacy & Stock doctypes with Vue screens: route name prefix and
// address of each. Routes and sidebar links are both built from this list.
export const STOCK_DOCTYPES = [
  { doctype: 'Stock Indent', key: 'StockIndent', path: 'stock-indent' },
  { doctype: 'Stock Transfer', key: 'StockTransfer', path: 'stock-transfer' },
  { doctype: 'Material Issue', key: 'MaterialIssue', path: 'material-issue' },
  { doctype: 'Stock Reconciliation', key: 'StockReconciliation', path: 'stock-reconciliation' },
  { doctype: 'Stock Adjustment', key: 'StockAdjustment', path: 'stock-adjustment' },
  { doctype: 'Item', key: 'Item', path: 'item' },
  { doctype: 'Service Rate List', key: 'ServiceRateList', path: 'service-rate-list' },
  { doctype: 'Category Price Adjustment', key: 'CategoryPriceAdjustment', path: 'category-price-adjustment' },
]

// Route names all start with "Stock" so they never clash with other modules.
export const listName = (d) => (d.key.startsWith('Stock') ? `${d.key}List` : `Stock${d.key}List`)
export const formName = (d) => (d.key.startsWith('Stock') ? `${d.key}Form` : `Stock${d.key}Form`)
