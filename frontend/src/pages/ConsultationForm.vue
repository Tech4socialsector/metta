<template>
  <AppLayout :title="isNew ? 'New consultation' : doc.patient_name || name" :back-to="{ name: 'DoctorDashboard' }">
    <!-- Option C: the record's state and id under the title, one Save at the top. -->
    <template v-if="ready" #meta>
      <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="isNew ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'">{{ isNew ? 'Not saved' : 'Saved' }}</span>
        <span v-if="!isNew" class="font-mono">{{ name }}</span>
      </div>
    </template>
    <template #actions>
      <template v-if="!isNew && doc.name">
        <button type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50" :disabled="busy" @click="printPrescription">Print Prescription</button>
        <button v-if="doc.suggested_tests.length && canOrderTests" type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50" :disabled="busy" @click="orderTests">Order Diagnostic Tests</button>
        <router-link v-if="doc.suggested_tests.length && canEdit" :to="{ name: 'ConsultationForm', params: { name: 'new' }, query: { visit: doc.patient_consultation } }" class="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">Follow-up Consultation</router-link>
        <!-- Billing is not in the Vue app yet: its Bill button is on the Desk form. -->
        <a v-if="canBill" :href="`/desk/doctor-consultation/${doc.name}`" class="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">Bill (Desk)</a>
      </template>
      <button v-if="canEdit && ready" type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save' }}</button>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="ready">
      <PatientBar :name="doc.patient_name" :age="visitInfo.age" :gender="visitInfo.sex" :uhin="visitInfo.uhin_id" :visit="doc.patient_consultation" :doctor="doc.doctor" />
      <SectionJump :sections="SECTIONS" />

      <!-- One red block under the patient bar, so it is seen after Save at the top. -->
      <div v-if="saveError || (tried && missing.length)" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
        <template v-else>
          <p class="font-semibold">Please fill these before saving:</p>
          <ul class="list-disc pl-5"><li v-for="m in missing" :key="m">{{ m }}</li></ul>
        </template>
      </div>
      <p v-if="message" class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{{ message }}</p>

      <!-- Visit / patient / doctor / time -->
      <section id="sec-consultation" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="stethoscope">Consultation</SubHeading>
        <div :class="GRID">
          <LinkField id="dc-visit" v-model="doc.patient_consultation" doctype="Patient Visit" label="Visit" reqd :readonly="!canEdit || !isNew" />
          <TextField id="dc-patient" :model-value="doc.patient_name || ''" label="Patient Name" readonly />
          <LinkField id="dc-doctor" v-model="doc.doctor" doctype="Doctor Master" label="Doctor" reqd :readonly="!canEdit" />
          <TextField id="dc-when" :model-value="toInput(doc.consultation_datetime)" type="datetime-local" label="Consultation Date Time" reqd :readonly="!canEdit" @update:model-value="(v) => (doc.consultation_datetime = fromInput(v))" />
        </div>
      </section>

      <div v-if="doc.patient_consultation" id="sec-vitals" class="scroll-mt-4">
        <VitalsCard :visit="doc.patient_consultation" />
      </div>

      <section id="sec-notes" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="notebook-pen">Diagnosis and notes</SubHeading>
        <TextField id="dc-diagnosis" v-model="doc.diagnosis" type="textarea" label="Diagnosis" :readonly="!canEdit" />
        <TextField id="dc-notes" v-model="doc.clinical_notes" type="textarea" label="Clinical Notes" :readonly="!canEdit" />
      </section>

      <!-- Prescription: search in-stock medicine, pick dosage, add -->
      <section id="sec-rx" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="pill">Prescription</SubHeading>
        <div v-if="canEdit" class="flex flex-wrap items-end gap-3">
          <div class="relative min-w-[260px] flex-[2_1_300px]">
            <label for="rx-search" class="ctl-label mb-1 block">Medicine Name</label>
            <input id="rx-search" v-model="rxTerm" type="search" autocomplete="off" placeholder="Search medicine in stock..." class="ctl" @focus="rxOpen = true; searchRx()" @input="searchRxSoon" @blur="rxOpen = false" />
            <div v-if="rxOpen" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg" @mousedown.prevent>
              <p v-if="!rxResults.length" class="px-3 py-2 text-sm text-gray-500">No matches in stock</p>
              <table v-else class="w-full text-sm">
                <thead class="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th class="px-3 py-1.5">Name</th><th class="px-3 py-1.5 text-right">Avail. Qty</th><th class="px-3 py-1.5">Warehouse</th></tr></thead>
                <tbody>
                  <tr v-for="r in rxResults" :key="r.item_code" class="cursor-pointer hover:bg-brand-50" @click="pickRx(r)">
                    <td class="px-3 py-1.5">{{ r.item_name }}</td><td class="px-3 py-1.5 text-right">{{ r.avail_qty }}</td><td class="px-3 py-1.5 text-gray-600">{{ r.warehouse }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="rxPicked" class="mt-1 text-xs text-gray-600">Selected: {{ rxPicked.item_name }} ({{ rxPicked.avail_qty }}) - Warehouse: {{ rxPicked.warehouse }}</p>
          </div>
          <div class="w-36">
            <label for="rx-dosage" class="ctl-label mb-1 block">Dosage</label>
            <select id="rx-dosage" v-model="rxDosage" class="ctl"><option v-for="d in DOSAGES" :key="d" :value="d">{{ d || '—' }}</option></select>
          </div>
          <button type="button" class="h-10 rounded-lg border border-gray-300 bg-white px-5 font-semibold text-brand-800 hover:bg-gray-50" @click="addRx">Add</button>
          <p v-if="rxError" class="basis-full text-sm text-red-700">{{ rxError }}</p>
        </div>
        <div class="overflow-x-auto rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th class="px-3 py-2">Medicine</th><th class="px-3 py-2">Dosage</th><th class="px-3 py-2">Duration (Days)</th><th class="px-3 py-2 text-right">Quantity</th><th class="px-3 py-2">Instructions</th><th class="w-10 px-3 py-2"><span class="sr-only">Remove</span></th></tr>
            </thead>
            <tbody>
              <tr v-if="!doc.prescribed_items.length"><td colspan="6" class="px-3 py-5 text-center text-gray-500">No medicines yet.</td></tr>
              <tr v-for="(row, i) in doc.prescribed_items" :key="i" class="border-b border-gray-100 last:border-0">
                <td class="px-3 py-2 font-medium">{{ row.item_name || row.item }}</td>
                <td class="px-3 py-2">
                  <select v-model="row.dosage" :disabled="!canEdit" :aria-label="`Dosage for ${row.item_name}`" class="ctl w-auto" @change="calcQty(row)"><option v-for="d in DOSAGES" :key="d" :value="d">{{ d || '—' }}</option></select>
                </td>
                <td class="px-3 py-2"><input v-model.number="row.duration" type="number" min="1" step="1" :readonly="!canEdit" :aria-label="`Days for ${row.item_name}`" class="ctl w-24" @input="calcQty(row)" /></td>
                <td class="px-3 py-2 text-right font-semibold">{{ row.qty || 0 }}</td>
                <td class="px-3 py-2"><input v-model="row.instructions" type="text" :readonly="!canEdit" :aria-label="`Instructions for ${row.item_name}`" placeholder="e.g. after food" class="ctl min-w-[160px]" /></td>
                <td class="px-3 py-2"><button v-if="canEdit" type="button" class="rounded p-1 text-red-600 hover:bg-red-50" :aria-label="`Remove ${row.item_name}`" @click="doc.prescribed_items.splice(i, 1)"><LucideIcon name="trash-2" class="h-4 w-4" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Suggested investigations -->
      <section id="sec-tests" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="flask-conical">Suggested Investigations</SubHeading>
        <div v-if="canEdit" class="flex flex-wrap items-end gap-3">
          <div class="relative min-w-[260px] flex-[2_1_300px]">
            <label for="test-search" class="ctl-label mb-1 block">Test / Investigation</label>
            <input id="test-search" v-model="testTerm" type="search" autocomplete="off" placeholder="Search a test / investigation..." class="ctl" @focus="testOpen = true; searchTests()" @input="searchTestsSoon" @blur="testOpen = false" />
            <div v-if="testOpen" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg" @mousedown.prevent>
              <p v-if="!testResults.length" class="px-3 py-2 text-sm text-gray-500">No matching test/service found</p>
              <button v-for="r in testResults" :key="r.item_code" type="button" class="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-brand-50" @click="pickTest(r)">{{ r.item_name }}</button>
            </div>
          </div>
          <div class="w-40">
            <label for="test-type" class="ctl-label mb-1 block">Type</label>
            <select id="test-type" v-model="testType" class="ctl"><option value="">Type</option><option v-for="t in TEST_TYPES" :key="t" :value="t">{{ t }}</option></select>
          </div>
          <button type="button" class="h-10 rounded-lg border border-gray-300 bg-white px-5 font-semibold text-brand-800 hover:bg-gray-50" @click="addTest">Add</button>
          <p v-if="testError" class="basis-full text-sm text-red-700">{{ testError }}</p>
        </div>
        <div class="overflow-x-auto rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th class="px-3 py-2">Test / Investigation</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Remarks</th><th class="w-10 px-3 py-2"><span class="sr-only">Remove</span></th></tr>
            </thead>
            <tbody>
              <tr v-if="!doc.suggested_tests.length"><td colspan="4" class="px-3 py-5 text-center text-gray-500">No tests yet.</td></tr>
              <tr v-for="(row, i) in doc.suggested_tests" :key="i" class="border-b border-gray-100 last:border-0">
                <td class="px-3 py-2 font-medium">{{ row.item_name || row.item }}</td>
                <td class="px-3 py-2"><select v-model="row.test_type" :disabled="!canEdit" :aria-label="`Type of ${row.item_name}`" class="ctl w-auto"><option v-for="t in TEST_TYPES" :key="t" :value="t">{{ t }}</option></select></td>
                <td class="px-3 py-2"><input v-model="row.remarks" type="text" :readonly="!canEdit" :aria-label="`Remarks for ${row.item_name}`" class="ctl min-w-[160px]" /></td>
                <td class="px-3 py-2"><button v-if="canEdit" type="button" class="rounded p-1 text-red-600 hover:bg-red-50" :aria-label="`Remove ${row.item_name}`" @click="doc.suggested_tests.splice(i, 1)"><LucideIcon name="trash-2" class="h-4 w-4" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Desk: "Lab Reports" on the form dashboard; hidden when nothing was ordered. -->
      <section v-if="!isNew" v-show="labCount !== 0" id="sec-lab" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="flask-conical">Lab Reports</SubHeading>
        <LabReports :consultation="name" @loaded="(n) => (labCount = n)" />
      </section>

      <section id="sec-followup" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="calendar-days">Follow-up</SubHeading>
        <div :class="GRID">
          <TextField id="dc-followup" v-model="doc.follow_up_date" type="date" label="Follow-up Date" :readonly="!canEdit" />
          <LinkField id="dc-referred" v-model="doc.referred_to" doctype="Doctor Master" label="Referred To" :readonly="!canEdit" />
        </div>
      </section>

      <!-- Desk: collapsible "Patient History" -->
      <section id="sec-history" class="scroll-mt-4 rounded-xl border border-gray-200 bg-white">
        <button type="button" class="block w-full px-5 py-3.5 text-left" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">
          <SubHeading icon="history">
            Patient History
            <template #end><LucideIcon :name="historyOpen ? 'chevron-up' : 'chevron-down'" class="h-4 w-4 text-gray-500" /></template>
          </SubHeading>
        </button>
        <div v-if="historyOpen" class="px-5 pb-5">
          <PatientHistory :visit="doc.patient_consultation" :exclude="isNew ? '' : name" />
        </div>
      </section>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </template>
  </AppLayout>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call, debounce } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import LinkField from '@/components/LinkField.vue'
