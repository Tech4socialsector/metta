<template>
  <AppLayout :title="isNew ? 'New appointment' : doc?.patient_name || name" :back-to="{ name: 'WardAppointmentList' }">
    <!-- Option C: status + id under the title, one main button at the top. -->
    <template v-if="doc" #meta>
      <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <StatusBadge v-if="!isNew && original.status" :status="original.status" />
        <span v-else-if="isNew" class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Not saved</span>
        <span v-if="!isNew" class="font-mono">{{ name }}</span>
        <span v-if="!isNew && canWrite && dirty">· Unsaved changes</span>
      </div>
    </template>
    <template #actions>
      <router-link v-if="doc?.patient_visit" :to="{ name: 'VisitView', params: { name: doc.patient_visit } }" class="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50">Open visit {{ doc.patient_visit }}</router-link>
      <template v-if="doc && canWrite && (dirty || isNew)">
        <button type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" @click="discard">{{ isNew ? 'Cancel' : 'Discard' }}</button>
        <button type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save appointment' }}</button>
      </template>
      <!-- Check In: a saved, Scheduled appointment, for users who may create a
      Patient Visit. Teal only while there is nothing to save. -->
      <router-link
        v-if="canCheckIn"
        :to="{ name: 'WardAppointmentCheckIn', params: { name } }"
        class="flex h-9 items-center rounded-lg px-4 text-sm font-semibold"
        :class="canWrite && dirty ? 'border border-gray-300 bg-white hover:bg-gray-50' : 'bg-brand-700 text-white hover:bg-brand-800'"
      >Check In</router-link>
    </template>

    <p v-if="loadError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-if="doc" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <PatientBar v-if="doc.patient" :name="doc.patient_name" :age="doc.age" :uhin="doc.patient" :visit="doc.patient_visit" :doctor="doc.doctor">
        <span v-if="doc.phone" class="text-gray-600">{{ doc.phone }}</span>
      </PatientBar>

      <p v-if="!canWrite" class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">You can view this appointment but not change it.</p>
      <!-- One red block under the patient bar, seen after Save at the top. -->
      <div v-if="saveError || (tried && missing.length)" class="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <div>
          <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
          <p v-else><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
        </div>
        <button v-if="saveError && staleDoc" type="button" class="h-8 shrink-0 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="load">Reload latest</button>
      </div>
      <p v-if="savedNote" class="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{{ savedNote }}</p>

      <section class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="user-round">Patient</SubHeading>
        <div :class="GRID">
          <LinkField id="patient" v-model="doc.patient" doctype="Patient Registration" label="Patient" reqd :readonly="!canWrite" />
          <TextField id="patient_name" :model-value="doc.patient_name || ''" label="Patient Name" readonly />
          <TextField id="phone" :model-value="doc.phone || ''" label="Phone" readonly />
          <TextField id="age" v-model="doc.age" type="number" inputmode="numeric" label="Age" :readonly="!canWrite" />
        </div>
      </section>

      <section class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="calendar-days">Schedule</SubHeading>
        <div :class="GRID">
          <TextField id="appointment_date" v-model="doc.appointment_date" type="date" label="Appointment Date" reqd :readonly="!canWrite" />
          <TextField id="appointment_time" :model-value="timeInput" type="time" label="Appointment Time" reqd :readonly="!canWrite" @update:model-value="setTime" />
          <LinkField id="doctor" v-model="doc.doctor" doctype="Doctor Master" label="Doctor" reqd :filters="doctorFilter" :readonly="!canWrite" />
          <TextField id="department" :model-value="doc.department || ''" label="Department" readonly />
          <SelectField id="status" v-model="doc.status" label="Status" :options="APPOINTMENT_STATUS" reqd :readonly="!canWrite" />
          <TextField v-if="doc.patient_visit" id="patient_visit" :model-value="doc.patient_visit" label="Patient Visit" readonly />
        </div>
        <p v-if="noDoctor" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">No doctor is available at this date and time.</p>
        <TextField id="reason_for_visit" v-model="doc.reason_for_visit" type="textarea" label="Reason for Visit" :readonly="!canWrite" />
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
import StatusBadge from '@/components/StatusBadge.vue'
import PatientBar from '@/components/PatientBar.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { api, getValue, errorText } from '@/data/api'
import { todayStr } from '@/data/registrationRules'
import { APPOINTMENT_STATUS, useUnsavedGuard } from '@/data/ward/rules'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const APT = 'metta.metta.doctype.appointment.appointment'
// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'

const doc = ref(null)
const original = ref({})
const snapshot = ref('')
const perms = ref({})
const canCreateVisit = ref(false)
const loadError = ref('')
const available = ref(null)
const noDoctor = ref(false)

const saving = ref(false)
const tried = ref(false)
const saveError = ref('')
const staleDoc = ref(false)
const savedNote = ref('')

// Rules react to what the user changes, never to the record being loaded.
let ready = false

const isNew = computed(() => props.name === 'new')
const canWrite = computed(() => !!(isNew.value ? perms.value.create : perms.value.write))
const dirty = computed(() => !!doc.value && JSON.stringify(doc.value) !== snapshot.value)
const canCheckIn = computed(() => !isNew.value && original.value.status === 'Scheduled' && canCreateVisit.value)
// set_query("doctor"): only doctors free at that date and time, once both are picked.
const doctorFilter = computed(() => (available.value ? { name: ['in', available.value] } : null))

