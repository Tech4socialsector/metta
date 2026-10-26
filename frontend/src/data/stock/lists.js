// Status tabs above each stock list - the work waiting comes first.
const byDocstatus = [
  { label: 'Draft', filters: [['docstatus', '=', 0]] },
  { label: 'Submitted', filters: [['docstatus', '=', 1]] },
  { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
  { label: 'All', filters: [] },
]

export const LIST_TABS = {
  'Stock Indent': [
    { label: 'Draft', filters: [['status', '=', 'Draft']] },
    { label: 'Submitted', filters: [['status', '=', 'Submitted']] },
    { label: 'Partially Issued', filters: [['status', '=', 'Partially Issued']] },
    { label: 'Issued', filters: [['status', '=', 'Issued']] },
    { label: 'All', filters: [] },
  ],
  'Stock Transfer': [
    { label: 'Draft', filters: [['docstatus', '=', 0]] },
    { label: 'Dispatched', filters: [['status', '=', 'Dispatched']] },
    { label: 'Confirmed', filters: [['status', '=', 'Confirmed']] },
    { label: 'All', filters: [] },
  ],
  'Material Issue': byDocstatus,
  'Stock Adjustment': byDocstatus,
  'Stock Reconciliation': byDocstatus,
  Item: [
    { label: 'Active', filters: [['is_active', '=', 1]] },
    { label: 'All', filters: [] },
  ],
}
