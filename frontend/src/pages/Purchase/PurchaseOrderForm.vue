<template>
  <PurchaseDocForm :form="f" :subtitle="f.doc?.supplier || ''" :sections="SECTIONS" :actions="actions" :table-filters="{ item: ITEM_FILTER }">
    <template #before-items>
      <PoItemSearch v-if="f.editable" @add="addSearched" />
    </template>
  </PurchaseDocForm>
  <PromptDialog v-model="rejectOpen" title="Reject Purchase Order" :fields="REJECT_FIELDS" primary-label="Reject" @submit="(v) => f.runMethod('reject_order', { reason: v.reason })" />
</template>

<script setup>
// purchase_order.js / purchase_order.py in Vue.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import PurchaseDocForm from '@/components/purchase/PurchaseDocForm.vue'
import PoItemSearch from '@/components/purchase/PoItemSearch.vue'
import PromptDialog from '@/components/purchase/PromptDialog.vue'
import { hasRole } from '@/data/session'
import { errorText } from '@/data/api'
import { useDocForm } from '@/data/purchase/useDocForm'
import { PO, PR, ITEM_FILTER, cint, flt, isPastDate, poRow, poTotal } from '@/data/purchase/rules'
import { formRoute } from '@/data/purchase/ui'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

const SECTIONS = [
  { title: 'Order', icon: 'shopping-cart', fields: ['supplier', 'supplier_email', 'order_date', 'expected_delivery', 'status', 'approved_by', 'approved_date_time', 'rejection_reason', 'total_amount', 'amended_from'] },
  { title: 'Items', icon: 'package', table: 'items' },
]
const REJECT_FIELDS = [{ fieldname: 'reason', label: 'Rejection Reason', fieldtype: 'Small Text', reqd: 1 }]

const f = useDocForm({
  doctype: 'Purchase Order',
  name: props.name,
  routeName: 'PurchaseOrderForm',
  listName: 'PurchaseOrderList',
  onChange,
  onRowChange,
  // items_add / items_remove -> calculate_total
  onRowsChange: () => poTotal(f.doc),
  onLoaded,
})

const rejectOpen = ref(false)

// refresh(): the server re-checks each of these (validate_can_approve /
// validate_can_fulfill); the buttons are only hidden from whoever it would refuse.
const actions = computed(() => {
  const d = f.doc
  if (!d || d.docstatus !== 1) return []
  const canApprove = hasRole('Purchase Approver')
  const canFulfill = hasRole('Store Staff')
  const out = []
  if (d.status === 'Pending Approval' && canApprove) {
    out.push({ label: 'Approve', primary: true, run: () => f.runMethod('approve_order') })
    out.push({ label: 'Reject', run: () => (rejectOpen.value = true) })
  }
  if (d.status === 'Approved' && canFulfill) out.push({ label: 'Mark Sent to Dealer', primary: true, run: () => f.runMethod('mark_sent_to_dealer') })
  if (d.status === 'Received' && canFulfill) out.push({ label: 'Close Order', primary: true, run: () => f.runMethod('close_order') })
  // Goods can't arrive before the order went to the dealer; "Received" has nothing left.
  if (['Sent to Dealer', 'Partially Received'].includes(d.status)) out.push({ label: 'Create Purchase Receipt', primary: true, run: createReceipt })
  return out
})

// refresh() runs calculate_total; a draft is kept in step with its rows.
function onLoaded() {
  if (f.doc.docstatus === 0) poTotal(f.doc)
}

// expected_delivery: an instant check; validate_expected_delivery() is the real gate.
function onChange(fieldname, v) {
  if (fieldname === 'expected_delivery' && isPastDate(v)) {
    f.say('error', 'Expected Delivery cannot be a date in the past. Please pick today or a later date.', 'Invalid Expected Delivery Date')
    f.doc.expected_delivery = null
  }
}

// Purchase Order Item handlers.
async function onRowChange(table, row, fieldname) {
  if (fieldname === 'item') {
    const item = row.item
    if (!item) {
      Object.assign(row, { unit_of_measure: '', item_name: '', available_qty: 0, packing: 0 })
      poRow(row)
      poTotal(f.doc)
      return
    }
    // fetch_from alone isn't stored from a grid pick in Desk, so the name,
    // UOM, suggested Packing and Central Store balance are fetched outright.
    const [name, defaults, avail] = await Promise.all([
      call('frappe.client.get_value', { doctype: 'Item', filters: item, fieldname: 'item_name' }).catch(() => null),
      call(`${PO}.get_item_defaults_for_order`, { item }).catch(() => ({})),
      call(`${PO}.get_available_qty`, { item }).catch(() => 0),
    ])
    if (row.item !== item) return
    row.item_name = name?.item_name || ''
    row.unit_of_measure = defaults?.unit_of_measure || ''
    row.packing = cint(defaults?.packing)
    row.pack_type = defaults?.pack_type || ''
    row.available_qty = flt(avail)
  }
  // packing / no_of_unit -> calculate_qty_ordered -> calculate_amount -> calculate_total
  if (['item', 'packing', 'no_of_unit'].includes(fieldname)) {
    poRow(row)
    poTotal(f.doc)
  }
}

// The search-and-add widget's Add.
function addSearched(values) {
  // A table holding only blank rows is cleared before the first real item.
  const rows = f.doc.items || []
  if (rows.length && rows.every((r) => !r.item)) f.doc.items = []
  f.addRow('items', values)
  poTotal(f.doc)
}

async function createReceipt() {
  try {
    const rows = (await call(`${PR}.get_pending_items`, { purchase_order: f.doc.name })) || []
    if (!rows.length) return f.say('info', 'Nothing pending to receive on this Purchase Order.')
    // The receipt form pulls the same pending rows itself (get_items=po).
    router.push(formRoute('Purchase Receipt', 'new', { supplier: f.doc.supplier, purchase_order: f.doc.name, get_items: 'po' }))
  } catch (err) {
    f.say('error', errorText(err))
  }
}

onMounted(f.load)
</script>