const missing = computed(() => {
  const d = doc.value
  if (!d) return []
  return [
    ['patient', 'Patient'],
    ['appointment_date', 'Appointment Date'],
    ['appointment_time', 'Appointment Time'],
    ['doctor', 'Doctor'],
    ['status', 'Status'],
  ]
    .filter(([f]) => !d[f])
    .map(([, label]) => label)
})

// Frappe may send a Time as "9:30:00"; the time input wants "09:30".
const timeInput = computed(() => {
  const t = doc.value?.appointment_time
  if (!t) return ''
  const [h, m] = String(t).split(':')
  return `${String(h).padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
})
function setTime(v) {
  doc.value.appointment_time = v ? `${v}:00` : null
}

function blank() {
  // Desk defaults: date Today, status Scheduled.
  return { doctype: 'Appointment', patient: '', patient_name: '', phone: '', appointment_date: todayStr(), appointment_time: null, doctor: '', department: '', status: 'Scheduled', patient_visit: '', reason_for_visit: '', age: null }
}

async function load() {
  ready = false
  loadError.value = ''
  saveError.value = ''
  staleDoc.value = false
  tried.value = false
  try {
    if (isNew.value) {
      setDoc(blank())
      perms.value = (await call('metta.api.get_doc_permissions', { doctype: 'Appointment' })) || {}
    } else {
      const [d, p] = await Promise.all([
        call('frappe.client.get', { doctype: 'Appointment', name: props.name }),
        call('metta.api.get_doc_permissions', { doctype: 'Appointment', name: props.name }),
      ])
      setDoc(d)
      perms.value = p || {}
    }
    canCreateVisit.value = !!(await call('metta.api.get_doc_permissions', { doctype: 'Patient Visit' }))?.create
  } catch (err) {
    loadError.value = errorText(err) || `Appointment ${props.name} could not be opened.`
    return
  }
  await nextTick()
  ready = true
  // A patient passed in the address (?patient=HIN-…) fills like a pick.
  if (isNew.value && typeof route.query.patient === 'string') doc.value.patient = route.query.patient
  refreshAvailableDoctors()
}

function setDoc(d) {
  doc.value = d
  original.value = JSON.parse(JSON.stringify(d))
  snapshot.value = JSON.stringify(d)
}

// refresh_available_doctors: only for users who can book (the server
// method needs "create"); with no date or time yet, every doctor is offered.
// A doctor already picked is left alone - the server's validate() decides.
let seq = 0
async function refreshAvailableDoctors() {
  noDoctor.value = false
  if (!perms.value.create) return
  const d = doc.value
  if (!d.appointment_date || !d.appointment_time) {
    available.value = null
    return
  }
  const mine = ++seq
  try {
    const names = (await api(`${APT}.get_available_doctors`, { appointment_date: d.appointment_date, appointment_time: d.appointment_time, exclude_appointment: isNew.value ? null : d.name })) || []
    if (mine !== seq) return
    available.value = names
    noDoctor.value = !names.length
  } catch {
    available.value = null
  }
}
watch(() => [doc.value?.appointment_date, doc.value?.appointment_time], () => {
  if (ready) refreshAvailableDoctors()
})

// fetch_from patient.patient_name / patient.phone
watch(() => doc.value?.patient, async (patient) => {
  if (!ready) return
  if (!patient) {
    doc.value.patient_name = ''
    doc.value.phone = ''
    return
  }
  try {
    const r = await getValue('Patient Registration', patient, ['patient_name', 'phone'])
    if (doc.value.patient !== patient) return
    doc.value.patient_name = r?.patient_name || ''
    doc.value.phone = r?.phone || ''
  } catch {
    // The server fetches on save.
  }
})

// fetch_from doctor.department
watch(() => doc.value?.doctor, async (doctor) => {
  if (!ready) return
  if (!doctor) {
    doc.value.department = ''
    return
  }
  try {
    const r = await getValue('Doctor Master', doctor, 'department')
    if (doc.value.doctor === doctor) doc.value.department = r?.department || ''
  } catch {
    // The server fetches on save.
  }
})

async function save() {
  if (!canWrite.value || saving.value || (!isNew.value && !dirty.value)) return
  tried.value = true
  saveError.value = ''
  savedNote.value = ''
  if (missing.value.length) return
  saving.value = true
  try {
    const payload = { ...doc.value, age: doc.value.age === '' || doc.value.age === null ? null : parseInt(doc.value.age, 10) }
    if (isNew.value) {
      const saved = await call('frappe.client.insert', { doc: payload })
      snapshot.value = JSON.stringify(doc.value)
      router.replace({ name: 'WardAppointmentForm', params: { name: saved.name } })
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
  if (isNew.value) router.push({ name: 'WardAppointmentList' })
  else load()
}

// The same page is reused when "new" becomes the saved name.
watch(() => props.name, load)
useUnsavedGuard(() => canWrite.value && !isNew.value && dirty.value, save)
onMounted(load)
</script>
