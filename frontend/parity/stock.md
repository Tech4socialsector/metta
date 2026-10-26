# Pharmacy & Stock — Desk ↔ Vue parity

Legend: ✅ ported · ➖ not shown in Desk either (hidden / set by the system) · ⏳ not ported (reason given)

## How it is built

All eight doctypes share one screen: `src/components/stock/StockForm.vue` (a copy of the
generic `DocForm.vue` layout, save bar, Submit / Cancel / Delete) plus each doctype's Desk
client script ported in `src/data/stock/rules.js`. The two screens are:

| Route | Screen |
|---|---|
| `/hmis/<doctype-slug>` (e.g. `/hmis/stock-indent`) | `StockListPage.vue`: list with status tabs (`src/data/stock/lists.js`) |
| `/hmis/<doctype-slug>/<name>` (`new` for a new record) | `StockFormPage.vue` → `StockForm.vue` |

Route names: `StockIndentList/Form`, `StockTransferList/Form`, `StockMaterialIssueList/Form`,
`StockReconciliationList/Form`, `StockAdjustmentList/Form`, `StockItemList/Form`,
`StockServiceRateListList/Form`, `StockCategoryPriceAdjustmentList/Form`.
`src/data/customScreens/stock.js` registers them, so the sidebar sections (Pharmacy, Store,
Warehouse, Stock & Pharmacy, Masters) and the generic engine open them instead of Desk.

What every form gets from the engine (same as Desk):
reqd, depends_on, mandatory_depends_on, read_only, read_only_depends_on, fetch_from /
fetch_if_empty (parent and child rows), defaults ("Today", "Now", `__user`, Select first
option), allow_on_submit after submit, collapsible sections, child tables, Submit / Cancel /
Amend / Delete by `metta.api.get_doc_permissions`, Print (`/printview`), Ctrl+S, unsaved-change guard.
A required field is only ever required while it is visible, and every missing one is listed
by name before saving.

Server behaviour (validate, on_submit, on_cancel, on_update) runs unchanged: the screens save
through `frappe.client.insert / save / submit / cancel` and Desk's `run_doc_method`.
No new server method was needed (`metta/vue/stock.py` not created).

Engine-level differences, all forms:
- Child tables: rows are edited in a dialog (as `ChildTableEditor`); number columns shown in the
  grid are typed straight into the grid. Rows can't be added/removed after submit, as in Desk.
- `frappe.msgprint` / `frappe.confirm` / `frappe.prompt` → in-page dialogs with the same text;
  `frappe.show_alert` → a green note above the form.
- Server errors from a button or a field handler show in a "Message" dialog, the Desk way.

## Stock Indent (`stock_indent.js`, `stock_indent.py`)

| Field / rule | Status | Notes |
|---|---|---|
| requesting_warehouse (reqd) | ✅ | picker excludes Central Store (`onload` set_query); server check unchanged |
| requested_by (reqd) | ✅ | set to the user on a new indent (`refresh`) |
| request_date_time (reqd, Now) | ✅ | |
| required_by (reqd) | ✅ | past date → "Invalid Required By Date" / "Required By cannot be a date in the past. Please pick today or a later date." and cleared |
| required_by calendar min date | ⏳ | Desk's own comment calls it best-effort; the change check above is what enforces it |
| priority, status, remark | ✅ | status stays a plain editable Select, as in Desk |
| item_search_area (HTML "Add Item") | ✅ | `IndentItemSearch.vue`: Product Name search (`search_items_for_indent`), Name / Avail. Qty (red at 0) / Manufacturer / Rack/Shelf, "Selected: name (code)", Req. Qty, Add |
| Add messages | ✅ | "Please search and select an item first." / "Please enter a Req. Qty greater than 0." (inline under the widget instead of a popup) |
| Blank starter row removed on first Add | ✅ | |
| Warehouse change re-runs the search | ✅ | |
| items (reqd) | ✅ | |
| Item row: item → item_name, unit_of_measure | ✅ | also fetch_from |
| item_name, stock_at_requesting_store, usable_stock_at_central, qty_issued, qty_pending (read only) | ✅ | |
| Status refresh from Stock Transfer | ✅ | server (`refresh_issuing_status`) |
| "Stock Indent Submitted" notification | ✅ | server fixture, fires on status change |
| Widget hidden for read-only users (Store Staff) | — | deliberate: Desk shows it but their save would be refused |

