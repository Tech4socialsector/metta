<template>
  <AppLayout :title="isNew ? 'New Sales Return' : 'Sales Return'" :back-to="{ name: 'BillingSalesReturnList' }">
    <!-- Option C: status and return id under the title, the one main button
    (Save, Submit, or Update after submit) at the top right. -->
    <template #meta>
      <div v-if="doc && pill" class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <StatusBadge :status="pill" />
        <span v-if="!isNew" class="font-mono">{{ doc.name }}</span>
      </div>
    </template>
    <template #actions>
      <template v-if="doc">
        <template v-if="!isNew">
          <button v-if="doc.docstatus === 1 && perms.cancel" type="button" class="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60" :disabled="busy" @click="cancel">Cancel</button>
          <button v-if="doc.docstatus === 0 && perms.delete" type="button" class="h-9 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60" :disabled="busy" @click="remove">Delete</button>
        </template>
        <button v-if="mainAction" type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy" @click="mainAction.run">{{ busy ? 'Please wait…' : mainAction.label }}</button>
      </template>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="doc">
      <PatientBar v-if="doc.patient" :name="patientName" :visit="doc.patient" />

      <!-- Save is at the top now, so what stopped it shows up here too. -->
      <div v-if="saveError || (tried && missing.length)" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <template v-if="saveError">
          <p class="font-semibold">Not saved</p>
          <p class="whitespace-pre-line">{{ saveError }}</p>
        </template>
        <p v-else><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
      </div>

      <section id="sec-return" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="undo-2">Return details</SubHeading>
        <div class="row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6">
          <QueryLink id="sr-patient" label="Patient" doctype="Patient Visit" :model-value="doc.patient || ''" :readonly="ro" @update:model-value="onPatient" />
          <!-- set_query: only this patient's submitted bills / issues -->
          <QueryLink id="sr-bill" label="Against Billing" doctype="Billing" :filters="doc.patient ? { patient: doc.patient, docstatus: 1 } : null" :model-value="doc.against_sales_bill || ''" :readonly="ro" :error="tried && noSource" @update:model-value="onAgainstBill" />
          <QueryLink id="sr-mi" label="Against Material Issue" doctype="Material Issue" :filters="doc.patient ? { visit_reference: doc.patient, docstatus: 1 } : null" :model-value="doc.against_material_issue || ''" :readonly="ro" :error="tried && noSource" @update:model-value="(v) => (doc.against_material_issue = v)" />
          <QueryLink id="sr-wh" label="To Warehouse" doctype="Warehouse" reqd :model-value="doc.to_warehouse || ''" :readonly="ro" :error="tried && !doc.to_warehouse" @update:model-value="(v) => (doc.to_warehouse = v)" />
          <TextField id="sr-when" :model-value="toInput(doc.return_date_time)" type="datetime-local" label="Return Date Time" reqd :readonly="ro" @update:model-value="(v) => (doc.return_date_time = fromInput(v))" />
          <QueryLink id="sr-by" label="Returned By" doctype="User" reqd :model-value="doc.returned_by || ''" :readonly="ro" :error="tried && !doc.returned_by" @update:model-value="(v) => (doc.returned_by = v)" />
          <SelectField id="sr-mode" v-model="doc.payment_mode" label="Payment Mode" :options="OPTIONS.return_payment_mode" reqd :readonly="ro" />
          <SelectField id="sr-status" v-model="doc.status" label="Status" :options="OPTIONS.return_status" reqd :readonly="ro" />
          <label class="flex min-h-10 items-center gap-2.5 self-end">
            <input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-brand-700" :checked="!!doc.is_received" :disabled="!canEditReceived" @change="doc.is_received = $event.target.checked ? 1 : 0" />
            <span class="text-sm font-medium text-gray-800">Item Physically Received</span>
          </label>
          <TextField v-if="doc.amended_from" id="sr-amend" :model-value="doc.amended_from" label="Amended From" readonly />
        </div>
      </section>

      <section id="sec-items" class="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="package">Items<span class="text-red-600"> *</span></SubHeading>
        <div class="overflow-x-auto rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2">Batch</th>
                <th class="w-24 px-3 py-2 text-right">Qty Returned</th>
                <th class="px-3 py-2">Return Reason</th>
                <th class="w-28 px-3 py-2 text-right">Rate</th>
                <th class="w-28 px-3 py-2 text-right">Amount</th>
                <th class="w-10 px-2 py-2"><span class="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!doc.items.length"><td colspan="7" class="px-3 py-5 text-center text-gray-500">No items yet.</td></tr>
              <tr v-for="(row, i) in doc.items" :key="row.name || `n${i}`" class="border-t border-gray-100 align-top">
                <td class="min-w-[200px] px-3 py-2">
                  <!-- set_query item: Medicine/Consumable, active -->
                  <QueryLink :id="`sr-item-${i}`" compact doctype="Item" :aria-label="`Item row ${i + 1}`" :filters="ITEM_FILTERS" :model-value="row.item || ''" :readonly="ro" :error="tried && !row.item" @update:model-value="(v) => onItem(row, v)" />
                  <div v-if="row.item_name" class="mt-0.5 text-xs text-gray-600">{{ row.item_name }}</div>
                </td>
                <td class="min-w-[150px] px-3 py-2">
                  <QueryLink :id="`sr-batch-${i}`" compact doctype="Batch" :aria-label="`Batch row ${i + 1}`" :model-value="row.batch || ''" :readonly="ro" :error="tried && !row.batch" @update:model-value="(v) => onBatch(row, v)" />
                </td>
                <td class="px-3 py-2 text-right">
                  <input type="number" min="1" step="1" :value="row.qty_returned" :readonly="ro" :aria-label="`Qty returned row ${i + 1}`" class="ctl w-24 text-right tabular-nums read-only:bg-gray-50" :class="tried && !row.qty_returned && 'border-red-400'" @change="row.qty_returned = toInt($event.target.value); calcRow(row)" />
                </td>
                <td class="px-3 py-2">
                  <select :value="row.return_reason || ''" :disabled="ro" :aria-label="`Return reason row ${i + 1}`" class="ctl min-w-[170px] disabled:bg-gray-50" :class="tried && !row.return_reason && 'border-red-400'" @change="row.return_reason = $event.target.value">
                    <option v-for="o in OPTIONS.return_reason" :key="o" :value="o">{{ o || '—' }}</option>
                  </select>
                </td>
                <td class="px-3 py-2 text-right">
                  <input type="number" min="0" step="any" :value="row.rate" :readonly="ro" :aria-label="`Rate row ${i + 1}`" class="ctl w-28 text-right tabular-nums read-only:bg-gray-50" @change="row.rate = toNum($event.target.value); calcRow(row)" />
                </td>
                <td class="px-3 py-2 text-right tabular-nums">{{ money(row.amount) }}</td>
                <td class="px-2 py-2">
                  <button v-if="!ro" type="button" class="rounded p-1 text-red-600 hover:bg-red-50" :aria-label="`Remove row ${i + 1}`" @click="doc.items.splice(i, 1); calcTotal()"><LucideIcon name="trash-2" class="h-4 w-4" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between">
          <button v-if="!ro" type="button" class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50" @click="addRow">+ Add row</button>
          <span class="ml-auto text-sm">Total Value <span class="ml-2 text-lg font-semibold tabular-nums">{{ money(doc.total_value) }}</span></span>
        </div>
      </section>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </template>
    <p v-else-if="!loadError" class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import SubHeading from '@/components/SubHeading.vue'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PatientBar from '@/components/PatientBar.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import QueryLink from '@/components/billing/QueryLink.vue'
