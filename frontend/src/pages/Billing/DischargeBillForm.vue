<template>
  <AppLayout :title="isNew ? 'New Discharge Bill' : doc?.patient_name || name" :back-to="{ name: 'BillingDischargeBillList' }">
    <!-- Option C: status and bill id under the title, the one main button
    (Save, then Submit) at the top right with the other actions. -->
    <template #meta>
      <div v-if="doc && pill" class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <StatusBadge :status="pill" />
        <span v-if="!isNew" class="font-mono">{{ doc.name }}</span>
      </div>
    </template>
    <template #actions>
      <template v-if="doc">
        <template v-if="!isNew">
          <button type="button" :class="BTN_PLAIN" :disabled="busy" @click="printBill">Print Bill</button>
          <button v-if="doc.docstatus === 1 && perms.cancel" type="button" :class="BTN_PLAIN" :disabled="busy" @click="cancel">Cancel</button>
          <button v-if="doc.docstatus === 2 && perms.create && hasRole('Billing Staff')" type="button" :class="BTN_PLAIN" @click="amend">Amend</button>
          <button v-if="doc.docstatus === 0 && perms.delete" type="button" class="h-9 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60" :disabled="busy" @click="remove">Delete</button>
        </template>
        <button v-if="mainAction" type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy" @click="mainAction.run">{{ busy ? 'Please wait…' : mainAction.label }}</button>
      </template>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="doc">
    <PatientBar v-if="doc.ip_id" :name="doc.patient_name" :visit="doc.ip_id" :doctor="doc.doctor" />

    <!-- Save is at the top now, so what stopped it shows up here too. -->
    <div v-if="saveError || (tried && !doc.ip_id)" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      <template v-if="saveError">
        <p class="font-semibold">Not saved</p>
        <p class="whitespace-pre-line">{{ saveError }}</p>
      </template>
      <p v-else><span class="font-semibold">Please fill:</span> IP ID</p>
    </div>

    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="flex min-w-0 flex-col gap-5">
        <section id="sec-admission" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="bed-double">Admission</SubHeading>
          <div class="row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6">
            <QueryLink id="db-op" label="OP ID" doctype="Patient Visit" :filters="{ registration_category: 'OP' }" :model-value="doc.op_id || ''" :readonly="ro" @update:model-value="onOpId" />
            <QueryLink id="db-ip" label="IP ID" doctype="Patient Visit" reqd :filters="{ registration_category: 'IP' }" :model-value="doc.ip_id || ''" :readonly="ro" :error="tried && !doc.ip_id" @update:model-value="onIpId" />
            <TextField id="db-name" :model-value="doc.patient_name || ''" label="Patient Name" readonly />
            <TextField id="db-doctor" :model-value="doc.doctor || ''" label="Doctor" readonly />
            <TextField id="db-ward" :model-value="doc.ward || ''" label="Ward" readonly />
            <TextField id="db-adm" :model-value="fmtDate(doc.admission_date)" label="Admission Date" readonly />
            <TextField id="db-dis" :model-value="fmtDate(doc.discharge_date)" label="Discharge Date" readonly />
            <TextField v-if="doc.amended_from" id="db-amend" :model-value="doc.amended_from" label="Amended From" readonly />
          </div>
        </section>

        <section id="sec-items" class="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="receipt-text">Items (All Bills For This Admission)</SubHeading>
          <div class="overflow-x-auto rounded-lg border border-gray-200">
            <table class="w-full text-sm">
              <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th class="px-3 py-2">Bill</th>
                  <th class="px-3 py-2">Date</th>
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2 text-right">Qty</th>
                  <th class="px-3 py-2">UOM</th>
                  <th class="px-3 py-2 text-right">Rate</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!doc.bill_items.length"><td colspan="7" class="px-3 py-5 text-center text-gray-500">No bills yet.</td></tr>
                <tr v-for="(r, i) in doc.bill_items" :key="r.name || i" class="border-t border-gray-100">
                  <td class="px-3 py-2"><router-link :to="{ name: 'BillingForm', params: { name: r.bill } }" class="text-brand-700 hover:underline">{{ r.bill }}</router-link></td>
                  <td class="whitespace-nowrap px-3 py-2 text-gray-600">{{ formatValue({ fieldtype: 'Datetime' }, r.sale_datetime) }}</td>
                  <td class="px-3 py-2">{{ r.item_name }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ r.qty }}</td>
                  <td class="px-3 py-2 text-gray-600">{{ r.uom }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ money(r.rate) }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ money(r.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 lg:sticky lg:top-0">
        <dl class="flex flex-col gap-1.5 text-sm">
          <div class="flex justify-between"><dt class="text-gray-600">Total Billed</dt><dd class="tabular-nums">{{ money(doc.total_billed) }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-600">Advance Paid</dt><dd class="tabular-nums">{{ money(doc.advance_paid) }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-600">Advance Balance</dt><dd class="tabular-nums">{{ money(doc.advance_balance) }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-600">Advance Adjusted</dt><dd class="tabular-nums">{{ money(doc.advance_adjusted) }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-600">Amount Collected</dt><dd class="tabular-nums">{{ money(doc.amount_collected) }}</dd></div>
        </dl>
        <div class="flex items-baseline justify-between border-t border-gray-100 pt-3">
          <span class="font-semibold">Balance Due</span>
          <span class="text-xl font-semibold tabular-nums">{{ money(doc.balance_due) }}</span>
        </div>

      </aside>
    </div>

    <RecordActivity v-if="!isNew" :doc="doc" />
    </template>
    <p v-else-if="!loadError" class="text-gray-600">Loading…</p>

    <PrintPreview :html="printHtml" title="Discharge Bill" :doc-name="doc?.name || ''" @close="printHtml = ''" />
  </AppLayout>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PatientBar from '@/components/PatientBar.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import QueryLink from '@/components/billing/QueryLink.vue'
import PrintPreview from '@/components/billing/PrintPreview.vue'
import { api, errorText } from '@/data/api'
import { getMeta, formatValue } from '@/data/meta'
import { session, hasRole } from '@/data/session'
import { newDoc, fetchTargets, toPayload } from '@/data/formEngine'
import { BILLING, DISCHARGE, money } from '@/data/billing/rules'
import { getPerms, saveDoc, submitDoc, cancelDoc, deleteDoc, amendCopy, statusOf, useFormGuard } from '@/data/billing/docApi'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()

const TOTALS = ['total_billed', 'advance_paid', 'advance_balance', 'advance_adjusted', 'amount_collected', 'balance_due']

const meta = ref(null)
const doc = ref(null)
const perms = ref({})
const snapshot = ref('')
const loadError = ref('')
const saveError = ref('')
const busy = ref(false)
const tried = ref(false)
const printHtml = ref('')

const isNew = computed(() => props.name === 'new' || !!doc.value?.__islocal)
const canWrite = computed(() => (isNew.value ? perms.value.create : perms.value.write))
const ro = computed(() => !doc.value || doc.value.docstatus !== 0 || !canWrite.value)
const status = computed(() => statusOf(doc.value))
// Desk's "Not Saved" while a new or edited draft is waiting for Save.
const pill = computed(() => (doc.value?.docstatus === 0 && (isNew.value || dirty.value) ? 'Not Saved' : status.value))
const BTN_PLAIN = 'h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60'
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
const mainAction = computed(() => {
  const d = doc.value
  if (!d || d.docstatus !== 0) return null
  if (isNew.value || dirty.value) return canWrite.value ? { label: 'Save', run: save } : null
  return perms.value.submit ? { label: 'Submit', run: submit } : null
})

const fmtDate = (v) => (v ? formatValue({ fieldtype: 'Date' }, v) : '')
const takeSnapshot = () => (snapshot.value = JSON.stringify(toPayload(doc.value)))

async function load() {
  loadError.value = ''
  saveError.value = ''
  tried.value = false
  try {
    meta.value = (await getMeta('Discharge Bill')).meta
    if (props.name === 'new') {
      perms.value = await getPerms('Discharge Bill')
      if (route.query.amend) {
        doc.value = await amendCopy('Discharge Bill', route.query.amend)
      } else {
        doc.value = newDoc(meta.value, session.user)
        // ?ip_id=IP-… from Billing's Discharge Bill button
        if (route.query.ip_id) await onIpId(route.query.ip_id)
      }
    } else {
      doc.value = await call('frappe.client.get', { doctype: 'Discharge Bill', name: props.name })
      perms.value = await getPerms('Discharge Bill', props.name)
    }
    takeSnapshot()
  } catch (err) {
    loadError.value = errorText(err) || `Discharge Bill ${props.name} could not be opened.`
  }
}

// op_id: an admitted OP visit fills its IP ID.
async function onOpId(v) {
  doc.value.op_id = v
  if (!v) {
    if (!doc.value.ip_id) await onIpId('')
    return
  }
  const ip = await api(`${BILLING}.get_ip_id_for_op`, { op_id: v }).catch(() => null)
  if (ip && ip !== doc.value.ip_id) await onIpId(ip)
}

// ip_id: fetched visit details, its OP ID, and the compiled preview.
async function onIpId(v) {
  const d = doc.value
  d.ip_id = v
  saveError.value = ''
  await applyFetches(v)
  if (!v) {
    d.bill_items = []
    for (const f of TOTALS) d[f] = 0
    return
  }
  api(`${BILLING}.get_op_id_for_ip`, { ip_id: v })
    .then((op) => op && d.ip_id === v && (d.op_id = op))
    .catch(() => {})
  try {
    const data = await api(`${DISCHARGE}.preview_discharge_bill`, { ip_id: v })
    if (!data || d.ip_id !== v) return
    d.bill_items = data.bill_items.map((r) => ({ ...r }))
    for (const f of TOTALS) d[f] = data[f]
  } catch (err) {
    saveError.value = errorText(err)
  }
}

// fetch_from ip_id.* (patient_name, doctor, ward, admission/discharge date).
async function applyFetches(v) {
  const targets = fetchTargets(meta.value, 'ip_id')
  if (!v) {
    for (const t of targets) doc.value[t.df.fieldname] = null
    return
  }
  const vals = await call('frappe.client.get_value', { doctype: 'Patient Visit', filters: v, fieldname: targets.map((t) => t.source) }).catch(() => null)
  if (doc.value.ip_id !== v) return
  for (const t of targets) doc.value[t.df.fieldname] = vals?.[t.source] ?? null
}

// Print Bill: the "Discharge Bill" Print Format in a dialog with Print.
async function printBill() {
  try {
    printHtml.value = (await api(`${DISCHARGE}.get_print_html`, { discharge_bill: doc.value.name })) || ''
  } catch (err) {
    saveError.value = errorText(err)
  }
}

async function save() {
  // Ctrl+S reaches both the form guard and the header's Save button in the
  // same keypress; the second call must not start another save.
  if (busy.value) return
  tried.value = true
  saveError.value = ''
  if (!doc.value.ip_id) return
  busy.value = true
  try {
    const wasNew = isNew.value
    doc.value = await saveDoc(doc.value)
    takeSnapshot()
    tried.value = false
    if (wasNew) {
      perms.value = await getPerms('Discharge Bill', doc.value.name)
      router.replace({ name: 'BillingDischargeBillForm', params: { name: doc.value.name } })
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
    perms.value = await getPerms('Discharge Bill', doc.value.name)
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
    await cancelDoc('Discharge Bill', doc.value.name)
    await load()
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}

function amend() {
  router.push({ name: 'BillingDischargeBillForm', params: { name: 'new' }, query: { amend: doc.value.name } })
}

async function remove() {
  if (!window.confirm(`Permanently delete ${doc.value.name}?`)) return
  busy.value = true
  try {
    await deleteDoc('Discharge Bill', doc.value.name)
    takeSnapshot()
    router.replace({ name: 'BillingDischargeBillList' })
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}

useFormGuard(
  () => dirty.value && !ro.value,
  () => mainAction.value?.label === 'Save' && save(),
)

watch(
  () => [props.name, route.query.amend],
  () => {
    if (props.name !== 'new' && doc.value?.name === props.name) return
    load()
  },
  { immediate: true },
)
</script>
