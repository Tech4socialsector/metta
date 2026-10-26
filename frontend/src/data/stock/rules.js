// Ports of the Desk client scripts for the Pharmacy & Stock forms. Each
// handler names the Desk handler it mirrors - change both together. The
// server's validate()/on_submit() stay authoritative; they run on every
// save/submit from these screens exactly as from Desk.
//
// Shape of one doctype's rules (all optional):
//   filters:      { field: filters | (doc) => filters }        frm.set_query(field)
//   childFilters: { table: { field: filters | (row, doc) => filters } }  frm.set_query(field, table)
//   onNew(ctx)                                                  refresh() on a new doc
//   change:       { field(ctx, value) }                         frappe.ui.form.on(doctype, field)
//   rowChange:    { table: { field(ctx, row, value) } }         frappe.ui.form.on(child, field)
//   label(df, doc) -> label                                     frm.set_df_property(.., 'label')
//   actions(ctx) -> [{ label, primary, run }]                   frm.add_custom_button
//   widgets:      { table: 'ComponentKey' }                     HTML field rendered above a table
import { call } from 'frappe-ui'
import { session } from '@/data/session'
import { todayStr, flt } from '@/data/registrationRules'

const ST = 'metta.stock.doctype.stock_transfer.stock_transfer'
const SR = 'metta.stock.doctype.stock_reconciliation.stock_reconciliation'

// Stock movements only ever concern physical stock - never a Service.
const STOCK_ITEM = { item_type: ['in', ['Medicine', 'Consumable']], is_active: 1 }

function setUserIfEmpty(field) {
  return (ctx) => {
    if (!ctx.doc[field]) ctx.set(field, session.user)
  }
}

function itemNameFetcher(extra = []) {
  // The Item picked fills the row's item_name (and any extra Item fields).
  return async (ctx, row) => {
    if (!row.item) {
      ctx.setRow(row, 'item_name', '')
      for (const f of extra) ctx.setRow(row, f, '')
      return
    }
    const r = (await call('frappe.client.get_value', { doctype: 'Item', filters: row.item, fieldname: ['item_name', ...extra] })) || {}
    ctx.setRow(row, 'item_name', r.item_name || '')
    for (const f of extra) ctx.setRow(row, f, r[f] || '')
  }
}

