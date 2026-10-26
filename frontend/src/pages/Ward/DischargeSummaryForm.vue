<template>
  <AppLayout :title="isNew ? 'New discharge summary' : doc?.patient_name || name" :back-to="{ name: 'WardDischargeSummaryList' }">
    <!-- Option C: saved state + id under the title, one Save at the top. -->
    <template v-if="doc" #meta>
      <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="isNew || dirty ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'">{{ isNew ? 'Not saved' : dirty ? 'Unsaved changes' : 'Saved' }}</span>
        <span v-if="!isNew" class="font-mono">{{ name }}</span>
      </div>
    </template>
    <template #actions>
      <router-link v-if="doc?.patient_visit && !isNew" :to="{ name: 'VisitView', params: { name: doc.patient_visit } }" class="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50">Open visit</router-link>
      <template v-if="doc && canWrite && (dirty || isNew)">
        <button type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" @click="discard">{{ isNew ? 'Cancel' : 'Discard' }}</button>
        <button type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
      </template>
    </template>

    <p v-if="loadError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-if="doc" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <PatientBar v-if="doc.patient_visit" :name="doc.patient_name" :age="doc.age" :gender="doc.sex" :visit="doc.patient_visit" :doctor="doc.doctor" />
      <SectionJump :sections="SECTIONS" />

      <p v-if="!canWrite" class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">You can view this discharge summary but not change it.</p>
      <!-- One red block under the patient bar, seen after Save at the top. -->
      <div v-if="saveError || (tried && missing.length)" class="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <div>
          <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
          <template v-else>
            <p class="font-semibold">Please fill these before saving:</p>
            <ul class="list-disc pl-5"><li v-for="m in missing" :key="m">{{ m }}</li></ul>
          </template>
        </div>
        <button v-if="saveError && staleDoc" type="button" class="h-8 shrink-0 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="load">Reload latest</button>
      </div>
      <!-- get_discharge_defaults' refusal (not discharged / bill not paid), shown as soon as the visit is picked -->
      <p v-if="visitWarning" class="whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{{ visitWarning }}</p>
      <p v-if="savedNote" class="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{{ savedNote }}</p>

      <section id="sec-patient" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="user-round">Patient</SubHeading>
        <div :class="GRID">
          <LinkField id="patient_visit" v-model="doc.patient_visit" doctype="Patient Visit" label="Patient Visit" reqd :filters="VISIT_FILTER" :readonly="!canWrite" />
          <TextField id="patient_name" :model-value="doc.patient_name || ''" label="Patient Name" readonly />
          <TextField id="place" v-model="doc.place" label="Place" :readonly="!canWrite" />
          <TextField id="doctor" :model-value="doc.doctor || ''" label="Doctor" readonly />
          <TextField id="sex" :model-value="doc.sex || ''" label="Sex" readonly />
          <TextField id="age" :model-value="doc.age || ''" label="Age" readonly />
          <TextField id="ward" :model-value="doc.ward || ''" label="Ward" readonly />
          <TextField id="admission_date" :model-value="show('Date', doc.admission_date)" label="Admission Date" readonly />
          <TextField id="discharge_date" :model-value="show('Date', doc.discharge_date)" label="Discharge Date" readonly />
        </div>
      </section>

      <section id="sec-clinical" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="notebook-pen">Clinical Summary</SubHeading>
        <div :class="GRID">
          <SelectField id="care_department" v-model="doc.care_department" label="Care" :options="DISCHARGE_OPTIONS.care_department" reqd :readonly="!canWrite" />
          <SelectField id="condition_at_discharge" v-model="doc.condition_at_discharge" label="Discharge Status" :options="DISCHARGE_OPTIONS.condition_at_discharge" reqd :readonly="!canWrite" />
        </div>
        <TextField id="diagnosis_at_discharge" v-model="doc.diagnosis_at_discharge" type="textarea" label="Diagnosis" reqd :readonly="!canWrite" />
        <TextField id="associated_diagnosis" v-model="doc.associated_diagnosis" type="textarea" label="Associated Diagnosis" :readonly="!canWrite" />
        <TextField id="complications" v-model="doc.complications" type="textarea" label="Complications" :readonly="!canWrite" />
        <TextField id="treatment_summary" v-model="doc.treatment_summary" type="textarea" label="Operation/Procedure Performed" :readonly="!canWrite" />
        <TextField id="lab_investigations" v-model="doc.lab_investigations" type="textarea" label="Significant Findings / Lab Investigations" :readonly="!canWrite" />
      </section>

      <section id="sec-medicines" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="pill">Medicines on Discharge</SubHeading>
        <ChildTableEditor v-if="itemMeta" :df="MEDICINES_DF" :rows="doc.medicines_on_discharge" :child-meta="itemMeta" :parent-doc="doc" :readonly="!canWrite" />
      </section>

      <section id="sec-followup" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="calendar-check">Follow-up</SubHeading>
        <TextField id="follow_up_instructions" v-model="doc.follow_up_instructions" type="textarea" label="Follow-up Instructions" :readonly="!canWrite" />
        <div :class="GRID">
          <TextField id="follow_up_date" v-model="doc.follow_up_date" type="date" label="Follow-up Date" :readonly="!canWrite" />
          <TextField v-if="doc.prepared_by" id="prepared_by" :model-value="doc.prepared_by" label="Prepared By" readonly />
        </div>
      </section>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </form>
    <p v-else-if="!loadError" class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import ChildTableEditor from '@/components/ChildTableEditor.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { api, getValue, errorText, VISIT } from '@/data/api'
