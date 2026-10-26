<template>
  <AppLayout title="Admit Patient" :back-to="{ name: 'VisitView', params: { name } }">
    <!-- Option C: what this is and the OP visit under the title; one main button. -->
    <template v-if="op && defaults && !saved" #meta>
      <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <span class="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800">New IP admission</span>
        <span>From OP visit <span class="font-mono">{{ name }}</span></span>
      </div>
    </template>
    <template v-if="op && defaults && !saved" #actions>
      <router-link :to="{ name: 'VisitView', params: { name } }" class="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50">Cancel</router-link>
      <!-- data-save: Ctrl+S admits, as the button text doesn't start with "Save" -->
      <button type="button" data-save class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Admit patient' }}</button>
    </template>

    <p v-if="loadError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="op && defaults">
      <PatientBar :name="op.patient_name" :age="op.age" :gender="op.sex" :uhin="op.uhin_id" :visit="op.name">
        <span v-if="defaults.billing_category" class="text-gray-600">Category <b class="font-semibold text-gray-900">{{ defaults.billing_category }}</b></span>
      </PatientBar>

      <section v-if="saved" class="flex flex-col gap-4 rounded-xl border border-green-200 bg-white p-6">
        <h2 class="text-2xl font-semibold">Patient admitted</h2>
        <p class="text-gray-700">
          IP number <b class="font-mono">{{ saved.patient_visit }}</b>
          <template v-if="adm.accommodation_type === 'Ward'"> · {{ adm.ward }} · Bed {{ adm.bed_no }}</template>
          <template v-else-if="adm.accommodation_type === 'Room'"> · {{ adm.room }} · Bed {{ adm.room_bed_no }}</template>
        </p>
        <div class="flex flex-wrap gap-2">
          <router-link :to="{ name: 'VisitView', params: { name: saved.patient_visit } }" class="flex h-11 items-center rounded-lg bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">Open admission</router-link>
          <router-link :to="{ name: 'PatientView', params: { uhin: op.uhin_id } }" class="flex h-11 items-center rounded-lg border border-gray-300 bg-white px-5 font-semibold hover:bg-gray-50">Open patient</router-link>
        </div>
        <p class="text-sm text-gray-700">Next: collect the advance (Patient Advance) against this IP number.</p>
      </section>

      <template v-else>
        <SectionJump :sections="SECTIONS" />

        <!-- One red block under the patient bar, seen after Admit at the top. -->
        <div v-if="(missing.length && triedSave) || saveError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          <p v-if="missing.length && triedSave"><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
          <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
        </div>

        <form class="flex flex-col gap-5" aria-label="IP admission" @submit.prevent="save">
          <!-- Patient Visit · "IP Details" -->
          <section id="sec-ip" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
            <SubHeading icon="bed-double">IP Details</SubHeading>
            <div :class="GRID">
              <SelectField id="accommodation_type" v-model="adm.accommodation_type" label="Accommodation Type" :options="['', 'Ward', 'Room']" />
              <!-- refresh(): read-only unless Doctor / System Manager -->
              <SelectField id="admission_status" v-model="adm.admission_status" label="Admission Status" :options="['Admitted', 'Discharged']" :readonly="!canChangeStatus" />
              <TextField id="admission_date" v-model="adm.admission_date" type="date" label="Admission Date" />
              <TextField id="expected_discharge_date" v-model="adm.expected_discharge_date" type="date" label="Expected Discharge Date" />
              <TextField v-if="adm.admission_status === 'Discharged'" id="discharge_date" v-model="adm.discharge_date" type="date" label="Discharge Date" />
            </div>

            <template v-if="adm.accommodation_type === 'Ward'">
              <div :class="GRID">
                <LinkField id="ward" v-model="adm.ward" doctype="Ward Master" label="Ward" />
                <TextField id="bed_no" v-model="adm.bed_no" label="Bed No" @change="checkWardBed" />
              </div>
              <BedGrid v-if="adm.ward" v-model="adm.bed_no" :beds="wardBeds" :loading="bedsLoading" kind="ward" />
            </template>

            <template v-if="adm.accommodation_type === 'Room'">
              <div :class="GRID">
                <LinkField id="room" v-model="adm.room" doctype="Room Master" label="Room" :filters="{ is_active: 1 }" />
                <TextField id="room_bed_no" v-model="adm.room_bed_no" label="Bed No" @change="checkRoomBed" />
              </div>
              <p v-if="roomInfo" class="text-sm text-gray-700">
                {{ [roomInfo.room_type, roomInfo.floor ? `Floor ${roomInfo.floor}` : '', roomInfo.rent_per_day ? `₹${roomInfo.rent_per_day}/day` : '', roomInfo.capacity ? `Capacity ${roomInfo.capacity}` : ''].filter(Boolean).join(' · ') }}
              </p>
              <BedGrid v-if="adm.room" v-model="adm.room_bed_no" :beds="roomBeds" :loading="bedsLoading" kind="room" />
            </template>
            <p v-if="bedError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ bedError }}</p>
          </section>

          <!-- Patient Visit · "Consultation Details" -->
          <section id="sec-consult" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
            <SubHeading icon="stethoscope">Consultation Details</SubHeading>
            <div :class="GRID">
              <LinkField id="department_name" v-model="adm.department_name" doctype="Department" label="Department Name" />
              <LinkField id="doctor_name" v-model="adm.doctor_name" doctype="Doctor Master" label="Doctor name" :filters="adm.department_name ? { department: adm.department_name } : null" />
              <TextField id="ip_date" v-model="adm.date" type="date" label="Date" />
              <TextField id="ip_time" v-model="adm.time" label="Time" />
            </div>
          </section>

          <!-- Patient Visit · "MLC (Medico-Legal Case) Details" (collapsible in Desk) -->
          <section id="sec-mlc" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
            <SubHeading icon="scale">MLC Details</SubHeading>
            <label class="flex min-h-9 items-center gap-3 font-semibold">
              <input v-model="adm.is_mlc_case" type="checkbox" class="h-5 w-5" />
              Is MLC Case <span class="font-normal text-gray-600">(Medico-Legal Case)</span>
            </label>
            <div v-if="adm.is_mlc_case" :class="GRID">
              <TextField id="mlc_no" v-model="adm.mlc_no" label="MLC No" reqd />
              <SelectField id="mlc_type" v-model="adm.mlc_type" label="Type of Case" :options="MLC_TYPES" />
              <SelectField id="brought_by" v-model="adm.brought_by" label="Brought By" :options="['', 'Police', 'Relative', 'Public', 'Self']" />
              <TextField id="police_station" v-model="adm.police_station" label="Police Station Informed" />
              <TextField id="police_intimation_datetime" v-model="adm.police_intimation_datetime" type="datetime-local" label="Police Intimation Date/Time" />
            </div>
          </section>
        </form>
      </template>
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import BedGrid from '@/components/BedGrid.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import { api, errorText, VISIT } from '@/data/api'
import { hasRole } from '@/data/session'
import { istTimeNowStr, todayStr } from '@/data/registrationRules'