export const RULES = {
  // stock_indent.js
  'Stock Indent': {
    // onload: Central Store fulfils indents, it never raises one.
    filters: { requesting_warehouse: { warehouse_type: ['!=', 'Central Store'] } },
    onNew: setUserIfEmpty('requested_by'),
    change: {
      // required_by: instant check; validate_required_by() is the real gate.
      required_by(ctx, v) {
        if (v && v < todayStr()) {
          ctx.msgprint('Required By cannot be a date in the past. Please pick today or a later date.', 'Invalid Required By Date')
          ctx.set('required_by', '')
        }
      },
      // requesting_warehouse: the search widget re-runs itself (it watches it).
    },
    rowChange: {
      // Stock Indent Item.item - for rows added with "+ Add row".
      items: { item: itemNameFetcher(['unit_of_measure']) },
    },
    widgets: { items: 'IndentItemSearch' },
  },

  // stock_transfer.js
  'Stock Transfer': {
    childFilters: { items: { item: STOCK_ITEM } },
    onNew: setUserIfEmpty('issued_by'),
    change: {
      // against_indent: send to the requesting ward, from Central Store.
      async against_indent(ctx, v) {
        if (!v) return
        const r = await call('frappe.client.get_value', { doctype: 'Stock Indent', filters: v, fieldname: 'requesting_warehouse' })
        if (r?.requesting_warehouse) ctx.set('to_warehouse', r.requesting_warehouse)
        if (!ctx.doc.from_warehouse) {
          const rows = await call('frappe.client.get_list', { doctype: 'Warehouse', filters: { warehouse_type: 'Central Store' }, fields: ['name'], limit_page_length: 1 })
          if (rows?.length) ctx.set('from_warehouse', rows[0].name)
        }
      },
    },
    rowChange: {
      items: {
        // Stock Transfer Item.item: name, then the latest batch as a start.
        async item(ctx, row) {
          if (!row.item) {
            ctx.setRow(row, 'item_name', '')
            ctx.setRow(row, 'batch', '')
            return
          }
          const r = (await call('frappe.client.get_value', { doctype: 'Item', filters: row.item, fieldname: 'item_name' })) || {}
          ctx.setRow(row, 'item_name', r.item_name || '')
          const batch = await call('metta.purchase_order.doctype.purchase_receipt.purchase_receipt.get_latest_batch_for_item', { item: row.item })
          if (batch) ctx.setRow(row, 'batch', batch.name || '')
        },
        // qty_dispatched: Qty Confirmed starts equal, so a later 0 means a real loss.
        qty_dispatched(ctx, row) {
          if (ctx.doc.docstatus === 0) ctx.setRow(row, 'qty_confirmed', row.qty_dispatched)
        },
      },
    },
    actions(ctx) {
      const d = ctx.doc
      const out = []
      // show_get_items_button: only while nothing real is in the table, so
      // batch numbers already typed are never wiped.
      if (d.docstatus === 0 && d.against_indent && !(d.items || []).some((r) => r.item)) {
        out.push({
          label: 'Get Items From Stock Indent',
          primary: true,
          async run() {
            if (!ctx.doc.from_warehouse) return ctx.msgprint('Please set From Warehouse first, so Available Qty can be checked against it.')
            const rows = (await call(`${ST}.get_pending_items_for_transfer`, { stock_indent: ctx.doc.against_indent, from_warehouse: ctx.doc.from_warehouse })) || []
            if (!rows.length) return ctx.msgprint('Nothing pending to issue on this Stock Indent.')
            ctx.clearTable('items')
            rows.forEach((r) => ctx.addRow('items', r))
            ctx.alert(`${rows.length} item(s) pulled in - fill in Batch No for each before submitting.`)
          },
        })
      }
      if (d.docstatus === 1 && d.status === 'Dispatched') {
        out.push({
          label: 'Confirm Receipt',
          primary: true,
          async run() {
            if (!(await ctx.confirm(`Confirm the quantities received at ${ctx.doc.to_warehouse}? This will add them to that warehouse's stock.`))) return
            // Like frm.call: sends the form as it is, so Qty Confirmed typed
            // but not yet updated is what gets confirmed.
            await ctx.runDocMethod('confirm_receipt')
            await ctx.reload()
          },
        })
      }
      if (d.docstatus === 1 && d.status === 'Confirmed') {
        out.push({
          label: 'Create Return Transfer',
          async run() {
            const details = await call(`${ST}.get_return_transfer_details`, { stock_transfer: ctx.doc.name })
            if (!details || !details.items.length) return ctx.msgprint('Nothing was actually received on this transfer to return.')
            ctx.openNew(
              'Stock Transfer',
              { from_warehouse: details.from_warehouse, to_warehouse: details.to_warehouse, against_transfer: details.against_transfer, items: details.items },
              `${details.items.length} item(s) pulled in - fill in Batch No, and change To Warehouse if this is going somewhere other than back to ${details.to_warehouse}.`,
            )
          },
        })
      }
      return out
    },
  },

  // material_issue.js
  'Material Issue': {
    childFilters: { items: { item: STOCK_ITEM } },
    onNew: setUserIfEmpty('issued_by'),
    rowChange: { items: { item: itemNameFetcher() } },
  },

  // stock_reconciliation.js
  'Stock Reconciliation': {
    childFilters: {
      items: {
        item: STOCK_ITEM,
        // A batch belongs to exactly one item.
        batch_no: (row) => ({ item: row.item }),
      },
    },
    rowChange: {
      items: {
        async item(ctx, row) {
          // runs alongside the rest, as in Desk; awaited last so its errors show
          const systemQty = fetchSystemQty(ctx, row)
          ctx.setRow(row, 'batch_no', '')
          if (!row.item) {
            ctx.setRow(row, 'item_name', '')
            return systemQty
          }
          const r = (await call('frappe.client.get_value', { doctype: 'Item', filters: row.item, fieldname: 'item_name' })) || {}
          ctx.setRow(row, 'item_name', r.item_name || '')
          // Auto-fill only when there is exactly one batch to choose from.
          const batches = (await call(`${SR}.get_batches_for_item`, { item: row.item })) || []
          if (batches.length === 1) ctx.setRow(row, 'batch_no', batches[0])
          await systemQty
        },
        physical_qty(ctx, row) {
          calculateDifference(ctx, row)
        },
      },
    },
  },

  // stock_adjustment.js
  'Stock Adjustment': {
    filters: { item: STOCK_ITEM },
    onNew: setUserIfEmpty('adjusted_by'),
  },

  // item.js
  Item: {
    // Category lists only the categories of the selected Group.
    filters: { category: (doc) => ({ item_group: doc.item_group || '' }) },
    change: {
      item_group(ctx, v) {
        ctx.set('category', '')
        // mirrors ITEM_TYPE_BY_GROUP in item.py
        const byGroup = { 'Pharmacy Store': 'Medicine', 'General Store': 'Consumable', Service: 'Service' }
        ctx.set('item_type', byGroup[v] || '')
      },
      // Clear the sections that no longer apply, so they aren't saved invisibly.
      item_type(ctx, v) {
        const stockPricing = ['unit_of_measure', 'has_batch', 'has_expiry', 'standard_purchase_rate', 'rack_location']
        const medicine = ['manufacturer', 'hsn_code', 'gst_percent', 'chemical_composition']
        const service = ['department']
        const keep = v === 'Medicine' ? [...stockPricing, ...medicine] : v === 'Consumable' ? stockPricing : v === 'Service' ? service : []
        ;[...stockPricing, ...medicine, ...service].filter((f) => !keep.includes(f)).forEach((f) => ctx.set(f, ''))
        if (v !== 'Medicine' && v !== 'Consumable') ctx.clearTable('reorder_levels')
      },
    },
  },

  // service_rate_list.js
  'Service Rate List': {
    filters: { item: { item_type: 'Service', is_active: 1 } },
    actions(ctx) {
      // Desk shows it to everyone; only writers can use it (update_rate checks write).
      if (ctx.isNew || !ctx.perms.write) return []
      return [
        {
          label: 'Update Rate',
          async run() {
            const values = await ctx.prompt({
              title: 'Update Rate',
              primary: 'Update',
              fields: [
                { fieldname: 'new_rate', fieldtype: 'Currency', label: 'New Rate', reqd: 1 },
                { fieldname: 'new_start_date', fieldtype: 'Date', label: 'Start Date', default: todayStr(), reqd: 1 },
              ],
            })
            if (!values) return
            await call('metta.master.doctype.service_rate_list.service_rate_list.update_rate', { name: ctx.doc.name, new_rate: values.new_rate, new_start_date: values.new_start_date })
            await ctx.reload()
          },
        },
      ]
    },
  },

  // category_price_adjustment.js: Finance calls the markup "TDS".
  'Category Price Adjustment': {
    label(df, doc) {
      if (df.fieldname === 'charity_percent') return doc.adjustment_type === 'Increase' ? 'TDS Percent' : 'Charity Percent'
      return df.label
    },
  },
}

// stock_reconciliation.js fetch_system_qty
async function fetchSystemQty(ctx, row) {
  if (!row.item || !ctx.doc.warehouse) return
  const qty = await call(`${SR}.get_current_stock_qty`, { item: row.item, warehouse: ctx.doc.warehouse })
  ctx.setRow(row, 'system_qty', qty || 0)
  calculateDifference(ctx, row)
}

// stock_reconciliation.js calculate_difference
function calculateDifference(ctx, row) {
  ctx.setRow(row, 'difference', flt(row.physical_qty) - flt(row.system_qty))
}