import VitalsCard from '@/components/VitalsCard.vue'
import PatientHistory from '@/components/PatientHistory.vue'
import LabReports from '@/components/lab/LabReports.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { api, errorText, getValue, DC } from '@/data/api'
import { hasRole } from '@/data/session'

const props = defineProps({ name: { type: String, required: true } })
// Tests on this consultation (null until LabReports has loaded).
const labCount = ref(null)
const route = useRoute()
const router = useRouter()

// Prescription Item.dosage / Suggested Test.test_type options
const DOSAGES = ['', '1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-0', '0-1-1', '1-1-1', '2-0-0', '0-2-0', '0-0-2', '2-1-1', '1-1-2', '2-1-2', '2-2-2']
const TEST_TYPES = ['Lab Test', 'X-Ray', 'Scan', 'Other']

// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'

const isNew = computed(() => props.name === 'new')
const doc = reactive({ patient_consultation: '', patient_name: '', doctor: '', consultation_datetime: '', diagnosis: '', clinical_notes: '', prescribed_items: [], suggested_tests: [], follow_up_date: '', referred_to: '' })
const ready = ref(false)
const loadError = ref('')
const saveError = ref('')
const message = ref('')
const busy = ref(false)
const tried = ref(false)
const historyOpen = ref(true)
// For the patient bar only (never saved): the visit's UHIN, age and sex.
const visitInfo = ref({})