import { getMeta, formatValue } from '@/data/meta'
import { toPayload } from '@/data/formEngine'
import { DISCHARGE_OPTIONS, prescriptionQty, useUnsavedGuard } from '@/data/ward/rules'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()

// Only discharged IP admissions can have a summary (the server refuses the
// rest), so the picker offers just those.
const VISIT_FILTER = { registration_category: 'IP', admission_status: 'Discharged' }
// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'
const SECTIONS = [
  { id: 'sec-patient', label: 'Patient' },
  { id: 'sec-clinical', label: 'Clinical Summary' },
  { id: 'sec-medicines', label: 'Medicines' },
  { id: 'sec-followup', label: 'Follow-up' },
]
const MEDICINES_DF = { fieldname: 'medicines_on_discharge', label: 'Medicines on Discharge', fieldtype: 'Table', options: 'Prescription Item' }
// fetch_from patient_visit.* : summary field -> visit field
const FROM_VISIT = { patient_name: 'patient_name', doctor: 'doctor_name', sex: 'sex', age: 'age', ward: 'ward', admission_date: 'admission_date', discharge_date: 'discharge_date' }

const doc = ref(null)
const snapshot = ref('')
const perms = ref({})
const itemMeta = ref(null)
const loadError = ref('')
const visitWarning = ref('')

const saving = ref(false)
const tried = ref(false)
const saveError = ref('')
const staleDoc = ref(false)
const savedNote = ref('')

// Rules react to what the user changes, never to the record being loaded.
let ready = false

const isNew = computed(() => props.name === 'new')
const canWrite = computed(() => !!(isNew.value ? perms.value.create : perms.value.write))
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)

function show(fieldtype, v) {
  return v ? formatValue({ fieldtype }, v) : ''
}

// reqd fields, and each medicine row's Medicine and Quantity. Quantity is
// read-only (calculated), so a row missing it really needs Dosage and Duration.
const missing = computed(() => {
  const d = doc.value
  if (!d) return []
  const out = []
  if (!d.patient_visit) out.push('Patient Visit')
  if (!d.care_department) out.push('Care')
  if (!d.diagnosis_at_discharge) out.push('Diagnosis')
  if (!d.condition_at_discharge) out.push('Discharge Status')
  ;(d.medicines_on_discharge || []).forEach((row, i) => {
    if (!row.item) out.push(`Medicines on Discharge row ${i + 1}: Medicine`)
    if (!row.qty) out.push(`Medicines on Discharge row ${i + 1}: Dosage and Duration (for Quantity)`)
  })
  return out
})

function blank() {
  return { doctype: 'Discharge Summary', __islocal: 1, patient_visit: '', patient_name: '', place: '', doctor: '', sex: '', age: '', ward: '', admission_date: null, discharge_date: null, care_department: '', diagnosis_at_discharge: '', associated_diagnosis: '', complications: '', treatment_summary: '', lab_investigations: '', condition_at_discharge: '', medicines_on_discharge: [], follow_up_instructions: '', follow_up_date: null, prepared_by: '' }
}