## Stock Transfer (`stock_transfer.js`, `stock_transfer.py`) — submittable

| Field / rule | Status | Notes |
|---|---|---|
| against_indent | ✅ | shown while no against_transfer |
| against_indent change → to_warehouse = indent's requesting warehouse; from_warehouse = first Central Store if empty | ✅ | |
| against_transfer (read only) | ✅ | shown while no against_indent |
| from_warehouse, to_warehouse (reqd) | ✅ | "cannot be the same" is the server's check |
| dispatch_date_time (Date, reqd, "Now") | ✅ | today |
| issued_by (reqd) | ✅ | set to the user on a new transfer |
| items (reqd); item picker = Medicine/Consumable, active | ✅ | |
| Row item → item_name, latest batch (`get_latest_batch_for_item`); cleared item → clears name and batch | ✅ | batch → expiry_date by fetch_from |
| Row qty_dispatched → qty_confirmed (draft only) | ✅ | |
| qty_confirmed editable after submit (allow_on_submit) | ✅ | typed in the grid; save button reads "Update" |
| unit_of_measure (fetch_from), qty_requested, available_qty, indent_row_reference | ✅ | |
| confirmation_date_time, confirmed_by, has_discrepancy, discrepancy_status, resolved_by, resolution_date, status, shortfall_notice_sent, amended_from | ✅ | read only, set by the server |
| Button "Get Items From Stock Indent" (draft, indent set, no real rows) | ✅ | "Please set From Warehouse first, so Available Qty can be checked against it." / "Nothing pending to issue on this Stock Indent." / "{n} item(s) pulled in - fill in Batch No for each before submitting." |
| Button "Confirm Receipt" (Dispatched) | ✅ | same confirm text; sends the form as it stands (like `frm.call`), so unsaved Qty Confirmed counts |
| Button "Create Return Transfer" (Confirmed) | ✅ | "Nothing was actually received on this transfer to return."; opens a new transfer with from/to/against_transfer and rows, and the "{n} item(s) pulled in - fill in Batch No, and change To Warehouse…" note |
| "Notify Requesting Warehouse", "Resolve Discrepancy" | ➖ | commented out in Desk ("Temporarily hidden") |
| Submit → dispatch ledger, indent qty / status; Cancel → reversal | ✅ | server |

## Material Issue (`material_issue.js`, `material_issue.py`) — submittable

| Field / rule | Status | Notes |
|---|---|---|
| warehouse (reqd), patient, visit_reference, issue_date_time (reqd, Now), purpose | ✅ | |
| issued_by (reqd, read only) | ✅ | set to the user on a new issue |
| items (reqd); item picker = Medicine/Consumable, active | ✅ | |
| Row item → item_name | ✅ | |
| Row batch_no (reqd), qty (reqd) | ✅ | batch picker unfiltered, as in Desk |
| amended_from | ✅ | read only |
| Submit → stock check + ledger; Cancel → reversal | ✅ | server |

## Stock Reconciliation (`stock_reconciliation.js`, `stock_reconciliation.py`) — submittable

| Field / rule | Status | Notes |
|---|---|---|
| warehouse (reqd), reconciliation_date (reqd, Today), counted_by (reqd), approved_by, status (reqd, Draft), amended_from | ✅ | |
| items (reqd); item picker = Medicine/Consumable, active | ✅ | |
| Row batch picker limited to the row's item | ✅ | |
| Row item → system qty (`get_current_stock_qty`, needs warehouse), difference, clears batch, item_name, single batch auto-filled (`get_batches_for_item`) | ✅ | |
| Row physical_qty → difference | ✅ | |
| Row reason: shown and required when difference ≠ 0 | ✅ | |
| system_qty, difference (read only) | ✅ | |
| Submit recomputes qty, demands reason, posts ledger, status; Cancel reverses | ✅ | server |

