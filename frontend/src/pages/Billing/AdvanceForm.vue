<template>
  <AppLayout :title="isNew ? 'Collect Advance' : doc?.patient_name || name" :back-to="{ name: 'BillingAdvanceList' }">
    <!-- Option C: record id under the title, Save at the top right. Patient
    Advance isn't submittable, so the pill only says "Not Saved". -->
    <template #meta>
      <div v-if="doc && (canSave || !isNew)" class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <StatusBadge v-if="canSave" status="Not Saved" />
        <span v-if="!isNew" class="font-mono">{{ doc.name }}</span>
      </div>
    </template>
    <template #actions>
      <template v-if="doc">
        <template v-if="!isNew">
          <button type="button" class="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50" @click="openPrint('Patient Advance', doc.name)">Print Receipt</button>
          <DeleteRecord v-if="perms.delete" :label="doc.name" :busy="busy" @delete="remove" />
        </template>
        <button v-if="canSave" type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save' }}</button>
      </template>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="doc">
      <PatientBar v-if="doc.patient_visit" :name="doc.patient_name" :visit="doc.patient_visit" />

      <!-- Save is at the top now, so what stopped it shows up here too. -->
      <div v-if="saveError || (tried && missing.length)" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <template v-if="saveError">
          <p class="font-semibold">Not saved</p>
          <p class="whitespace-pre-line">{{ saveError }}</p>
        </template>
        <p v-else><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
      </div>

      <form class="flex flex-col gap-5" novalidate @submit.prevent="save">
        <section id="sec-advance" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="wallet">Advance</SubHeading>
          <div :class="GRID">
            <!-- set_query: an advance is only ever for an IP admission -->
            <QueryLink id="pa-visit" label="Patient ID" doctype="Patient Visit" reqd :filters="{ registration_category: 'IP' }" :model-value="doc.patient_visit || ''" :readonly="ro" :error="tried && !doc.patient_visit" @update:model-value="onVisit" />
            <TextField id="pa-name" :model-value="doc.patient_name || ''" label="Patient Name" readonly />
            <TextField id="pa-amount" :model-value="doc.amount ?? ''" type="number" label="Amount" reqd :readonly="ro" @update:model-value="(v) => (doc.amount = v === '' ? null : parseFloat(v))" />
            <SelectField id="pa-mode" v-model="doc.payment_mode" label="Payment Mode" :options="OPTIONS.advance_payment_mode" reqd :readonly="ro" />
          </div>
        </section>
        <section id="sec-receipt" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="notebook-pen">Receipt</SubHeading>
          <div :class="GRID">
            <TextField id="pa-by" :model-value="doc.received_by || ''" label="Received By" readonly />
            <TextField id="pa-on" :model-value="toInput(doc.received_on)" type="datetime-local" label="Received On" :readonly="ro" @update:model-value="(v) => (doc.received_on = fromInput(v))" />
          </div>
          <TextField id="pa-remarks" v-model="doc.remarks" type="textarea" label="Remarks" :readonly="ro" />
        </section>
        <!-- Enter in a field still saves, as before the button moved to the header. -->
        <button v-if="canSave" type="submit" hidden tabindex="-1" aria-hidden="true" />
      </form>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </template>
    <p v-else-if="!loadError" class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import SubHeading from '@/components/SubHeading.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DeleteRecord from '@/components/DeleteRecord.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PatientBar from '@/components/PatientBar.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import QueryLink from '@/components/billing/QueryLink.vue'
import { errorText } from '@/data/api'
import { getMeta } from '@/data/meta'
import { session } from '@/data/session'
import { newDoc, toPayload } from '@/data/formEngine'
import { flt } from '@/data/registrationRules'
import { OPTIONS } from '@/data/billing/rules'
import { getPerms, saveDoc, deleteDoc, openPrint, useFormGuard } from '@/data/billing/docApi'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()

const doc = ref(null)
const perms = ref({})
const snapshot = ref('')
const loadError = ref('')
const saveError = ref('')
const busy = ref(false)
const tried = ref(false)

const isNew = computed(() => props.name === 'new' || !!doc.value?.__islocal)
const ro = computed(() => !(isNew.value ? perms.value.create : perms.value.write))
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
const canSave = computed(() => !ro.value && (isNew.value || dirty.value))
// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'
const missing = computed(() => {
  const d = doc.value
  const m = []
  if (!d) return m
  if (!d.patient_visit) m.push('Patient ID')
  if (d.amount === null || d.amount === undefined || d.amount === '') m.push('Amount')
  if (!d.payment_mode) m.push('Payment Mode')
  return m
})

const toInput = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '')
const fromInput = (v) => (v ? `${v.replace('T', ' ')}:00` : null)

async function load() {
  loadError.value = ''
  saveError.value = ''
  tried.value = false
  try {
    if (props.name === 'new') {
      perms.value = await getPerms('Patient Advance')
      doc.value = newDoc((await getMeta('Patient Advance')).meta, session.user)
      // ?patient_visit=IP-… from Billing's low-advance warning
      if (route.query.patient_visit) await onVisit(route.query.patient_visit)
    } else {
      doc.value = await call('frappe.client.get', { doctype: 'Patient Advance', name: props.name })
      perms.value = await getPerms('Patient Advance', props.name)
    }
    snapshot.value = JSON.stringify(toPayload(doc.value))
  } catch (err) {
    loadError.value = errorText(err) || `Patient Advance ${props.name} could not be opened.`
  }
}

// fetch_from patient_visit.patient_name
async function onVisit(v) {
  doc.value.patient_visit = v
  if (!v) {
    doc.value.patient_name = null
    return
  }
  const r = await call('frappe.client.get_value', { doctype: 'Patient Visit', filters: v, fieldname: 'patient_name' }).catch(() => null)
  if (doc.value.patient_visit === v) doc.value.patient_name = r?.patient_name ?? null
}

async function save() {
  // Ctrl+S reaches both the form guard and the header's Save button in the
  // same keypress; the second call must not start another save.
  if (busy.value) return
  tried.value = true
  saveError.value = ''
  if (missing.value.length) return
  // validate(): message verbatim, checked here too so it shows before the round trip.
  if (flt(doc.value.amount) <= 0) {
    saveError.value = 'Amount must be greater than zero.'
    return
  }
  busy.value = true
  try {
    const wasNew = isNew.value
    doc.value = await saveDoc(doc.value)
    snapshot.value = JSON.stringify(toPayload(doc.value))
    tried.value = false
    if (wasNew) {
      perms.value = await getPerms('Patient Advance', doc.value.name)
      router.replace({ name: 'BillingAdvanceForm', params: { name: doc.value.name } })
    }
  } catch (err) {
    saveError.value = errorText(err) || 'Could not save.'
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await deleteDoc('Patient Advance', doc.value.name)
    snapshot.value = JSON.stringify(toPayload(doc.value))
    router.replace({ name: 'BillingAdvanceList' })
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}

useFormGuard(
  () => dirty.value && !ro.value,
  () => !ro.value && save(),
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