import { api, errorText } from '@/data/api'
import { getMeta } from '@/data/meta'
import { session } from '@/data/session'
import { newDoc, toPayload } from '@/data/formEngine'
import { flt } from '@/data/registrationRules'
import { OPTIONS, RECEIPT, money } from '@/data/billing/rules'
import { getPerms, saveDoc, submitDoc, cancelDoc, deleteDoc, statusOf, useFormGuard } from '@/data/billing/docApi'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

const ITEM_FILTERS = { item_type: ['in', ['Medicine', 'Consumable']], is_active: 1 }

const doc = ref(null)
const perms = ref({})
const snapshot = ref('')
const loadError = ref('')
const saveError = ref('')
const busy = ref(false)
const tried = ref(false)

const isNew = computed(() => props.name === 'new' || !!doc.value?.__islocal)
const canWrite = computed(() => (isNew.value ? perms.value.create : perms.value.write))
const ro = computed(() => !doc.value || doc.value.docstatus !== 0 || !canWrite.value)
// is_received is allow_on_submit: still editable on a submitted return.
const canEditReceived = computed(() => !!doc.value && doc.value.docstatus < 2 && canWrite.value)
const status = computed(() => statusOf(doc.value))
// Desk's "Not Saved" while a new or edited return is waiting for Save/Update.
const pill = computed(() => (doc.value && doc.value.docstatus < 2 && (isNew.value || dirty.value) ? 'Not Saved' : status.value))
// The patient bar's name: Sales Return keeps only the visit id, so the name
// is looked up for display (never written to the return).
const patientName = ref('')
watch(
  () => doc.value?.patient,
  async (v) => {
    patientName.value = ''
    if (!v) return
    const r = await call('frappe.client.get_value', { doctype: 'Patient Visit', filters: v, fieldname: 'patient_name' }).catch(() => null)
    if (doc.value?.patient === v) patientName.value = r?.patient_name || ''
  },
)
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
const noSource = computed(() => !doc.value?.against_sales_bill && !doc.value?.against_material_issue)

