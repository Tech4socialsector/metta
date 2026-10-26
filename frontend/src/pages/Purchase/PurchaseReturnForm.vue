<template>
  <PurchaseDocForm :form="f" :subtitle="f.doc?.supplier || ''" :sections="SECTIONS" :actions="actions" :table-filters="{ item: ITEM_FILTER }" />
  <PromptDialog v-model="resolveOpen" title="Mark Purchase Return Resolved" :fields="RESOLVE_FIELDS" primary-label="Submit" @submit="resolve" />
</template>

<script setup>
// purchase_return.js / purchase_return.py in Vue.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import PurchaseDocForm from '@/components/purchase/PurchaseDocForm.vue'
import PromptDialog from '@/components/purchase/PromptDialog.vue'
import { hasRole } from '@/data/session'
import { errorText } from '@/data/api'
import { useDocForm } from '@/data/purchase/useDocForm'
import { PRET, ITEM_FILTER, flt, retAmount, retStockQty, retTotal } from '@/data/purchase/rules'
import { formRoute } from '@/data/purchase/ui'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

const SECTIONS = [
  { title: 'Return', icon: 'undo-2', fields: ['supplier', 'supplier_email', 'quality_inspection', 'against_purchase_receipt', 'return_date_time', 'from_warehouse', 'status', 'amended_from'] },
  { title: 'Items', icon: 'package', table: 'items' },
  { title: 'Totals', icon: 'calculator', fields: ['total_credit_amount'] },
]
const RESOLVE_FIELDS = [{ fieldname: 'resolution', label: 'How was this resolved?', fieldtype: 'Select', options: 'Credit Received\nReplacement Sent', reqd: 1 }]

const f = useDocForm({
  doctype: 'Purchase Return',
  name: props.name,
  routeName: 'PurchaseReturnForm',
  listName: 'PurchaseReturnList',
  onRowChange,
  // items_add / items_remove -> calculate_total
  onRowsChange: () => retTotal(f.doc),
  onLoaded,
})

const resolveOpen = ref(false)

const actions = computed(() => {
  const d = f.doc
  if (!d) return []
  const out = []
  // The inspection decided what was rejected, how much and why - pulled, not retyped.
  if (d.docstatus === 0 && d.quality_inspection) out.push({ label: 'Get Rejected Items', primary: true, run: () => getRejected(false) })
  if (d.docstatus !== 1) return out
  // validate_can_update_return_status re-checks the role on the server.
  if (d.status === 'Submitted' && hasRole('Store Staff')) out.push({ label: 'Mark Resolved', primary: true, run: () => (resolveOpen.value = true) })
  if (d.status === 'Replacement Pending') out.push({ label: 'Create Purchase Receipt', primary: true, run: createReceipt })
  return out
})

async function onLoaded(query) {
  // refresh() runs calculate_total; only a draft can still change.
  if (f.doc.docstatus === 0) retTotal(f.doc)
  // Opened from a Quality Inspection's Create Purchase Return.
  if (f.isNew && query.get_items === 'qi' && f.doc.quality_inspection) await getRejected(true)
}

async function getRejected(fromInspection) {
  try {
    // One inspection only ever produces one Purchase Return.
    const already = await call(`${PRET}.get_existing_return_for_quality_inspection`, { quality_inspection: f.doc.quality_inspection })
    if (already && already !== f.doc.name) return f.say('info', `Purchase Return ${already} already exists for this Quality Inspection.`)
    const details = (await call(`${PRET}.get_return_details_from_quality_inspection`, { quality_inspection: f.doc.quality_inspection })) || {}
    if (!details.items || !details.items.length) return f.say('info', 'No rejected items found on this Quality Inspection.')
    await f.setValue('supplier', details.supplier)
    await f.setValue('against_purchase_receipt', details.against_purchase_receipt)
    await f.setValue('from_warehouse', details.from_warehouse)
    f.setRows('items', details.items)
    retTotal(f.doc)
    f.say(
      'success',
      fromInspection
        ? `${details.items.length} rejected item(s) pulled in - review and Submit.`
        : `${details.items.length} rejected item(s) pulled in from the Quality Inspection.`,
    )
  } catch (err) {
    f.say('error', errorText(err))
  }
}

// A supplier settles a return by credit or by replacement stock.
function resolve(v) {
  f.runMethod(v.resolution === 'Credit Received' ? 'mark_credit_received' : 'mark_replacement_sent')
}

async function createReceipt() {
  try {
    const d = await call(`${PRET}.get_replacement_receipt_details`, { purchase_return: f.doc.name })
    // The receipt form pulls the same rows itself (from_return).
    router.push(
      formRoute('Purchase Receipt', 'new', {
        supplier: d.supplier,
        ...(d.purchase_order ? { purchase_order: d.purchase_order } : {}),
        receiving_warehouse: d.receiving_warehouse,
        replacement_for: d.replacement_for,
        from_return: f.doc.name,
      }),
    )
  } catch (err) {
    f.say('error', errorText(err))
  }
}

// Purchase Return Item handlers.
async function onRowChange(table, row, fieldname) {
  if (fieldname === 'item') {
    const item = row.item
    if (!item) {
      row.item_name = ''
      row.rate = 0
      retAmount(row)
      retTotal(f.doc)
      return
    }
    const receipt = f.doc.against_purchase_receipt
    // Rate is what was paid on that receipt's bill, and the UOM/conversion
    // is what that receipt recorded - neither is a plain fetch_from.
    const [name, rate, uom] = await Promise.all([
      call('frappe.client.get_value', { doctype: 'Item', filters: item, fieldname: 'item_name' }).catch(() => null),
      receipt ? call(`${PRET}.get_rate_for_item`, { against_purchase_receipt: receipt, item }).catch(() => 0) : Promise.resolve(null),
      receipt ? call(`${PRET}.get_uom_details_for_item`, { against_purchase_receipt: receipt, item }).catch(() => ({})) : Promise.resolve(null),
    ])
    if (row.item !== item) return
    row.item_name = name?.item_name || ''
    if (rate !== null) {
      row.rate = flt(rate)
      retAmount(row)
      retTotal(f.doc)
    }
    if (uom !== null) {
      row.unit_of_measure = uom?.unit_of_measure || ''
      row.conversion_factor = flt(uom?.conversion_factor) || 1
      retStockQty(row)
    }
    return
  }
  if (fieldname === 'qty_returned') {
    retAmount(row)
    retTotal(f.doc)
    retStockQty(row)
  }
  if (fieldname === 'rate') {
    retAmount(row)
    retTotal(f.doc)
  }
}

onMounted(f.load)
</script>
