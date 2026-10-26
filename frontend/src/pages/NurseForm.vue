<template>
  <AppLayout title="Record vitals" :back-to="{ name: 'NurseList' }">
    <!-- One Save at the top with the record's status (option C). -->
    <template v-if="doc && !savedOk" #meta>
      <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="doc.status === 'Completed' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'">{{ doc.status }}</span>
        <span class="font-mono">{{ doc.name }}</span>
      </div>
    </template>
    <template v-if="doc && !savedOk && canEdit" #actions>
      <button type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save vitals' }}</button>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <section v-if="savedOk" class="mx-auto flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-800">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">Vitals saved</h1>
        <p class="text-lg text-gray-800">{{ doc.patient_name }}</p>
        <p class="text-gray-700">The doctor can see them now.</p>
      </div>
      <router-link :to="{ name: 'NurseList' }" class="flex h-12 items-center rounded-lg bg-brand-700 px-6 font-semibold text-white hover:bg-brand-800">Next patient</router-link>
    </section>

    <template v-else-if="doc">
      <PatientBar :name="doc.patient_name" :age="doc.age" :gender="doc.gender" :uhin="doc.patient_unique_id" :visit="doc.patient_registration" />
      <SectionJump :sections="SECTIONS" />

      <div v-if="(missing.length && triedSave) || saveError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <p v-if="missing.length && triedSave"><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
        <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
      </div>

      <form class="flex flex-col gap-5" aria-label="Nurse assessment" @submit.prevent="save">
        <!-- Desk: "Physical Examination" (with the record's Date) -->
        <section id="sec-vitals" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="heart-pulse">Vitals</SubHeading>
          <div :class="GRID">
            <TextField id="ni_date" v-model="form.date" type="datetime-local" label="Date" :readonly="!canEdit" />
            <TextField id="temperature" v-model="form.temperature" inputmode="decimal" label="Temperature" unit="°F" reqd :readonly="!canEdit" />
            <TextField id="pulse" v-model="form.pulse" inputmode="numeric" label="Pulse" unit="beats/min" reqd :readonly="!canEdit" />
            <TextField id="respiration" v-model="form.respiration" inputmode="numeric" label="Respiration" unit="/min" reqd :readonly="!canEdit" />
            <TextField id="saturation" v-model="form.saturation" inputmode="numeric" label="SpO₂" unit="%" reqd :readonly="!canEdit" />
            <TextField id="blood_pressure_mmhg" v-model="form.blood_pressure_mmhg" label="Blood Pressure" unit="mmHg" placeholder="e.g. 120/80" reqd :readonly="!canEdit" />
            <TextField id="height" v-model="form.height" inputmode="decimal" label="Height" unit="cm" reqd :readonly="!canEdit" />
            <TextField id="weight" v-model="form.weight" inputmode="decimal" label="Weight" unit="kg" reqd :readonly="!canEdit" />
            <TextField id="bmi" :model-value="bmi.bmi || ''" label="BMI" readonly>
              <template v-if="bmi.category" #end><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="STATUS_CLASS[bmi.category]">{{ bmi.category }}</span></template>
            </TextField>
          </div>
        </section>

        <section id="sec-tests" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="test-tube">Tests</SubHeading>
          <div :class="GRID">
            <TextField id="rbg_level" v-model="form.rbg_level" inputmode="decimal" label="Random Blood Glucose" unit="mg/dL" :readonly="!canEdit">
              <template v-if="sugar" #end><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="STATUS_CLASS[sugar]">{{ sugar }}</span></template>
            </TextField>
            <TextField id="hemoglobin_level" v-model="form.hemoglobin_level" inputmode="decimal" label="Hemoglobin" unit="g/dL" :readonly="!canEdit">
              <template v-if="anemia" #end><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="STATUS_CLASS[anemia]">{{ anemia }}</span></template>
            </TextField>
          </div>
        </section>

        <section id="sec-assessment" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="clipboard-check">Assessment</SubHeading>
          <TextField id="piccle" v-model="form.piccle" type="textarea" label="PICCLE (Pallor, Icterus, Cyanosis, Clubbing, Lymphnode enlargement, Edema)" :readonly="!canEdit" />
          <TextField id="primary_diagnosis" v-model="form.primary_diagnosis" label="Provisional diagnosis by nurse" :readonly="!canEdit" />
        </section>
      </form>

      <!-- Desk: "Blood Sugar History" (read-only, built from past visits) -->
      <section id="sec-history" class="flex scroll-mt-4 flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="droplet">Blood sugar history</SubHeading>
        <p v-if="!history.length" class="text-sm text-gray-600">No earlier readings.</p>
        <div v-for="h in history.slice(0, showAllHistory ? undefined : 5)" :key="h.name" class="flex items-center justify-between gap-2 text-sm">
          <router-link :to="{ name: 'NurseForm', params: { name: h.name } }" class="text-gray-700 hover:underline">{{ (h.date || '').slice(0, 10) }}</router-link>
          <span>{{ h.rbg_level }} <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="STATUS_CLASS[h.blood_sugar_status]">{{ h.blood_sugar_status }}</span></span>
        </div>
        <button v-if="history.length > 5" type="button" class="self-start text-sm font-semibold text-brand-700 hover:underline" @click="showAllHistory = !showAllHistory">
          {{ showAllHistory ? 'Show less' : `Show all ${history.length}` }}
        </button>
      </section>

      <RecordActivity :doc="doc" />
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { api, errorText } from '@/data/api'
import { hasRole } from '@/data/session'
import { bmiFor, sugarStatus, anemiaStatus, STATUS_CLASS, REQUIRED_VITALS } from '@/data/nurseRules'

const props = defineProps({ name: { type: String, required: true } })

// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'
const SECTIONS = [
  { id: 'sec-vitals', label: 'Vitals' },
  { id: 'sec-tests', label: 'Tests' },
  { id: 'sec-assessment', label: 'Assessment' },
  { id: 'sec-history', label: 'Blood sugar history' },
]

const doc = ref(null)
const loadError = ref('')
const history = ref([])
const showAllHistory = ref(false)
const saving = ref(false)
const triedSave = ref(false)
const saveError = ref('')
const savedOk = ref(false)

// Nurse (and System Manager) write; Doctor / Front Desk only read, as in Desk.
const canEdit = computed(() => hasRole('Nurse'))

const FIELDS = ['date', 'temperature', 'pulse', 'respiration', 'saturation', 'blood_pressure_mmhg', 'height', 'weight', 'rbg_level', 'hemoglobin_level', 'piccle', 'primary_diagnosis']
const form = reactive(Object.fromEntries(FIELDS.map((f) => [f, ''])))

const bmi = computed(() => bmiFor(form.height, form.weight))
const sugar = computed(() => sugarStatus(form.rbg_level))
const anemia = computed(() => anemiaStatus(form.hemoglobin_level, doc.value?.gender))

const missing = computed(() => REQUIRED_VITALS.filter(([f]) => String(form[f] ?? '').trim() === '').map(([, label]) => label))

// Datetime <-> the browser's datetime-local input.
const toInput = (v) => (v ? String(v).slice(0, 16).replace(' ', 'T') : '')
const fromInput = (v) => (v ? `${v.replace('T', ' ')}:00` : null)
function nowInput() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

onMounted(async () => {
  try {
    doc.value = await call('frappe.client.get', { doctype: 'Nurse Interventions', name: props.name })
  } catch (err) {
    loadError.value = errorText(err) || 'This record could not be opened.'
    return
  }
  for (const f of FIELDS) form[f] = doc.value[f] ?? ''
  // Desk's Date default "Now" for a record still waiting.
  form.date = toInput(doc.value.date) || (doc.value.status === 'Pending' ? nowInput() : '')
  // update_blood_sugar_history_preview
  if (doc.value.patient_unique_id) {
    try {
      history.value = (await api('metta.metta.doctype.nurse_interventions.nurse_interventions.get_blood_sugar_history', { patient_unique_id: doc.value.patient_unique_id, exclude: doc.value.name })) || []
    } catch {
      history.value = []
    }
  }
})

async function save() {
  triedSave.value = true
  saveError.value = ''
  if (missing.value.length) return
  saving.value = true
  try {
    // Saved through the same doctype: validate() stores BMI, sugar/anemia
    // status, age and history, marks it Completed and tells the doctor.
    doc.value = await call('frappe.client.save', {
      doc: {
        ...doc.value,
        ...form,
        date: fromInput(form.date),
        height: form.height === '' ? null : form.height,
        weight: form.weight === '' ? null : form.weight,
        hemoglobin_level: form.hemoglobin_level === '' ? null : form.hemoglobin_level,
      },
    })
    savedOk.value = true
  } catch (err) {
    saveError.value = errorText(err) || 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
