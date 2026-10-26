<template>
  <PurchaseDocForm :form="f" :subtitle="f.doc?.supplier || ''" :sections="SECTIONS" :actions="actions" :table-filters="{ item: ITEM_FILTER }" :table-columns="COLUMNS" />
</template>

<script setup>
// quality_inspection.js / quality_inspection.py in Vue.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import PurchaseDocForm from '@/components/purchase/PurchaseDocForm.vue'
import { session } from '@/data/session'
import { errorText } from '@/data/api'
import { useDocForm } from '@/data/purchase/useDocForm'
import { QI, PRET, ITEM_FILTER, flt, hasRealItems, qiFromAccepted, qiFromRejected } from '@/data/purchase/rules'
import { formRoute } from '@/data/purchase/ui'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

const SECTIONS = [
  { title: 'Inspection', icon: 'clipboard-check', fields: ['purchase_receipt', 'purchase_order', 'supplier', 'inspection_date_time', 'inspected_by', 'amended_from'] },
  { title: 'Items', icon: 'package', table: 'items' },
]
// Desk's grid columns plus Rejection Reason, which becomes mandatory as
// soon as a row has a rejected qty - so it can be picked in the row itself.
const COLUMNS = { items: ['item', 'item_name', 'batch_no', 'expiry_date', 'qty_delivered', 'qty_accepted', 'qty_rejected', 'rejection_reason', 'result'] }

const f = useDocForm({
  doctype: 'Quality Inspection',
  name: props.name,
  routeName: 'QualityInspectionForm',
  listName: 'QualityInspectionList',
  onRowChange,
  onLoaded,
})

const existingReturn = ref(null)

const actions = computed(() => {
  const d = f.doc
  if (!d) return []
  const out = []
  // show_get_items_button: hidden once real rows exist, so inspection work isn't wiped.
  if (d.docstatus === 0 && d.purchase_receipt && !hasRealItems(d)) out.push({ label: 'Get Items From Purchase Receipt', primary: true, run: () => getItems(false) })
  // show_create_return_button: offered on any rejected qty, not on Result -
  // a row can reject some units while the batch is still Accepted.
  if (d.docstatus === 1 && hasRejected.value) {
    if (existingReturn.value) out.push({ label: 'View Purchase Return', primary: true, run: () => router.push(formRoute('Purchase Return', existingReturn.value)) })
    else out.push({ label: 'Create Purchase Return', primary: true, run: createReturn })
  }
  return out
})
const hasRejected = computed(() => (f.doc?.items || []).some((r) => flt(r.qty_rejected) > 0))

async function onLoaded(query) {
  if (f.isNew) {
    if (!f.doc.inspected_by) f.doc.inspected_by = session.user
    // Opened from a Purchase Receipt's Create Follow-up Document.
    if (query.get_items === 'pr' && f.doc.purchase_receipt) await getItems(true)
    return
  }
  existingReturn.value = null
  // One inspection only ever produces one Purchase Return.
  if (f.doc.docstatus === 1 && hasRejected.value) {
    existingReturn.value = await call(`${PRET}.get_existing_return_for_quality_inspection`, { quality_inspection: f.doc.name }).catch(() => null)
  }
}

// get_items_to_inspect: Batch No, Expiry Date and Qty come from the receipt.
async function getItems(fromReceipt) {
  try {
    const rows = (await call(`${QI}.get_items_to_inspect`, { purchase_receipt: f.doc.purchase_receipt })) || []
    if (!rows.length && !fromReceipt) return f.say('info', 'This Purchase Receipt has no items to inspect.')
    if (rows.length) f.setRows('items', rows)
    f.say('success', `${rows.length} item(s) pulled in with Batch No, Expiry Date and Qty already filled in - just record the inspection result.`)
  } catch (err) {
    f.say('error', errorText(err))
  }
}

async function createReturn() {
  try {
    const details = await call(`${PRET}.get_return_details_from_quality_inspection`, { quality_inspection: f.doc.name })
    if (!details || !details.items.length) return f.say('info', 'No rejected items with a rejected quantity found to return.')
    // The return form pulls the same rows itself (get_items=qi).
    router.push(
      formRoute('Purchase Return', 'new', {
        supplier: details.supplier,
        against_purchase_receipt: details.against_purchase_receipt,
        from_warehouse: details.from_warehouse,
        quality_inspection: f.doc.name,
        get_items: 'qi',
      }),
    )
  } catch (err) {
    f.say('error', errorText(err))
  }
}

// Quality Inspection Item handlers.
async function onRowChange(table, row, fieldname) {
  if (fieldname === 'item') {
    const item = row.item
    if (!item) {
      row.item_name = ''
      return
    }
    const r = await call('frappe.client.get_value', { doctype: 'Item', filters: item, fieldname: 'item_name' }).catch(() => null)
    if (row.item === item) row.item_name = r?.item_name || ''
  }
  // Accepted and Rejected are two sides of Qty Delivered: whichever is typed drives the other.
  if (fieldname === 'qty_accepted') qiFromAccepted(row)
  if (fieldname === 'qty_rejected') qiFromRejected(row)
}

onMounted(f.load)
</script>