## Stock Adjustment (`stock_adjustment.js`, `stock_adjustment.py`) — submittable

| Field / rule | Status | Notes |
|---|---|---|
| warehouse, item (Medicine/Consumable, active), batch_no, qty, reason, adjustment_date_time (Now) — all reqd | ✅ | |
| item_name (fetch_from, read only), remarks, amended_from | ✅ | |
| adjusted_by (reqd, read only) | ✅ | set to the user on a new adjustment |
| Submit → stock check + write-off; Cancel → reversal | ✅ | server |

## Item (`item.js`, `item.py`)

| Field / rule | Status | Notes |
|---|---|---|
| item_name (reqd), is_active, description | ✅ | |
| standard_selling_rate "Service Rate" (Service only, editable only while new) | ✅ | |
| item_group | ✅ | change → clears category, sets item_type (Pharmacy Store → Medicine, General Store → Consumable, Service → Service) |
| category | ✅ | picker limited to the selected group |
| item_type | ➖ | hidden in Desk; set live and by the server |
| item_type change → clears fields of the other sections; clears Reorder Levels unless Medicine/Consumable | ✅ | |
| sub_category, classification (not for Service) | ✅ | |
| chemical_composition (Medicine) | ✅ | |
| Stock & Pricing section (Medicine/Consumable): unit_of_measure, has_batch, has_expiry, rack_location, reorder_levels | ✅ | |
| standard_purchase_rate, gst_percent | ➖ | hidden in Desk (gst_percent still fetched from HSN) |
| purchase_price_history (read only) | ✅ | |
| Medicine Details: manufacturer, hsn_code | ✅ | |
| Service Details: department, is_taxable | ✅ | |
| Service Rate List auto-created on save, item_type / batch flags on save | ✅ | server |

## Service Rate List (`service_rate_list.js`, `service_rate_list.py`)

| Field / rule | Status | Notes |
|---|---|---|
| item (reqd, unique; Service items, active) | ✅ | |
| item_name (fetch_from) | ✅ | |
| current_rate, start_date (reqd; editable only while new; start_date Today) | ✅ | |
| end_date (read only) | ✅ | |
| Rate History (collapsible, read only table) | ✅ | |
| Button "Update Rate" → New Rate, Start Date (today) → Update (`update_rate`) → reload | ✅ | |
| "Update Rate" shown to read-only users | — | deliberate: shown only to users who can write, since `update_rate` refuses the rest |
| Service-only check, Item rate sync | ✅ | server |

## Category Price Adjustment (`category_price_adjustment.js`, `.py`)

| Field / rule | Status | Notes |
|---|---|---|
| Name (autoname: prompt) | ✅ | "Name" asked on a new record, as Desk does |
| adjustment_type, charity_status | ✅ | |
| charity_percent | ✅ | label "TDS Percent" when Adjustment Type is Increase, else "Charity Percent" |
| Not negative / not above 100% for Charity | ✅ | server |

## Batch, Stock Balance, Stock Ledger Entry, Warehouse

Unchanged: the generic Vue form already covers them (Batch's item filter is in
`formEngine.js`; the other three have no Desk script).

## Deliberate differences (summary)

1. Stock Indent's item search is hidden from users who can't edit the indent.
2. Service Rate List's "Update Rate" is shown only to users who can write.
3. Stock Indent's Add messages show under the widget, not in a popup.
4. Status badge: a draft or cancelled transfer/reconciliation shows Draft / Cancelled, even when
   an amended copy still carries the cancelled original's Status value (Desk copies it as-is).
5. Lists open on a status tab (Draft first) instead of Desk's unfiltered list; "All" is one tab away.