async function load() {
  ready = false
  loadError.value = ''
  saveError.value = ''
  visitWarning.value = ''
  staleDoc.value = false
  tried.value = false
  try {
    itemMeta.value = (await getMeta('Discharge Summary')).byName['Prescription Item'] || null
    if (isNew.value) {
      setDoc(blank())
      perms.value = (await call('metta.api.get_doc_permissions', { doctype: 'Discharge Summary' })) || {}
    } else {
      const [d, p] = await Promise.all([
        call('frappe.client.get', { doctype: 'Discharge Summary', name: props.name }),
        call('metta.api.get_doc_permissions', { doctype: 'Discharge Summary', name: props.name }),
      ])
      if (!Array.isArray(d.medicines_on_discharge)) d.medicines_on_discharge = []
      setDoc(d)
      perms.value = p || {}
    }
  } catch (err) {
    loadError.value = errorText(err) || `Discharge Summary ${props.name} could not be opened.`
    return
  }
  await nextTick()
  ready = true
  // Opened from a visit's "Discharge Summary" button (?patient_visit=IP-…),
  // like Desk's frappe.new_doc with get_discharge_defaults().
  if (isNew.value && typeof route.query.patient_visit === 'string') doc.value.patient_visit = route.query.patient_visit
}

function setDoc(d) {
  doc.value = d
  snapshot.value = JSON.stringify(toPayload(d))
}

// patient_visit: fetch_from fills the patient fields; the same
// get_discharge_defaults check Desk's button makes warns straight away.
watch(() => doc.value?.patient_visit, async (visit) => {
  if (!ready) return
  visitWarning.value = ''
  const d = doc.value
  if (!visit) {
    for (const f of Object.keys(FROM_VISIT)) d[f] = ['admission_date', 'discharge_date'].includes(f) ? null : ''
    return
  }
  try {
    const v = await getValue('Patient Visit', visit, Object.values(FROM_VISIT))
    if (d.patient_visit !== visit) return
    for (const [f, src] of Object.entries(FROM_VISIT)) d[f] = v?.[src] ?? null
  } catch {
    // The server fetches on save.
  }
  if (!isNew.value) return
  try {
    await api(`${VISIT}.get_discharge_defaults`, { patient_visit: visit })
  } catch (err) {
    if (d.patient_visit === visit) visitWarning.value = errorText(err)
  }
})

// calculate_prescription_qty: Dosage or Duration changed in a row.
watch(
  () => (doc.value?.medicines_on_discharge || []).map((r) => [r.dosage, r.duration]),
  () => {
    for (const row of doc.value?.medicines_on_discharge || []) {
      const qty = prescriptionQty(row.dosage, row.duration)
      if (qty !== null && row.qty !== qty) row.qty = qty
    }
  },
  { deep: true },
)

async function save() {
  if (!canWrite.value || saving.value || (!isNew.value && !dirty.value)) return
  tried.value = true
  saveError.value = ''
  savedNote.value = ''
  if (missing.value.length) return
  saving.value = true
  try {
    const payload = toPayload(doc.value)
    if (isNew.value) {
      const saved = await call('frappe.client.insert', { doc: payload })
      snapshot.value = JSON.stringify(toPayload(doc.value))
      router.replace({ name: 'WardDischargeSummaryForm', params: { name: saved.name } })
      return
    }
    ready = false
    setDoc(await call('frappe.client.save', { doc: payload }))
    tried.value = false
    savedNote.value = 'Saved.'
    await nextTick()
    ready = true
  } catch (err) {
    ready = true
    staleDoc.value = err?.exc_type === 'TimestampMismatchError'
    saveError.value = errorText(err) || 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}

function discard() {
  if (isNew.value) router.push({ name: 'WardDischargeSummaryList' })
  else load()
}

// The same page is reused when "new" becomes the saved name.
watch(() => props.name, load)
useUnsavedGuard(() => canWrite.value && !isNew.value && dirty.value, save)
onMounted(load)
</script>