const props = defineProps({ name: { type: String, required: true } })

// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'
const SECTIONS = [
  { id: 'sec-ip', label: 'IP Details' },
  { id: 'sec-consult', label: 'Consultation' },
  { id: 'sec-mlc', label: 'MLC' },
]
const MLC_TYPES = ['', 'RTA (Road Traffic Accident)', 'Assault', 'Poisoning', 'Burn', 'Suicide Attempt', 'Animal Bite', 'Other']

const op = ref(null)
const defaults = ref(null)
const loadError = ref('')

// The new IP form's own fields (Patient Visit "IP Details", "Consultation
// Details", "MLC"), with Desk's defaults: Admitted, today, IST time now.
const adm = reactive({
  accommodation_type: '',
  ward: '',
  bed_no: '',
  room: '',
  room_bed_no: '',
  admission_status: 'Admitted',
  admission_date: todayStr(),
  expected_discharge_date: '',
  discharge_date: '',
  department_name: '',
  doctor_name: '',
  date: todayStr(),
  time: istTimeNowStr(),
  is_mlc_case: false,
  mlc_no: '',
  mlc_type: '',
  brought_by: '',
  police_station: '',
  police_intimation_datetime: '',
})

// refresh(): Admission Status is read-only unless Doctor / System Manager.
const canChangeStatus = computed(() => hasRole('Doctor'))

const wardBeds = ref([])
const roomBeds = ref([])
const roomInfo = ref(null)
const bedsLoading = ref(false)
const bedError = ref('')

const saving = ref(false)
const triedSave = ref(false)
const saveError = ref('')
const saved = ref(null)

let deptFromDefaults = false

onMounted(async () => {
  try {
    op.value = await call('frappe.client.get', { doctype: 'Patient Visit', name: props.name })
    // Same call as Desk's "Admit Patient" button: refuses a non-OP visit or
    // one that was already admitted, with Desk's own message.
    defaults.value = await api(`${VISIT}.get_admission_defaults`, { op_registration: props.name })
  } catch (err) {
    loadError.value = errorText(err) || `Visit ${props.name} could not be admitted.`
    return
  }
  // Only a department actually copied in should skip the doctor reset.
  if (defaults.value.department_name) {
    deptFromDefaults = true
    adm.department_name = defaults.value.department_name
  }
  adm.doctor_name = defaults.value.doctor_name || ''
})

