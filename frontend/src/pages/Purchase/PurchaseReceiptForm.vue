<template>
  <PurchaseDocForm :form="f" :subtitle="f.doc?.supplier || ''" :sections="SECTIONS" :actions="actions" :table-filters="{ item: ITEM_FILTER }" />
  <PromptDialog v-model="followUpOpen" title="Create Follow-up Document" :fields="followUpFields" primary-label="Create" @submit="(v) => createFollowUp(v.doctype_choice)" />
</template>

<script setup>
// purchase_receipt.js / purchase_receipt.py in Vue.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import PurchaseDocForm from '@/components/purchase/PurchaseDocForm.vue'
import PromptDialog from '@/components/purchase/PromptDialog.vue'
import { errorText } from '@/data/api'
import { useDocForm, canCreate } from '@/data/purchase/useDocForm'
import { PO, PR, QI, PB, PRET, ITEM_FILTER, cint, flt, hasRealItems, prRow } from '@/data/purchase/rules'
import { formRoute } from '@/data/purchase/ui'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

const SECTIONS = [
  { title: 'Receipt', icon: 'truck', fields: ['supplier', 'purchase_order', 'receipt_date_time', 'receiving_warehouse', 'replacement_for', 'linked_quality_inspection', 'linked_purchase_bill', 'amended_from'] },
  { title: 'Items', icon: 'package', table: 'items' },
]

const f = useDocForm({
  doctype: 'Purchase Receipt',
  name: props.name,
  routeName: 'PurchaseReceiptForm',
  listName: 'PurchaseReceiptList',
  onRowChange,
  onLoaded,
})

// show_create_document_button: what already exists, what may still be made.
const existing = ref({ qi: null, bill: null, options: [] })
const followUpOpen = ref(false)
const followUpFields = computed(() => [{ fieldname: 'doctype_choice', label: 'What do you want to create?', fieldtype: 'Select', options: existing.value.options.join('\n'), reqd: 1 }])

const actions = computed(() => {
  const d = f.doc
  if (!d) return []
  const out = []
  // show_get_items_button: a replacement receipt already has its rows from the
  // Purchase Return, and pulling again would wipe rows already entered.
  if (d.docstatus === 0 && d.purchase_order && !d.replacement_for && !hasRealItems(d)) {
    out.push({ label: 'Get Items From Purchase Order', primary: true, run: getItems })
  }
  if (existing.value.qi) out.push({ label: 'View Quality Inspection', run: () => router.push(formRoute('Quality Inspection', existing.value.qi)) })
  if (existing.value.bill) out.push({ label: 'View Purchase Bill', run: () => router.push(formRoute('Purchase Bill', existing.value.bill)) })
  if (existing.value.options.length) out.push({ label: 'Create Follow-up Document', primary: d.docstatus === 1, run: () => (followUpOpen.value = true) })
  return out
})

async function onLoaded(query) {
  if (f.isNew) {
    // Opened from a Purchase Order's / Purchase Return's Create Purchase Receipt.
    if (query.get_items === 'po' && f.doc.purchase_order) await pullPending(true)
    if (query.from_return) await pullReplacement(String(query.from_return))
    return
  }
  await loadFollowUps()
}

// Quality Inspection can start on a saved draft; billing needs the
// quantities final, so a Purchase Bill is only offered once submitted. Only
// what the user may actually create is offered.
async function loadFollowUps() {
  existing.value = { qi: null, bill: null, options: [] }
  if (f.doc.docstatus === 2) return
  const [qi, bill] = await Promise.all([
    call(`${QI}.get_existing_inspection_for_purchase_receipt`, { purchase_receipt: f.doc.name }).catch(() => null),
    call(`${PB}.get_existing_bill_for_purchase_receipt`, { purchase_receipt: f.doc.name }).catch(() => null),
  ])
  const options = []
  if (!qi && (await canCreate('Quality Inspection'))) options.push('Quality Inspection')
  if (!bill && f.doc.docstatus === 1 && (await canCreate('Purchase Bill'))) options.push('Purchase Bill')
  existing.value = { qi, bill, options }
}

