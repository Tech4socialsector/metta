<template>
  <PurchaseDocForm :form="f" :subtitle="f.doc?.supplier || ''" :sections="SECTIONS" :actions="actions" :table-filters="{ item: ITEM_FILTER }" />
  <PromptDialog v-model="rejectOpen" title="Reject Purchase Bill" :fields="REJECT_FIELDS" primary-label="Reject" @submit="(v) => f.runMethod('reject_bill', { reason: v.reason })" />
</template>

<script setup>
// purchase_bill.js / purchase_bill.py in Vue.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import PurchaseDocForm from '@/components/purchase/PurchaseDocForm.vue'
import PromptDialog from '@/components/purchase/PromptDialog.vue'
import { session, hasRole } from '@/data/session'
import { errorText } from '@/data/api'
import { createRoute } from '@/data/formMenu'
import { useDocForm, canCreate } from '@/data/purchase/useDocForm'
import { PB, ITEM_FILTER, flt, hasRealItems, billRow, billTotals, BILL_ROW_TRIGGERS, loadRoundingMethod } from '@/data/purchase/rules'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

const SECTIONS = [
  { title: 'Bill', icon: 'receipt', fields: ['supplier', 'supplier_invoice_no', 'supplier_invoice_date', 'purchase_receipt', 'entered_by', 'status', 'approved_by', 'approved_date_time', 'rejection_reason', 'amended_from'] },
  { title: 'Items', icon: 'package', table: 'items' },
  { title: 'Totals', icon: 'calculator', fields: ['subtotal', 'discount', 'gst_amount', 'round_off', 'total_amount'] },
  { title: 'Payment', icon: 'wallet', fields: ['payment_terms_days', 'due_date', 'payment_status', 'amount_paid', 'balance_due'] },
]
const REJECT_FIELDS = [{ fieldname: 'reason', label: 'Rejection Reason', fieldtype: 'Small Text', reqd: 1 }]

const f = useDocForm({
  doctype: 'Purchase Bill',
  name: props.name,
  routeName: 'PurchaseBillForm',
  listName: 'PurchaseBillList',
  onRowChange,
  // items_add / items_remove -> calculate_totals
  onRowsChange: () => billTotals(f.doc),
  onLoaded,
})

const rejectOpen = ref(false)
const canPay = ref(false)

const actions = computed(() => {
  const d = f.doc
  if (!d) return []
  const out = []
  // show_get_items_button: hidden once real rows exist, so billing work isn't wiped.
  if (d.docstatus === 0 && d.purchase_receipt && !hasRealItems(d)) out.push({ label: 'Get Items From Purchase Receipt', primary: true, run: () => getItems(false) })
  if (d.docstatus !== 1) return out
  // The server re-checks the role (validate_can_approve); hidden from anyone it would refuse.
  const canApprove = hasRole('Purchase Approver')
  if (d.status === 'Pending Approval' && canApprove) {
    out.push({ label: 'Approve', primary: true, run: () => f.runMethod('approve_bill') })
    out.push({ label: 'Reject', run: () => (rejectOpen.value = true) })
  }
  // Undoes only the approval (reverses its stock); Cancel voids the whole bill.
  if (d.status === 'Approved' && canApprove) {
    out.push({
      label: 'Cancel Approval',
      run: () => window.confirm('This reverses the stock that was added and puts the bill back to Pending Approval. Continue?') && f.runMethod('cancel_approval'),
    })
  }
  // Part payments are normal, so no one-per-bill check; recording payment is Account Staff's job.
  if (flt(d.balance_due) > 0 && canPay.value) out.push({ label: 'Create Payment Entry', primary: !out.some((a) => a.primary), run: createPayment })
  return out
})

async function onLoaded(query) {
  if (f.isNew && !f.doc.entered_by) f.doc.entered_by = session.user
  // refresh() runs calculate_totals; only a draft can still change.
  if (f.doc.docstatus === 0) billTotals(f.doc)
  if (f.isNew && query.get_items === 'pr' && f.doc.purchase_receipt) await getItems(true)
  canPay.value = f.doc.docstatus === 1 && (await canCreate('Payment Entry'))
}

// get_items_from_receipt: rows come back already priced/computed from the server.
async function getItems(fromReceipt) {
  try {
    const rows = (await call(`${PB}.get_items_from_receipt`, { purchase_receipt: f.doc.purchase_receipt })) || []
    if (!rows.length && !fromReceipt) return f.say('info', 'This Purchase Receipt has no items to bill.')
    if (rows.length) f.setRows('items', rows)
    billTotals(f.doc)
    f.say(
      'success',
      fromReceipt
        ? `${rows.length} item(s) pulled in - fill in the supplier's Invoice No and Date, then Save.`
        : `${rows.length} item(s) pulled in - enter Free, P Rate, Discount and MRP for each.`,
    )
  } catch (err) {
    f.say('error', errorText(err))
  }
}

function createPayment() {
  router.push({ ...createRoute('Payment Entry'), query: { purchase_bill: f.doc.name, amount_paid: String(f.doc.balance_due), paid_by: session.user } })
}

// Purchase Bill Item handlers.
async function onRowChange(table, row, fieldname) {
  if (fieldname === 'item') {
    const item = row.item
    if (!item) {
      row.item_name = ''
    } else {
      const r = await call('frappe.client.get_value', { doctype: 'Item', filters: item, fieldname: 'item_name' }).catch(() => null)
      if (row.item !== item) return
      row.item_name = r?.item_name || ''
    }
    // GST % arrives by fetch_from item.gst_percent, and in Desk that set
    // fires gst_percent's own handler -> calculate_amount.
    billRow(row)
    billTotals(f.doc)
    return
  }
  if (BILL_ROW_TRIGGERS.includes(fieldname)) {
    billRow(row)
    billTotals(f.doc)
  }
}

// Totals are rounded the site's way before any are worked out.
onMounted(async () => {
  await loadRoundingMethod(call)
  await f.load()
})
</script>