// Section chips; Vitals only once a visit is picked (VitalsCard needs it).
const SECTIONS_ALL = [
  { id: 'sec-consultation', label: 'Consultation' },
  { id: 'sec-vitals', label: 'Vitals' },
  { id: 'sec-notes', label: 'Diagnosis' },
  { id: 'sec-rx', label: 'Prescription' },
  { id: 'sec-tests', label: 'Investigations' },
  { id: 'sec-lab', label: 'Lab Reports' },
  { id: 'sec-followup', label: 'Follow-up' },
  { id: 'sec-history', label: 'History' },
]
const SECTIONS = computed(() =>
  SECTIONS_ALL.filter((s) => (s.id !== 'sec-vitals' || doc.patient_consultation) && (s.id !== 'sec-lab' || labCount.value)),
)

// Doctor (and System Manager) write; the server also checks it's their own
// note and their own patient. Billing / Front Desk / Pharmacy only read.
const canEdit = computed(() => hasRole('Doctor'))
const canOrderTests = computed(() => hasRole('Doctor', 'Lab Staff'))
const canBill = computed(() => hasRole('Billing Staff') && (doc.prescribed_items.length || doc.suggested_tests.length))

function nowStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const toInput = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '')
const fromInput = (v) => (v ? `${v.replace('T', ' ')}:00` : '')