// accommodation_type: switching clears the other side's ward/room and beds
watch(() => adm.accommodation_type, (type) => {
  bedError.value = ''
  if (type === 'Ward') {
    adm.room = ''
    adm.room_bed_no = ''
  } else if (type === 'Room') {
    adm.ward = ''
    adm.bed_no = ''
  }
})

// ward -> get_ward_bed_summary
watch(() => adm.ward, async (ward) => {
  wardBeds.value = []
  adm.bed_no = ''
  if (!ward) return
  bedsLoading.value = true
  try {
    wardBeds.value = (await api(`${VISIT}.get_ward_bed_summary`, { ward }))?.beds || []
  } catch (err) {
    bedError.value = errorText(err)
  } finally {
    bedsLoading.value = false
  }
})

// room -> get_room_details
watch(() => adm.room, async (room) => {
  roomBeds.value = []
  roomInfo.value = null
  adm.room_bed_no = ''
  if (!room) return
  bedsLoading.value = true
  try {
    roomInfo.value = await api(`${VISIT}.get_room_details`, { room })
    roomBeds.value = roomInfo.value?.beds || []
  } catch (err) {
    bedError.value = errorText(err)
  } finally {
    bedsLoading.value = false
  }
})

// bed_no / room_bed_no -> check_bed_availability / check_room_availability
watch(() => adm.bed_no, checkWardBed)
watch(() => adm.room_bed_no, checkRoomBed)

async function checkWardBed() {
  bedError.value = ''
  if (!adm.ward || !adm.bed_no) return
  const bed = adm.bed_no
  try {
    const r = await api(`${VISIT}.check_bed_availability`, { ward: adm.ward, bed_no: bed })
    if (r?.occupied && adm.bed_no === bed) {
      bedError.value = `Bed ${bed} in ward ${adm.ward} is already occupied by ${r.occupied_by}. Please choose a different bed.`
      adm.bed_no = ''
    }
  } catch {
    // The server re-checks on save.
  }
}

async function checkRoomBed() {
  bedError.value = ''
  if (!adm.room || !adm.room_bed_no) return
  const bed = adm.room_bed_no
  try {
    const r = await api(`${VISIT}.check_room_availability`, { room: adm.room, room_bed_no: bed })
    if (r?.occupied && adm.room_bed_no === bed) {
      bedError.value = `Bed ${bed} in room ${adm.room} is already occupied by ${r.occupied_by}. Please choose a different bed.`
      adm.room_bed_no = ''
    }
  } catch {
    // The server re-checks on save.
  }
}

// department_name: clear doctor, auto-pick a lone doctor (skipped for the
// department copied from the OP visit, so its doctor is kept).
watch(() => adm.department_name, async (dept) => {
  if (deptFromDefaults) {
    deptFromDefaults = false
    return
  }
  if (adm.doctor_name) adm.doctor_name = ''
  if (!dept) return
  try {
    const doctors = (await api(`${VISIT}.get_doctors_by_department`, { department: dept })) || []
    if (doctors.length === 1) adm.doctor_name = doctors[0]
  } catch {
    // Doctor stays blank.
  }
})

// is_mlc_case unticked: the hidden MLC fields don't stay filled.
watch(() => adm.is_mlc_case, (on) => {
  if (on) return
  Object.assign(adm, { mlc_no: '', mlc_type: '', brought_by: '', police_station: '', police_intimation_datetime: '' })
})

// validate_mlc_case's rule, checked before sending.
const missing = computed(() => (adm.is_mlc_case && !adm.mlc_no ? ['MLC No'] : []))

async function save() {
  triedSave.value = true
  saveError.value = ''
  if (missing.value.length) return
  saving.value = true
  try {
    const values = {
      ...adm,
      is_mlc_case: adm.is_mlc_case ? 1 : 0,
      police_intimation_datetime: adm.police_intimation_datetime ? `${adm.police_intimation_datetime.replace('T', ' ')}:00` : null,
      expected_discharge_date: adm.expected_discharge_date || null,
      discharge_date: adm.admission_status === 'Discharged' ? adm.discharge_date || null : null,
    }
    saved.value = await api('metta.api.create_ip_admission', { op_visit: props.name, admission: values })
  } catch (err) {
    saveError.value = errorText(err) || 'Could not admit. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