const missing = computed(() => {
  const d = doc.value
  const m = []
  if (!d) return m
  if (!d.to_warehouse) m.push('To Warehouse')
  if (!d.return_date_time) m.push('Return Date Time')
  if (!d.returned_by) m.push('Returned By')
  if (!d.payment_mode) m.push('Payment Mode')
  if (!d.status) m.push('Status')
  if (!d.items.length) m.push('Items')
  d.items.forEach((r, i) => {
    const at = `Items row ${i + 1}`
    if (!r.item) m.push(`${at}: Item`)
    if (!r.batch) m.push(`${at}: Batch`)
    if (r.qty_returned === null || r.qty_returned === undefined || r.qty_returned === '') m.push(`${at}: Qty Returned`)
    if (!r.return_reason) m.push(`${at}: Return Reason`)
  })
  return m
})

const mainAction = computed(() => {
  const d = doc.value
  if (!d) return null
  if (d.docstatus === 0) {
    if (isNew.value || dirty.value) return canWrite.value ? { label: 'Save', run: save } : null
    return perms.value.submit ? { label: 'Submit', run: submit } : null
  }
  // Only Item Physically Received can change after submit.
  if (d.docstatus === 1 && dirty.value && canWrite.value) return { label: 'Update', run: save }
  return null
})

const toInput = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '')
const fromInput = (v) => (v ? `${v.replace('T', ' ')}:00` : null)
const toNum = (v) => (v === '' ? null : parseFloat(v))
const toInt = (v) => (v === '' ? null : parseInt(v, 10))
const takeSnapshot = () => (snapshot.value = JSON.stringify(toPayload(doc.value)))

async function load() {
  loadError.value = ''
  saveError.value = ''
  tried.value = false
  try {
    if (props.name === 'new') {
      perms.value = await getPerms('Sales Return')
      doc.value = newDoc((await getMeta('Sales Return')).meta, session.user)
    } else {
      doc.value = await call('frappe.client.get', { doctype: 'Sales Return', name: props.name })
      perms.value = await getPerms('Sales Return', props.name)
    }
    // refresh (sales_return.js)
    if (isNew.value && !doc.value.returned_by) doc.value.returned_by = session.user
    if (doc.value.docstatus === 0) calcTotal()
    takeSnapshot()
  } catch (err) {
    loadError.value = errorText(err) || `Sales Return ${props.name} could not be opened.`
  }
}

// patient: prefill the patient's latest submitted bill and issue.
async function onPatient(v) {
  const d = doc.value
  d.patient = v
  d.against_sales_bill = ''
  d.against_material_issue = ''
  if (!v) return
  const [bills, issues] = await Promise.all([
    call('frappe.client.get_list', { doctype: 'Billing', filters: { patient: v, docstatus: 1 }, fields: ['name'], order_by: 'sale_datetime desc', limit_page_length: 1 }).catch(() => []),
    call('frappe.client.get_list', { doctype: 'Material Issue', filters: { visit_reference: v, docstatus: 1 }, fields: ['name'], order_by: 'issue_date_time desc', limit_page_length: 1 }).catch(() => []),
  ])
  if (d.patient !== v) return
  if (bills?.length) await onAgainstBill(bills[0].name)
  if (issues?.length) d.against_material_issue = issues[0].name
}