onMounted(async () => {
  try {
    if (isNew.value) {
      doc.consultation_datetime = nowStr()
      doc.patient_consultation = route.query.visit || ''
      // onload: a new note is the logged-in doctor's own
      doc.doctor = (await api(`${DC}.get_own_doctor`)) || ''
    } else {
      Object.assign(doc, await call('frappe.client.get', { doctype: 'Doctor Consultation', name: props.name }))
    }
  } catch (err) {
    loadError.value = errorText(err) || 'This consultation could not be opened.'
    return
  }
  ready.value = true
})

// patient_name: fetch_from patient_consultation.patient_name
watch(
  () => doc.patient_consultation,
  async (visit) => {
    if (!visit) {
      doc.patient_name = ''
      visitInfo.value = {}
      return
    }
    try {
      // uhin_id / age / sex ride along for the patient bar; only
      // patient_name goes on the record.
      const v = (await getValue('Patient Visit', visit, ['patient_name', 'uhin_id', 'age', 'sex'])) || {}
      doc.patient_name = v.patient_name || ''
      visitInfo.value = v
    } catch {
      // the server fills it on save
    }
  },
)

// calculate_prescription_qty: doses per day x days
function calcQty(row) {
  if (row.dosage && row.duration) row.qty = row.dosage.split('-').reduce((s, p) => s + (parseInt(p, 10) || 0), 0) * (parseInt(row.duration, 10) || 0)
}

