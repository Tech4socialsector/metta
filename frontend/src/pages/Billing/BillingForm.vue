<template>
  <AppLayout :title="title" :back-to="{ name: 'BillingList' }">
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
        <button v-for="c in loadButtons" :key="c.label" type="button" :class="BTN_PLAIN" :disabled="busy" @click="c.run">{{ c.label }}</button>
        <button v-if="showDischarge" type="button" :class="BTN_PLAIN" @click="openDischargeBill">Discharge Bill</button>
        <button v-if="!isNew" type="button" :class="BTN_PLAIN" @click="openPrint('Billing', doc.name, 'Billing Receipt')">Print Receipt</button>
        <button v-if="doc.docstatus === 1 && perms.cancel" type="button" :class="BTN_PLAIN" :disabled="busy" @click="cancel">Cancel</button>
        <button v-if="doc.docstatus === 2 && perms.create && hasRole('Billing Staff')" type="button" :class="BTN_PLAIN" @click="amend">Amend</button>
        <DeleteRecord v-if="!isNew && doc.docstatus === 0 && perms.delete" :label="doc.name" :busy="busy" @delete="remove" />
        <button v-if="mainAction" type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy" @click="mainAction.run">{{ busy ? 'Please wait…' : mainAction.label }}</button>
      </template>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>
    <p v-if="notice" class="flex items-start justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
      <span>{{ notice }}</span><button type="button" class="text-blue-800 hover:underline" @click="notice = ''">Dismiss</button>
    </p>

    <template v-if="doc">
    <PatientBar v-if="doc.patient" :name="doc.customer_name" :visit="doc.patient" />
    <SectionJump :sections="sections" />

    <!-- Save is at the top now, so what stopped it shows up here too. -->
    <div v-if="saveError || (tried && missing.length)" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      <template v-if="saveError">
        <p class="font-semibold">Not saved</p>
        <p class="whitespace-pre-line">{{ saveError }}</p>
      </template>
      <p v-else><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
    </div>

    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <!-- Left: patient, then the item sections Bill Type shows -->
      <div class="flex min-w-0 flex-col gap-5">
        <section id="sec-bill" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="receipt-text">Bill details</SubHeading>
          <div class="row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6">
          <QueryLink id="b-op" label="OP ID" doctype="Patient Visit" :query="`${BILLING}.op_id_query`" :model-value="doc.op_id || ''" :readonly="ro" @update:model-value="onOpId" />
          <QueryLink id="b-ip" label="IP ID" doctype="Patient Visit" :query="`${BILLING}.ip_id_query`" :model-value="doc.ip_id || ''" :readonly="ro" @update:model-value="onIpId" />
          <TextField id="b-name" v-model="doc.customer_name" label="Patient Name" :readonly="ro" />
          <SelectField id="b-type" v-model="doc.bill_type" label="Bill Type" :options="OPTIONS.bill_type" reqd :readonly="ro" />
          <QueryLink id="b-cat" label="Billing Category" doctype="Category Price Adjustment" :model-value="doc.billing_category || ''" :readonly="ro" @update:model-value="onBillingCategoryInput" />
          <TextField id="b-when" :model-value="toInput(doc.sale_datetime)" type="datetime-local" label="Sale Date & Time" reqd :readonly="ro" @update:model-value="(v) => (doc.sale_datetime = fromInput(v))" />
          <QueryLink id="b-dc" label="Doctor Consultation" doctype="Doctor Consultation" :model-value="doc.doctor_consultation || ''" :readonly="ro" @update:model-value="(v) => (doc.doctor_consultation = v)" />
          <QueryLink id="b-doc" label="Prescribed By" doctype="Doctor Master" :model-value="doc.prescribed_by || ''" :readonly="ro" @update:model-value="(v) => (doc.prescribed_by = v)" />
          <TextField v-if="doc.amended_from" id="b-amend" :model-value="doc.amended_from" label="Amended From" readonly />
          </div>
        </section>

        <p v-if="!showPharmacy && !showService" class="text-sm text-gray-600">Pick a Bill Type to add items.</p>

        <section v-if="showPharmacy" id="sec-pharmacy" class="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="pill">Pharmacy Items</SubHeading>
          <ItemSearch v-if="!ro" table="pharmacy_items" show-avail @add="(d) => addItem('pharmacy_items', d)" />
          <BillItemsTable id-prefix="ph" :rows="doc.pharmacy_items" :readonly="ro" @change="onRowChange" @remove="(i) => removeRow('pharmacy_items', i)" />
        </section>

        <section v-if="showService" id="sec-service" class="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="hand-heart">Service Items</SubHeading>
          <ItemSearch v-if="!ro" table="service_items" @add="(d) => addItem('service_items', d)" />
          <BillItemsTable id-prefix="sv" :rows="doc.service_items" :readonly="ro" @change="onRowChange" @remove="(i) => removeRow('service_items', i)" />
        </section>
      </div>

      <!-- Right: totals, charity, advance and payment (main button is in the header) -->
      <aside class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 lg:sticky lg:top-0">
        <dl class="flex flex-col gap-1.5 text-sm">
          <div class="flex justify-between"><dt class="text-gray-600">Total Pharmacy Amount</dt><dd class="tabular-nums">{{ money(doc.total_pharmacy_amount) }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-600">Total Service Amount</dt><dd class="tabular-nums">{{ money(doc.total_service_amount) }}</dd></div>
          <div class="flex justify-between font-medium"><dt>Net Amount</dt><dd class="tabular-nums">{{ money(doc.net_amount) }}</dd></div>
        </dl>

        <div class="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
          <div class="col-span-2">
            <label for="b-scope" class="ctl-label mb-1 block">{{ labels.scope }}</label>
            <select id="b-scope" :value="doc.charity_scope" :disabled="ro" class="ctl disabled:bg-gray-50" @change="doc.charity_scope = $event.target.value; calc()">
              <option v-for="o in OPTIONS.charity_scope" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div>
            <label for="b-cpct" class="ctl-label mb-1 block">{{ labels.percent }}</label>
            <input id="b-cpct" type="number" step="any" min="0" :value="doc.charity_percent" :readonly="ro" class="ctl text-right tabular-nums read-only:bg-gray-50" @change="onCharityPercent($event.target.value)" />
          </div>
          <div>
            <label for="b-camt" class="ctl-label mb-1 block">{{ labels.amount }}</label>
            <input id="b-camt" type="number" step="any" min="0" :value="doc.charity_amount" :readonly="ro" class="ctl text-right tabular-nums read-only:bg-gray-50" @change="onCharityAmount($event.target.value)" />
          </div>
        </div>

        <div class="flex items-baseline justify-between border-t border-gray-100 pt-3">
          <span class="font-semibold">Payable Amount</span>
          <span class="text-xl font-semibold tabular-nums">{{ money(doc.payable_amount) }}</span>
        </div>

        <!-- Advance: IP only -->
        <div v-if="isIP" class="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 text-sm">
          <div class="flex justify-between"><span class="text-gray-600">Advance Collected</span><span class="tabular-nums">{{ money(doc.advance_collected) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-600">Advance Used</span><span class="tabular-nums">{{ money(doc.advance_used) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-600">Advance Available</span><span class="tabular-nums">{{ money(doc.advance_available) }}</span></div>
          <p v-if="lowWarning" class="font-semibold text-red-700">
            {{ lowWarning }}
          </p>
          <div>
            <div class="mb-1 flex items-center justify-between">
              <label for="b-adv" class="ctl-label">Advance Adjusted</label>
              <button v-if="canAutoApply" type="button" class="text-xs font-semibold text-brand-700 hover:underline" @click="autoApplyAdvance">Auto-apply Advance</button>
            </div>
            <input id="b-adv" type="number" step="any" min="0" :value="doc.advance_adjusted" :readonly="ro" class="ctl text-right tabular-nums read-only:bg-gray-50" @change="onAdvanceAdjusted($event.target.value)" />
          </div>
          <div class="flex justify-between font-medium"><span>Amount Due</span><span class="tabular-nums">{{ money(doc.amount_due) }}</span></div>
        </div>

        <div class="flex flex-col gap-3">
          <div>
            <label for="b-coll" class="ctl-label mb-1 block">Amount Collected Now</label>
            <input id="b-coll" type="number" step="any" min="0" :value="doc.amount_collected" :readonly="ro" class="ctl text-right tabular-nums read-only:bg-gray-50" @change="doc.amount_collected = toNum($event.target.value)" />
          </div>
          <div v-if="flt(doc.payable_amount) > 0">
            <label for="b-mode" class="ctl-label mb-1 block">Payment Mode</label>
            <select id="b-mode" :value="doc.payment_mode || ''" :disabled="ro" class="ctl disabled:bg-gray-50" @change="doc.payment_mode = $event.target.value; calc()">
              <option v-for="o in OPTIONS.payment_mode" :key="o" :value="o">{{ o || '—' }}</option>
            </select>
          </div>
          <QueryLink v-if="doc.payment_mode === 'Credit - Corporate'" id="b-corp" label="Corporate Customer" doctype="Corporate Customer" reqd compact :model-value="doc.corporate_customer || ''" :readonly="ro" :error="tried && !doc.corporate_customer" @update:model-value="(v) => (doc.corporate_customer = v)" />
        </div>

      </aside>
    </div>

    <RecordActivity v-if="!isNew" :doc="doc" />
    </template>
    <p v-else-if="!loadError" class="text-gray-600">Loading…</p>

    <!-- offer_pending_consultations: more than one waiting -->
    <AppDialog v-model="pickOpen" title="Which consultation?">
      <SelectField id="b-pick" v-model="picked" label="Consultation" :options="consultations.map(optionFor)" />
      <template #footer>
        <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" @click="pickOpen = false; loadConsultation(picked.split(' - ')[0])">Load</button>
      </template>
    </AppDialog>
  </AppLayout>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DeleteRecord from '@/components/DeleteRecord.vue'
import SubHeading from '@/components/SubHeading.vue'
import AppDialog from '@/components/AppDialog.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import QueryLink from '@/components/billing/QueryLink.vue'
import ItemSearch from '@/components/billing/ItemSearch.vue'
import BillItemsTable from '@/components/billing/BillItemsTable.vue'
import { api, errorText } from '@/data/api'
import { getMeta, formatValue } from '@/data/meta'
import { session, hasRole } from '@/data/session'
import { newDoc, fetchTargets, toPayload } from '@/data/formEngine'
import { flt } from '@/data/registrationRules'
import { BILLING, ADVANCE, SLE, OPTIONS, money, isStockRow, adjustmentTypeOf, charityLabels, calculateTotals, setAdvanceFields, lowAdvanceWarning, ensureBillTypeIncludes, billingMissing } from '@/data/billing/rules'
import { getPerms, saveDoc, submitDoc, cancelDoc, deleteDoc, amendCopy, statusOf, openPrint, useFormGuard } from '@/data/billing/docApi'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()

const meta = ref(null)
const doc = ref(null)
const perms = ref({})
// frm._category_adjustment / frm._advance_balance in billing.js
const state = reactive({ adjustment: null, advanceBalance: null })
const consultations = ref([])
const showDischarge = ref(false)
const snapshot = ref('')
const loadError = ref('')
const saveError = ref('')
const notice = ref('')
const busy = ref(false)
const tried = ref(false)
const pickOpen = ref(false)
const picked = ref('')

const isNew = computed(() => props.name === 'new' || !!doc.value?.__islocal)
const canWrite = computed(() => (isNew.value ? perms.value.create : perms.value.write))
const ro = computed(() => !doc.value || doc.value.docstatus !== 0 || !canWrite.value)
const isIP = computed(() => doc.value?.registration_category === 'IP')
const status = computed(() => statusOf(doc.value))
// Desk's "Not Saved" while a new or edited draft is waiting for Save.
const pill = computed(() => (doc.value?.docstatus === 0 && (isNew.value || dirty.value) ? 'Not Saved' : status.value))
const BTN_PLAIN = 'h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60'
// Chips only for the item sections Bill Type shows.
const sections = computed(() => [
  { id: 'sec-bill', label: 'Bill details' },
  ...(showPharmacy.value ? [{ id: 'sec-pharmacy', label: 'Pharmacy Items' }] : []),
  ...(showService.value ? [{ id: 'sec-service', label: 'Service Items' }] : []),
])
const title = computed(() => (isNew.value ? 'New Bill' : doc.value?.customer_name || props.name))
const showPharmacy = computed(() => ['Pharmacy', 'Mixed'].includes(doc.value?.bill_type))
const showService = computed(() => ['Service', 'Mixed'].includes(doc.value?.bill_type))
// A draft follows the live category; a submitted bill keeps what it stored.
const labels = computed(() => charityLabels(doc.value?.docstatus === 0 ? adjustmentTypeOf(state.adjustment) : doc.value?.adjustment_type))
const lowWarning = computed(() => lowAdvanceWarning(state))
const canAutoApply = computed(() => !ro.value && state.advanceBalance && flt(state.advanceBalance.balance) > 0)
const missing = computed(() => (doc.value ? billingMissing(doc.value) : []))
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)

// Desk shows Save while there's something to save, then Submit.
const mainAction = computed(() => {
  if (!doc.value || doc.value.docstatus !== 0) return null
  if (isNew.value || dirty.value) return canWrite.value ? { label: 'Save', run: save } : null
  return perms.value.submit ? { label: 'Submit', run: submit } : null
})
// offer_pending_consultations: one consultation loads straight away,
// several open a picker.
const loadButtons = computed(() => {
  if (ro.value || doc.value?.doctor_consultation || !consultations.value.length) return []
  if (consultations.value.length === 1) {
    const c = consultations.value[0]
    return [{ label: `Load Prescribed Items (${c.name})`, run: () => loadConsultation(c.name) }]
  }
  return [{ label: 'Load Prescribed Items...', run: openPicker }]
})

const toInput = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '')
const fromInput = (v) => (v ? `${v.replace('T', ' ')}:00` : null)
const toNum = (v) => (v === '' ? null : parseFloat(v))
const excludeBilling = () => (isNew.value ? null : doc.value.name)
const takeSnapshot = () => (snapshot.value = JSON.stringify(toPayload(doc.value)))
// Desk's add_child defaults for a Sales Bill Item row.
const newRow = (data) => ({ qty: 1, conversion_factor: 1, ...data })

function calc() {
  if (doc.value) calculateTotals(doc.value, state)
}

// ---------- load (Desk: onload + refresh) ----------
async function load() {
  loadError.value = ''
  saveError.value = ''
  notice.value = ''
  tried.value = false
  consultations.value = []
  showDischarge.value = false
  state.adjustment = null
  state.advanceBalance = null
  try {
    meta.value = (await getMeta('Billing')).meta
    if (props.name === 'new') {
      perms.value = await getPerms('Billing')
      doc.value = route.query.amend ? await amendCopy('Billing', route.query.amend) : newDoc(meta.value, session.user)
      if (!route.query.amend) await applyQuery()
    } else {
      doc.value = await call('frappe.client.get', { doctype: 'Billing', name: props.name })
      perms.value = await getPerms('Billing', props.name)
    }
    await refresh()
  } catch (err) {
    loadError.value = errorText(err) || `Billing ${props.name} could not be opened.`
  }
}

// Prefill from the address, like Desk's frappe.new_doc("Billing", {...}).
async function applyQuery() {
  const q = route.query
  try {
    if (q.doctor_consultation) {
      const data = await api(`${BILLING}.get_billing_items_for_consultation`, { consultation: q.doctor_consultation })
      doc.value.doctor_consultation = q.doctor_consultation
      await setPatient(data.patient)
      inferVisitIds()
      await applyConsultation(q.doctor_consultation, data)
    } else if (q.ip_id) {
      await onIpId(q.ip_id)
    } else if (q.op_id) {
      await onOpId(q.op_id)
    } else if (q.patient) {
      await setPatient(q.patient)
      inferVisitIds()
    }
  } catch (err) {
    saveError.value = errorText(err)
  }
}

// refresh (billing.js)
async function refresh() {
  const d = doc.value
  inferVisitIds()
  if (d.docstatus === 0 && d.billing_category && !state.adjustment) {
    state.adjustment = (await api(`${BILLING}.get_category_adjustment`, { billing_category: d.billing_category })) || null
  }
  if (d.patient && !state.advanceBalance) {
    state.advanceBalance = (await api(`${ADVANCE}.get_advance_balance`, { patient_visit: d.patient, exclude_billing: excludeBilling() })) || null
  }
  setAdvanceFields(d, state)
  calc()
  // The Discharge Bill button only once the IP admission is Discharged.
  if (!isNew.value && d.registration_category === 'IP') {
    showDischarge.value = !!(await api(`${BILLING}.is_ip_discharged`, { patient_visit: d.patient }))
  }
  // Taken after the recompute, so opening a bill never shows it as edited.
  takeSnapshot()
}

// An older bill only has `patient` - put it in the right box.
function inferVisitIds() {
  const d = doc.value
  if (!d.patient || d.op_id || d.ip_id) return
  if (d.registration_category === 'IP') {
    d.ip_id = d.patient
    call('frappe.client.get_value', { doctype: 'Patient Visit', filters: d.patient, fieldname: 'converted_from_registration' })
      .then((r) => {
        if (r?.converted_from_registration && !d.op_id) d.op_id = r.converted_from_registration
      })
      .catch(() => {})
  } else {
    d.op_id = d.patient
  }
}

// ---------- OP ID / IP ID / patient ----------
// op_id: an admitted OP visit brings its IP ID; `patient` follows whichever applies.
async function onOpId(v) {
  const d = doc.value
  d.op_id = v
  if (!v) {
    if (!d.ip_id) await setPatient('')
    return
  }
  const ip = await api(`${BILLING}.get_ip_id_for_op`, { op_id: v }).catch(() => null)
  if (ip) {
    d.ip_id = ip
    await setPatient(ip)
  } else {
    await setPatient(v)
  }
}

// ip_id: the common IP case - still shows the OP visit it came from.
async function onIpId(v) {
  const d = doc.value
  d.ip_id = v
  if (!v) {
    await setPatient(d.op_id || '')
    return
  }
  await setPatient(v)
  const op = await api(`${BILLING}.get_op_id_for_ip`, { ip_id: v }).catch(() => null)
  if (op) d.op_id = op
}

async function setPatient(v) {
  v = v || ''
  if ((doc.value.patient || '') === v) return
  doc.value.patient = v
  await applyPatientFetches(v)
  await onPatient()
}

// fetch_from patient.* (registration_category, billing_category,
// charity_percent if empty, corporate_customer, prescribed_by).
async function applyPatientFetches(v) {
  const d = doc.value
  const targets = fetchTargets(meta.value, 'patient')
  const before = d.billing_category || ''
  if (!v) {
    for (const t of targets) if (!t.df.fetch_if_empty) d[t.df.fieldname] = null
  } else {
    try {
      const vals = await call('frappe.client.get_value', { doctype: 'Patient Visit', filters: v, fieldname: targets.map((t) => t.source) })
      if (d.patient !== v) return
      for (const t of targets) {
        if (t.df.fetch_if_empty && d[t.df.fieldname]) continue
        d[t.df.fieldname] = vals?.[t.source] ?? null
      }
    } catch {
      // the server fills fetched values on save
    }
  }
  if ((d.billing_category || '') !== before) await onBillingCategory()
}

// patient (billing.js)
async function onPatient() {
  const d = doc.value
  consultations.value = []
  showDischarge.value = false
  state.advanceBalance = null
  // A typed Advance Adjusted was for the previous patient.
  d.advance_adjusted_is_manual = 0
  if (!d.patient) {
    d.customer_name = ''
    setAdvanceFields(d, state)
    calc()
    return
  }
  const p = d.patient
  const still = () => doc.value.patient === p
  await Promise.all([
    api(`${BILLING}.get_patient_name`, { patient: p }).then((n) => still() && (d.customer_name = n || '')),
    offerPendingConsultations(),
    addAdmissionChargeIfDue(),
    suggestRegistrationCharity(),
    api(`${ADVANCE}.get_advance_balance`, { patient_visit: p, exclude_billing: excludeBilling() }).then((b) => {
      if (!still()) return
      state.advanceBalance = b || null
      setAdvanceFields(d, state)
      calc()
    }),
  ]).catch((err) => (saveError.value = errorText(err)))
}

// billing_category: back to the category's own percent; a corporate
// patient's bill is suggested onto their employer's credit.
async function onBillingCategory() {
  const d = doc.value
  d.charity_amount_is_manual = 0
  if (!d.billing_category) {
    state.adjustment = null
    calc()
    return
  }
  state.adjustment = (await api(`${BILLING}.get_category_adjustment`, { billing_category: d.billing_category }).catch(() => null)) || null
  if (d.corporate_customer && !d.payment_mode) d.payment_mode = 'Credit - Corporate'
  calc()
}
function onBillingCategoryInput(v) {
  doc.value.billing_category = v
  onBillingCategory()
}

async function offerPendingConsultations() {
  if (doc.value.doctor_consultation) return
  const list = (await api(`${BILLING}.get_unbilled_consultations_for_patient`, { patient: doc.value.patient })) || []
  consultations.value = list
}
function optionFor(c) {
  return `${c.name} - ${formatValue({ fieldtype: 'Datetime' }, c.consultation_datetime)} - ${c.doctor}`
}
function openPicker() {
  picked.value = optionFor(consultations.value[0])
  pickOpen.value = true
}

// load_consultation_items
async function loadConsultation(name) {
  if (doc.value.doctor_consultation) return
  busy.value = true
  try {
    const data = await api(`${BILLING}.get_billing_items_for_consultation`, { consultation: name })
    if (data) await applyConsultation(name, data)
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}
async function applyConsultation(name, data) {
  const d = doc.value
  d.doctor_consultation = name
  d.prescribed_by = data.doctor
  if ((d.billing_category || '') !== (data.billing_category || '')) {
    d.billing_category = data.billing_category
    await onBillingCategory()
  }
  d.pharmacy_items = (d.pharmacy_items || []).filter((r) => r.item)
  d.service_items = (d.service_items || []).filter((r) => r.item)
  const fill = (i) => newRow({ item: i.item, item_name: i.item_name, item_type: i.item_type, qty: i.qty, uom: i.uom, rate: i.rate, gst_percent: i.gst_percent, amount: i.amount, batch_no: i.batch_no })
  data.pharmacy_items.forEach((i) => d.pharmacy_items.push(fill(i)))
  data.service_items.forEach((i) => d.service_items.push(fill(i)))
  if (data.pharmacy_items.length) ensureBillTypeIncludes(d, 'Pharmacy')
  if (data.service_items.length) ensureBillTypeIncludes(d, 'Service')
  consultations.value = []
  calc()
}

// add_admission_charge_if_due: a flat charge once per IP admission.
async function addAdmissionChargeIfDue() {
  const row = await api(`${BILLING}.get_admission_charge_row`, { patient: doc.value.patient })
  if (!row) return
  ensureBillTypeIncludes(doc.value, 'Service')
  doc.value.service_items.push(newRow(row))
  calc()
}

// suggest_registration_charity: a General patient's registered charity
// amount, only if nothing is typed yet - it then counts as typed.
async function suggestRegistrationCharity() {
  if (flt(doc.value.charity_amount)) return
  const suggested = flt(await api(`${BILLING}.get_registration_charity_amount`, { patient: doc.value.patient }))
  if (suggested && !flt(doc.value.charity_amount)) onCharityAmount(suggested)
}

// ---------- charity / advance inputs ----------
function onCharityPercent(v) {
  doc.value.charity_percent = toNum(v)
  calc()
}
// A typed amount overrides the percentage; clearing it goes back to %.
function onCharityAmount(v) {
  doc.value.charity_amount = toNum(v)
  doc.value.charity_amount_is_manual = flt(doc.value.charity_amount) ? 1 : 0
  calc()
}
// A typed figure stops auto-apply from overriding it.
function onAdvanceAdjusted(v) {
  doc.value.advance_adjusted = toNum(v)
  doc.value.advance_adjusted_is_manual = 1
  calc()
}
// add_advance_button: back to the automatic amount, with a fresh balance.
async function autoApplyAdvance() {
  try {
    state.advanceBalance = (await api(`${ADVANCE}.get_advance_balance`, { patient_visit: doc.value.patient, exclude_billing: excludeBilling() })) || null
    doc.value.advance_adjusted_is_manual = 0
    setAdvanceFields(doc.value, state)
    calc()
  } catch (err) {
    saveError.value = errorText(err)
  }
}

// ---------- item rows ----------
async function addItem(table, data) {
  const row = newRow(data)
  doc.value[table].push(row)
  calc()
  // Batched stock can span several batches - re-resolve via full allocation.
  if (isStockRow(row)) {
    row.batch_no = ''
    await maybeAllocateBatches(table, row)
  }
}

function removeRow(table, i) {
  doc.value[table].splice(i, 1)
  calc()
}

// Sales Bill Item handlers: qty, rate, batch_no.
async function onRowChange(row, field) {
  if (field === 'qty') {
    calc()
    await maybeAllocateBatches(row.parentfield || tableOf(row), row)
  } else if (field === 'rate') {
    calc()
  } else if (field === 'batch_no' && row.batch_no) {
    // A hand-picked batch brings its own selling rate.
    const r = await call('frappe.client.get_value', { doctype: 'Batch', filters: row.batch_no, fieldname: 'selling_rate' }).catch(() => null)
    row.rate = flt(r?.selling_rate)
    calc()
  }
}
function tableOf(row) {
  return doc.value.service_items.includes(row) ? 'service_items' : 'pharmacy_items'
}

// maybe_allocate_batches + allocate_batches_for_row: FEFO across batches,
// splitting into extra rows when one batch isn't enough.
async function maybeAllocateBatches(table, row) {
  if (!row.item || !row.qty || flt(row.qty) <= 0 || row.batch_no) return
  let warehouse = doc.value.warehouse
  if (!warehouse) {
    const rows = await call('frappe.client.get_list', { doctype: 'Warehouse', filters: { warehouse_type: 'Pharmacy', is_active: 1 }, fields: ['name'], limit_page_length: 1 }).catch(() => [])
    warehouse = rows?.[0]?.name
  }
  if (!warehouse || row.batch_no) return
  let allocations
  try {
    allocations = (await api(`${SLE}.allocate_batches_for_qty`, { item: row.item, warehouse, qty_needed: row.qty })) || []
  } catch (err) {
    saveError.value = errorText(err)
    return
  }
  if (!allocations.length) return
  const [first, ...rest] = allocations
  row.batch_no = first.batch
  row.qty = first.qty
  row.rate = first.rate
  if (rest.length) {
    for (const a of rest) {
      doc.value[table].push(newRow({ item: row.item, item_name: row.item_name, item_type: row.item_type, uom: row.uom, gst_percent: row.gst_percent, batch_no: a.batch, qty: a.qty, rate: a.rate }))
    }
    const summary = allocations.map((a) => `${a.qty} @ ${money(a.rate)} (${a.batch})`).join(', ')
    notice.value = `${row.item} split across ${allocations.length} batches - ${summary}`
  }
  calc()
}

// ---------- discharge bill ----------
async function openDischargeBill() {
  const r = await call('frappe.client.get_value', { doctype: 'Discharge Bill', filters: { ip_id: doc.value.patient, docstatus: ['!=', 2] }, fieldname: 'name' }).catch(() => null)
  if (r?.name) router.push({ name: 'BillingDischargeBillForm', params: { name: r.name } })
  else router.push({ name: 'BillingDischargeBillForm', params: { name: 'new' }, query: { ip_id: doc.value.patient } })
}

// ---------- save / submit / cancel ----------
async function save() {
  // Ctrl+S reaches both the form guard and the header's Save button in the
  // same keypress; the second call must not start another save.
  if (busy.value) return
  tried.value = true
  saveError.value = ''
  if (missing.value.length) return
  busy.value = true
  try {
    const wasNew = isNew.value
    doc.value = await saveDoc(doc.value)
    tried.value = false
    if (wasNew) {
      perms.value = await getPerms('Billing', doc.value.name)
      router.replace({ name: 'BillingForm', params: { name: doc.value.name } })
    }
    // Snapshot the saved doc first, then recalculate: anything the refresh
    // recalculation changes (e.g. advance auto-apply) shows as unsaved, as
    // Desk's "Not Saved" does, instead of going to Submit unseen.
    takeSnapshot()
    calc()
    if (doc.value.registration_category === 'IP') showDischarge.value = !!(await api(`${BILLING}.is_ip_discharged`, { patient_visit: doc.value.patient }))
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
    perms.value = await getPerms('Billing', doc.value.name)
    setAdvanceFields(doc.value, state)
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
    await cancelDoc('Billing', doc.value.name)
    await load()
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}

function amend() {
  router.push({ name: 'BillingForm', params: { name: 'new' }, query: { amend: doc.value.name } })
}

async function remove() {
  busy.value = true
  try {
    await deleteDoc('Billing', doc.value.name)
    takeSnapshot()
    router.replace({ name: 'BillingList' })
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

// Same screen for /billing/new and /billing/<name>: reload when the address
// points at a different bill (not right after this form saved it).
watch(
  () => [props.name, route.query.amend],
  () => {
    if (props.name !== 'new' && doc.value?.name === props.name) return
    load()
  },
  { immediate: true },
)
</script>