// against_sales_bill: refund goes back the way it was paid (mapped down).
async function onAgainstBill(v) {
  doc.value.against_sales_bill = v
  if (!v) return
  const r = await call('frappe.client.get_value', { doctype: 'Billing', filters: v, fieldname: 'payment_mode' }).catch(() => null)
  if (!r?.payment_mode) return
  doc.value.payment_mode = r.payment_mode === 'Credit - Corporate' ? 'Credit' : 'Cash'
}

function addRow() {
  doc.value.items.push({ item: '', item_name: '', batch: '', qty_returned: null, return_reason: '', rate: null, amount: null })
}

// Sales Return Item item: name, then the item's latest batch (its rate follows).
async function onItem(row, v) {
  row.item = v
  if (!v) {
    row.item_name = ''
    row.batch = ''
    row.rate = 0
    calcRow(row)
    return
  }
  const [r, batch] = await Promise.all([
    call('frappe.client.get_value', { doctype: 'Item', filters: v, fieldname: 'item_name' }).catch(() => null),
    api(`${RECEIPT}.get_latest_batch_for_item`, { item: v }).catch(() => null),
  ])
  if (row.item !== v) return
  row.item_name = r?.item_name || ''
  if (batch) await onBatch(row, batch.name || '')
}

// batch: price is per batch.
async function onBatch(row, v) {
  row.batch = v
  if (!v) {
    row.rate = 0
  } else {
    const r = await call('frappe.client.get_value', { doctype: 'Batch', filters: v, fieldname: 'selling_rate' }).catch(() => null)
    row.rate = flt(r?.selling_rate)
  }
  calcRow(row)
}

// calculate_amount / calculate_total - same as validate().
function calcRow(row) {
  row.amount = flt(row.qty_returned) * flt(row.rate)
  calcTotal()
}
function calcTotal() {
  doc.value.total_value = doc.value.items.reduce((s, r) => s + flt(r.amount), 0)
}

async function save() {
  // Ctrl+S reaches both the form guard and the header's Save button in the
  // same keypress; the second call must not start another save.
  if (busy.value) return
  tried.value = true
  saveError.value = ''
  if (doc.value.docstatus === 0 && missing.value.length) return
  // validate(): message verbatim.
  if (noSource.value) {
    saveError.value = 'Please link either Against Billing or Against Material Issue - a return needs a source document.'
    return
  }
  busy.value = true
  try {
    const wasNew = isNew.value
    doc.value = await saveDoc(doc.value)
    takeSnapshot()
    tried.value = false
    if (wasNew) {
      perms.value = await getPerms('Sales Return', doc.value.name)
      router.replace({ name: 'BillingSalesReturnForm', params: { name: doc.value.name } })
    }
  } catch (err) {
    saveError.value = errorText(err) || 'Could not save.'
  } finally {
    busy.value = false
  }
}

async function submit() {
  if (!window.confirm(`Permanently Submit ${doc.value.name}?`)) return
  busy.value = true
  saveError.value = ''
  try {
    doc.value = await submitDoc(doc.value)
    perms.value = await getPerms('Sales Return', doc.value.name)
    takeSnapshot()
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}

async function cancel() {
  if (!window.confirm(`Permanently Cancel ${doc.value.name}?`)) return
  busy.value = true
  try {
    await cancelDoc('Sales Return', doc.value.name)
    await load()
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!window.confirm(`Permanently delete ${doc.value.name}?`)) return
  busy.value = true
  try {
    await deleteDoc('Sales Return', doc.value.name)
    takeSnapshot()
    router.replace({ name: 'BillingSalesReturnList' })
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}

useFormGuard(
  () => dirty.value && canWrite.value && doc.value?.docstatus < 2,
  () => mainAction.value && mainAction.value.label !== 'Submit' && save(),
)

watch(
  () => props.name,
  () => {
    if (props.name !== 'new' && doc.value?.name === props.name) return
    load()
  },
  { immediate: true },
)
</script>
