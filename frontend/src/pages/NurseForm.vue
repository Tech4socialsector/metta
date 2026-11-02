<template>
  <AppLayout title="Record vitals" :back-to="{ name: 'NurseList' }">
    <!-- One Save at the top with the record's status (option C); the
    reading's date/time sits here too - it's rarely changed. -->
    <template v-if="doc && !savedOk" #meta>
      <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="doc.status === 'Completed' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'">{{ doc.status }}</span>
        <span class="font-mono">{{ doc.name }}</span>
        <span aria-hidden="true">·</span>
        <label for="ni_date" class="flex items-center gap-1.5">
          <LucideIcon name="clock" class="h-3.5 w-3.5" />
          Recorded at
        </label>
        <input id="ni_date" v-model="form.date" type="datetime-local" :readonly="!canEdit" class="h-7 rounded-md border border-transparent bg-gray-100 px-2 text-xs text-gray-800 hover:bg-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100" />
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

      <div v-if="((missing.length || hasRangeErrors) && triedSave) || saveError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <p v-if="missing.length && triedSave"><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
        <p v-if="hasRangeErrors && triedSave">Some readings look wrong - please check the fields marked in red.</p>
        <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
      </div>

      <!-- Enter moves to the next box; on the last one it saves. -->
      <form ref="formEl" class="flex flex-col gap-5" aria-label="Vitals" novalidate @submit.prevent="save" @keydown.enter="nextField">
        <section class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="heart-pulse">
            Vital signs
            <template v-if="last" #end><span class="text-xs font-normal normal-case tracking-normal text-gray-500">Last reading {{ lastDate }}</span></template>
          </SubHeading>
          <div :class="GRID">
            <VitalField id="temperature" v-model="form.temperature" icon="thermometer" label="Temperature" unit="°F" reqd :readonly="!canEdit" :error="rangeErrors.temperature" :warning="warnings.temperature" :normal="normal('temperature')" :last="last?.temperature" />
            <VitalField id="pulse" v-model="form.pulse" icon="activity" label="Pulse" unit="beats/min" inputmode="numeric" reqd :readonly="!canEdit" :error="rangeErrors.pulse" :warning="warnings.pulse" :normal="normal('pulse')" :last="last?.pulse" />
            <VitalField id="respiration" v-model="form.respiration" icon="wind" label="Respiration" unit="/min" inputmode="numeric" reqd :readonly="!canEdit" :error="rangeErrors.respiration" :warning="warnings.respiration" :normal="normal('respiration')" :last="last?.respiration" />
            <VitalField id="saturation" v-model="form.saturation" icon="droplets" label="SpO₂" unit="%" inputmode="numeric" reqd :readonly="!canEdit" :error="rangeErrors.saturation" :warning="warnings.saturation" :normal="normal('saturation')" :last="last?.saturation" />
            <!-- Two boxes so the "120/80" format can't be typed wrong; saved
            together into the one Blood Pressure field. -->
            <VitalField id="bp_sys" icon="gauge" label="Blood Pressure" reqd :error="rangeErrors.blood_pressure_mmhg" :warning="warnings.blood_pressure_mmhg" :normal="normal('blood_pressure_mmhg')" :last="last?.blood_pressure_mmhg">
              <template #default="{ boxClass }">
                <div class="flex items-center gap-2">
                  <input id="bp_sys" v-model="bp.sys" inputmode="numeric" maxlength="3" placeholder="120" aria-label="Systolic" autocomplete="off" :readonly="!canEdit" :class="[boxClass, 'w-full min-w-0 px-3 text-center']" />
                  <span class="text-lg text-gray-400" aria-hidden="true">/</span>
                  <input id="bp_dia" v-model="bp.dia" inputmode="numeric" maxlength="3" placeholder="80" aria-label="Diastolic" autocomplete="off" :readonly="!canEdit" :class="[boxClass, 'w-full min-w-0 px-3 text-center']" />
                  <span class="shrink-0 text-sm text-gray-500">mmHg</span>
                </div>
              </template>
            </VitalField>
          </div>
        </section>

        <section class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading icon="ruler">Body measurements</SubHeading>
          <div :class="GRID">
            <VitalField id="height" v-model="form.height" icon="ruler" label="Height" unit="cm" reqd :readonly="!canEdit" :error="rangeErrors.height" :last="last?.height ? String(last.height) : ''" />
            <VitalField id="weight" v-model="form.weight" icon="weight" label="Weight" unit="kg" reqd :readonly="!canEdit" :error="rangeErrors.weight" :last="last?.weight ? String(last.weight) : ''" />
            <!-- BMI is worked out, never typed: shown as a result. -->
            <div class="flex flex-col gap-1.5">
              <span class="flex items-center gap-1.5 text-[13px] font-medium text-gray-700"><LucideIcon name="scale" class="h-4 w-4 text-gray-500" />BMI</span>
              <div class="flex h-10 items-center gap-2 rounded-md bg-gray-50 px-3">
                <span class="text-lg font-semibold tabular-nums" :class="bmi.bmi ? 'text-gray-900' : 'text-gray-400'">{{ bmi.bmi || '—' }}</span>
                <span v-if="bmi.category" class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="STATUS_CLASS[bmi.category]">{{ bmi.category }}</span>
              </div>
              <span class="min-h-[18px] text-xs text-gray-500">From height and weight</span>
            </div>
          </div>
        </section>
      </form>

      <RecordActivity :doc="doc" />
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import VitalField from '@/components/VitalField.vue'
import PatientBar from '@/components/PatientBar.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { api, errorText } from '@/data/api'
import { hasRole } from '@/data/session'
import { bmiFor, STATUS_CLASS, REQUIRED_VITALS, vitalErrors, vitalWarnings, normalText, splitBp, joinBp } from '@/data/nurseRules'