// render_prescription_item_search
const rxTerm = ref('')
const rxResults = ref([])
const rxOpen = ref(false)
const rxPicked = ref(null)
const rxDosage = ref('')
const rxError = ref('')
async function searchRx() {
  try {
    rxResults.value = (await api(`${DC}.search_pharmacy_items_for_prescription`, { search_term: rxTerm.value })) || []
  } catch {
    rxResults.value = []
  }
}
const searchRxSoon = debounce(searchRx, 300)
function pickRx(r) {
  rxPicked.value = r
  rxTerm.value = r.item_name
  rxOpen.value = false
}
function addRx() {
  rxError.value = ''
  if (!rxPicked.value) {
    rxError.value = 'Please search and select a medicine first.'
    return
  }
  doc.prescribed_items.push({ item: rxPicked.value.item_code, item_name: rxPicked.value.item_name, dosage: rxDosage.value, duration: null, qty: 0, instructions: '' })
  rxPicked.value = null
  rxTerm.value = ''
  rxDosage.value = ''
}

// render_suggested_test_search
const testTerm = ref('')
const testResults = ref([])
const testOpen = ref(false)
const testPicked = ref(null)
const testType = ref('')
const testError = ref('')
async function searchTests() {
  try {
    testResults.value = (await api(`${DC}.search_services_for_consultation`, { search_term: testTerm.value })) || []
  } catch {
    testResults.value = []
  }
}
const searchTestsSoon = debounce(searchTests, 300)
function pickTest(r) {
  testPicked.value = r
  testTerm.value = r.item_name
  testOpen.value = false
}
function addTest() {
  testError.value = ''
  if (!testPicked.value) {
    testError.value = 'Please search and select a test/investigation first.'
    return
  }
  if (!testType.value) {
    testError.value = 'Please pick a Type.'
    return
  }
  doc.suggested_tests.push({ item: testPicked.value.item_code, item_name: testPicked.value.item_name, test_type: testType.value, remarks: '' })
  testPicked.value = null
  testTerm.value = ''
  testType.value = ''
}

// Desk's mandatory fields; a medicine row needs Dosage and Duration, since
// its required Quantity is worked out from them.
const missing = computed(() => {
  const m = []
  if (!doc.patient_consultation) m.push('Visit')
  if (!doc.doctor) m.push('Doctor')
  if (!doc.consultation_datetime) m.push('Consultation Date Time')
  doc.prescribed_items.forEach((r, i) => {
    if (!r.dosage || !r.duration) m.push(`Prescription row ${i + 1} (${r.item_name}): Dosage and Duration`)
  })
  doc.suggested_tests.forEach((r, i) => {
    if (!r.test_type) m.push(`Test row ${i + 1} (${r.item_name}): Type`)
  })
  return m
})

async function save() {
  tried.value = true
  saveError.value = ''
  message.value = ''
  if (missing.value.length) return
  busy.value = true
  try {
    const payload = { ...doc, doctype: 'Doctor Consultation' }
    const saved = isNew.value ? await call('frappe.client.insert', { doc: payload }) : await call('frappe.client.save', { doc: payload })
    if (isNew.value) {
      router.replace({ name: 'ConsultationForm', params: { name: saved.name } })
      return
    }
    Object.assign(doc, saved)
    tried.value = false
    message.value = 'Saved.'
  } catch (err) {
    saveError.value = errorText(err) || 'Could not save.'
  } finally {
    busy.value = false
  }
}

async function printPrescription() {
  try {
    const html = await api(`${DC}.get_prescription_html`, { consultation: doc.name })
    const w = window.open('', '_blank')
    w.document.open()
    w.document.write(`<html><head><title>${doc.name}</title></head><body>${html}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  } catch (err) {
    saveError.value = errorText(err)
  }
}

async function orderTests() {
  busy.value = true
  message.value = ''
  saveError.value = ''
  try {
    const created = (await api(`${DC}.create_diagnostic_tests`, { consultation: doc.name })) || []
    message.value = created.length ? `Created Diagnostic Test(s): ${created.join(', ')}` : 'All suggested tests already have a Diagnostic Test.'
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    busy.value = false
  }
}
</script>
