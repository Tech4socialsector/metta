// The Desk workspaces, rebuilt as Vue sections: same items, same roles
// (metta/*/workspace/*.json). Each item opens in Vue when it is ready there,
// otherwise in Desk until its own screen is built.
//
// form: a doctype (its list). page: a Desk page or report.
import { CUSTOM } from '@/data/formMenu'

// Forms whose Desk script has real logic - they open in Desk until each
// gets its own Vue screen (see frontend/PARITY.md).
export const DESK_ONLY = new Set([
  'Billing',
  'Purchase Order',
  'Purchase Receipt',
  'Purchase Bill',
  'Purchase Return',
  'Stock Indent',
  'Stock Transfer',
  'Quality Inspection',
  'Sales Return',
  'Stock Reconciliation',
  'Appointment',
  'Item',
  'Service Rate List',
  'Material Issue',
  'Patient Advance',
  'Discharge Summary',
  'Category Price Adjustment',
  'Stock Adjustment',
])

const f = (doctype) => ({ kind: 'form', doctype })
const p = (page, label) => ({ kind: 'page', page, label })

export const SECTIONS = [
  {
    key: 'billing',
    label: 'Billing',
    icon: 'receipt-text',
    roles: ['Billing Staff'],
    items: [f('Billing'), f('Sales Return'), f('Patient Advance'), f('Doctor Consultation')],
  },
  {
    key: 'pharmacy',
    label: 'Pharmacy',
    icon: 'pill',
    roles: ['Pharmacy Staff'],
    // Bills and returns are made at the Billing counter; the patient brings
    // the receipt here, so the pharmacy keeps only medicines and stock.
    // Items and warehouses are created by the admin (Masters), and the
    // pharmacy doesn't work with consultations - so none of those here.
    items: [
      f('Stock Indent'),
      f('Batch'),
      f('Stock Balance'),
      f('Stock Ledger Entry'),
    ],
  },
  {
    key: 'lab',
    label: 'Lab',
    icon: 'flask-conical',
    roles: ['Lab Staff', 'Lab Verifier'],
    items: [f('Diagnostic Test')],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    icon: 'shopping-cart',
    roles: ['Purchase Approver'],
    items: [f('Purchase Order'), f('Purchase Receipt'), f('Purchase Bill')],
  },
  {
    key: 'store',
    label: 'Store',
    icon: 'package',
    // Store and purchase are one place (user, 2026-10-25): a Purchase
    // Approver opens Store too, and only sees the forms their role allows
    // (SectionPage hides any form the user can't open).
    roles: ['Store Staff', 'Purchase Approver'],
    items: [
      f('Purchase Order'),
      f('Purchase Receipt'),
      f('Quality Inspection'),
      f('Purchase Bill'),
      f('Purchase Return'),
      f('Stock Indent'),
      f('Stock Transfer'),
      f('Material Issue'),
      f('Stock Adjustment'),
      f('Stock Reconciliation'),
      // No Billing / Sales Return here: both are done at the Billing desk only.
      f('Item'),
      f('Batch'),
      f('Stock Ledger Entry'),
    ],
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    icon: 'warehouse',
    roles: ['Warehouse Staffs'],
    items: [f('Stock Indent'), f('Stock Transfer'), f('Stock Ledger Entry')],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: 'wallet',
    roles: ['Account Staff'],
    items: [
      f('Billing'),
      f('Purchase Bill'),
      f('Payment Entry'),
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'chart-column',
    roles: [],
    items: [p('reports', 'All Reports'), p('hospital-overview', 'Hospital Overview'), p('stock-ledger', 'Stock Ledger')],
  },
  {
    key: 'masters',
    label: 'Masters',
    icon: 'settings-2',
    roles: [],
    items: [
      f('Department'),
      f('Doctor Master'),
      f('Registration type Master'),
      f('Category Price Adjustment'),
      f('Corporate Customer'),
      f('Ward Master'),
      f('Room Master'),
      f('Service Rate List'),
      f('Item'),
      f('Item Group'),
      f('Item Category'),
      f('Item Sub Category'),
      f('Item Classification'),
      f('HSN Master'),
      f('Chemical Composition'),
      f('Chemical Term'),
      f('Unit of Measure'),
      f('Supplier'),
      f('Warehouse'),
    ],
  },
]

const slug = (s) => s.toLowerCase().replace(/\s+/g, '-')

// Report pages rebuilt in Vue register here from src/data/reportPages/*.js
// (default export: { 'desk-page-name': routeLocation }).
const VUE_PAGES = Object.values(import.meta.glob('./reportPages/*.js', { eager: true })).reduce((all, m) => ({ ...all, ...(m.default || {}) }), {})

// Where an item opens: its Vue screen when one exists, otherwise Desk for
// forms with Desk-only logic, otherwise the generic Vue form.
export function itemTarget(item) {
  if (item.kind === 'page') return VUE_PAGES[item.page] ? { to: VUE_PAGES[item.page] } : { href: `/desk/${item.page}` }
  if (CUSTOM[item.doctype]?.list) return { to: CUSTOM[item.doctype].list }
  if (DESK_ONLY.has(item.doctype) && !CUSTOM[item.doctype]) return { href: `/desk/${slug(item.doctype)}` }
  return { to: { name: 'DocList', params: { doctype: item.doctype } } }
}

export function itemLabel(item) {
  return item.kind === 'page' ? item.label : item.doctype
}

// An icon per form/report, so the cards on a section page can be told
// apart at a glance (anything not listed falls back to its group's icon).
const ITEM_ICONS = {
  Billing: 'receipt-text',
  'Sales Return': 'undo-2',
  'Patient Advance': 'wallet',
  'Doctor Consultation': 'stethoscope',
  'Doctor Master': 'user-round',
  Department: 'building-2',
  'Diagnostic Test': 'flask-conical',
  Item: 'pill',
  Batch: 'layers',
  'Stock Balance': 'boxes',
  'Stock Ledger Entry': 'book-open-check',
  Warehouse: 'warehouse',
  'Stock Indent': 'clipboard-list',
  'Stock Transfer': 'arrow-left-right',
  'Material Issue': 'package-minus',
  'Stock Adjustment': 'sliders-horizontal',
  'Stock Reconciliation': 'scale',
  'Purchase Order': 'shopping-cart',
  'Purchase Receipt': 'truck',
  'Quality Inspection': 'badge-check',
  'Purchase Bill': 'file-text',
  'Purchase Return': 'package-x',
  'Payment Entry': 'credit-card',
  Supplier: 'factory',
  'Corporate Customer': 'building-2',
  'Category Price Adjustment': 'tags',
  'Service Rate List': 'list-ordered',
  'Registration type Master': 'hash',
  'Item Group': 'folder-tree',
  'Item Category': 'folder-tree',
  'Item Sub Category': 'folder-tree',
  'Item Classification': 'folder-tree',
  'Chemical Composition': 'atom',
  'Chemical Term': 'atom',
  'HSN Master': 'hash',
  'Unit of Measure': 'ruler',
  'Ward Master': 'bed-double',
  'Room Master': 'door-open',
  'daily-collection-report': 'banknote',
  'collection-report': 'hand-coins',
  'hospital-overview': 'layout-dashboard',
  'outletwise-expiry-report': 'hourglass',
  'previous-day-stock-report': 'calendar-clock',
  'purchase-analysis': 'trending-up',
  'stock-sale-report': 'chart-line',
  reports: 'scroll-text',
}

export function itemIcon(item) {
  return ITEM_ICONS[item.kind === 'page' ? item.page : item.doctype]
}