const props = defineProps({ name: { type: String, required: true } })
const NI = 'metta.metta.doctype.nurse_interventions.nurse_interventions'

// Three fields per row on a wide screen (form view C), two on a tablet.
const GRID = 'grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 min-[1100px]:grid-cols-3'

const doc = ref(null)
const last = ref(null)
const loadError = ref('')
const saving = ref(false)
const triedSave = ref(false)
const saveError = ref('')
const savedOk = ref(false)
const formEl = ref(null)

// Nurse (and System Manager) write; Doctor / Front Desk only read, as in Desk.
const canEdit = computed(() => hasRole('Nurse'))

const FIELDS = ['date', 'temperature', 'pulse', 'respiration', 'saturation', 'blood_pressure_mmhg', 'height', 'weight']
const form = reactive(Object.fromEntries(FIELDS.map((f) => [f, ''])))
const bp = reactive({ sys: '', dia: '' })
// The two BP boxes feed the one stored field.
watch(bp, () => (form.blood_pressure_mmhg = joinBp(bp.sys, bp.dia)))

const bmi = computed(() => bmiFor(form.height, form.weight))
// Impossible readings (red, block Save) and unusual ones (amber, a note).
const rangeErrors = computed(() => vitalErrors(form))
const hasRangeErrors = computed(() => Object.keys(rangeErrors.value).length > 0)
const warnings = computed(() => vitalWarnings(form, doc.value?.age))
const normal = (field) => normalText(field, doc.value?.age)

const missing = computed(() => REQUIRED_VITALS.filter(([f]) => String(form[f] ?? '').trim() === '').map(([, label]) => label))
const lastDate = computed(() => (last.value?.date ? new Date(String(last.value.date).replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''))

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
  // Height / weight are number fields stored as 0 when empty - show them blank.
  for (const f of FIELDS) form[f] = (f === 'height' || f === 'weight') && !doc.value[f] ? '' : doc.value[f] ?? ''
  Object.assign(bp, splitBp(doc.value.blood_pressure_mmhg))
  // Desk's Date default "Now" for a record still waiting.
  form.date = toInput(doc.value.date) || (doc.value.status === 'Pending' ? nowInput() : '')
  try {
    last.value = await api(`${NI}.get_previous_vitals`, { name: doc.value.name })
  } catch {
    last.value = null
  }
})

// Enter: next editable box in the form, or Save from the last one.
function nextField(e) {
  if (e.target.tagName !== 'INPUT') return
  e.preventDefault()
  const boxes = [...formEl.value.querySelectorAll('input:not([readonly])')]
  const i = boxes.indexOf(e.target)
  if (i >= 0 && i < boxes.length - 1) boxes[i + 1].focus()
  else save()
}

async function save() {
  if (!canEdit.value || saving.value) return
  triedSave.value = true
  saveError.value = ''
  if (missing.value.length || hasRangeErrors.value) return
  saving.value = true
  try {
    // Saved through the same doctype: validate() checks the ranges again,
    // stores BMI and age, marks it Completed and tells the doctor.
    // Fields removed from the form (old tests / assessment / sugar history)
    // are left out: old records still carry them when loaded.
    const { blood_sugar_history, rbg_level, blood_sugar_status, hemoglobin_level, anemia_status, piccle, primary_diagnosis, ...current } = doc.value
    doc.value = await call('frappe.client.save', {
      doc: {
        ...current,
        ...form,
        date: fromInput(form.date),
        height: form.height === '' ? null : form.height,
        weight: form.weight === '' ? null : form.weight,
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