async function getItems() {
  await pullPending(false)
}

// get_pending_items: only what is still outstanding on the order.
async function pullPending(fromOrder) {
  try {
    const rows = (await call(`${PR}.get_pending_items`, { purchase_order: f.doc.purchase_order })) || []
    if (!rows.length) return f.say('info', 'Nothing pending to receive on this Purchase Order.')
    f.setRows('items', rows)
    f.say(
      'success',
      fromOrder
        ? `${rows.length} item(s) pulled in - fill in Receiving Warehouse, Batch No and Expiry Date, then confirm Qty Received.`
        : `${rows.length} item(s) pulled in - fill in Batch No, Expiry Date and confirm Packing/No of Unit.`,
    )
  } catch (err) {
    f.say('error', errorText(err))
  }
}

// purchase_return.js Create Purchase Receipt: the replacement's rows.
async function pullReplacement(purchaseReturn) {
  try {
    const details = await call(`${PRET}.get_replacement_receipt_details`, { purchase_return: purchaseReturn })
    f.setRows('items', details.items || [])
    f.say('success', `${(details.items || []).length} item(s) pulled in - fill in Batch No and Expiry Date once the replacement arrives.`)
  } catch (err) {
    f.say('error', errorText(err))
  }
}

function createFollowUp(choice) {
  if (choice === 'Quality Inspection') router.push(formRoute('Quality Inspection', 'new', { purchase_receipt: f.doc.name, get_items: 'pr' }))
  else router.push(formRoute('Purchase Bill', 'new', { supplier: f.doc.supplier, purchase_receipt: f.doc.name, get_items: 'pr' }))
}

// Purchase Receipt Item handlers.
async function onRowChange(table, row, fieldname) {
  if (fieldname === 'item') {
    const item = row.item
    if (!item) {
      Object.assign(row, { unit_of_measure: '', qty_ordered: 0, item_name: '' })
      return
    }
    // fetch_from isn't stored from a grid pick in Desk, so these are fetched
    // outright; the latest Batch is only a starting point for a new delivery.
    const [vals, defaults, batch, ordered] = await Promise.all([
      call('frappe.client.get_value', { doctype: 'Item', filters: item, fieldname: ['unit_of_measure', 'item_name'] }).catch(() => null),
      call(`${PO}.get_item_defaults_for_order`, { item }).catch(() => ({})),
      call(`${PR}.get_latest_batch_for_item`, { item }).catch(() => null),
      // Qty Ordered depends on the order and the item together.
      f.doc.purchase_order ? call(`${PR}.get_qty_ordered`, { purchase_order: f.doc.purchase_order, item }).catch(() => 0) : Promise.resolve(null),
    ])
    if (row.item !== item) return
    row.unit_of_measure = vals?.unit_of_measure || ''
    row.item_name = vals?.item_name || ''
    row.packing = cint(defaults?.packing)
    row.pack_type = defaults?.pack_type || ''
    if (batch) {
      row.batch_no = batch.batch_no || ''
      row.expiry_date = batch.expiry_date || ''
    }
    if (ordered !== null) row.qty_ordered = flt(ordered)
    prRow(row)
    await findQualityInspection(row)
  }
  if (fieldname === 'batch_no') await findQualityInspection(row)
  // packing / no_of_unit -> calculate_qty_received
  if (['packing', 'no_of_unit'].includes(fieldname)) prRow(row)
}

// find_and_fill_quality_inspection: only a saved receipt can be matched,
// since an inspection links to it by name.
async function findQualityInspection(row) {
  if (f.isNew || !row.item || !row.batch_no) return
  const { item, batch_no } = row
  const match = await call(`${PR}.find_matching_quality_inspection`, { purchase_receipt: f.doc.name, item, batch_no }).catch(() => null)
  if (!match || row.item !== item || row.batch_no !== batch_no) return
  row.quality_inspection = match.name
  if (match.result === 'Rejected') {
    f.say('error', `Row for Item ${item}, Batch ${batch_no}: the matching Quality Inspection ${match.name} was Rejected.`, 'Quality Inspection Failed')
  }
}

onMounted(f.load)
</script>
