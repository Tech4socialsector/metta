<template>
  <AppLayout title="My Dashboard" :subtitle="profileLine">
    <template #actions>
      <button type="button" class="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50" @click="leaveOpen = true">Apply Leave</button>
      <router-link :to="{ name: 'DocList', params: { doctype: 'Doctor Leave' } }" class="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">My Leaves</router-link>
      <router-link v-if="profile?.name" :to="{ name: 'DocForm', params: { doctype: 'Doctor Master', name: profile.name } }" class="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">My Profile</router-link>
      <button type="button" class="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white hover:bg-gray-50" aria-label="Refresh" title="Refresh" @click="load"><LucideIcon name="refresh-cw" class="h-4 w-4" /></button>
    </template>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>
    <p v-else-if="stats && !stats.linked" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Your account isn't linked to a Doctor Master record, so there's nothing to show here - ask an administrator to link it.</p>

    <template v-if="stats?.linked">
      <p v-if="stats.leave" class="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">You have Doctor Leave scheduled: {{ stats.leave.from_date }} – {{ stats.leave.to_date }}</p>

      <!-- Main tiles: click to list those patients -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <button
          v-for="t in TILES"
          :key="t.key"
          type="button"
          class="flex flex-col items-start gap-1 rounded-xl border-2 bg-white px-4 py-3 text-left shadow-sm"
          :class="active === t.key ? t.ring : 'border-transparent hover:border-gray-200'"
          :aria-pressed="active === t.key"
          @click="active = t.key"
        >
          <span class="text-sm text-gray-600">{{ t.label }}</span>
          <span class="text-3xl font-bold" :class="t.text">{{ stats[t.key] ?? 0 }}</span>
        </button>
      </div>

      <section class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div class="border-b border-gray-100 px-5 py-3 font-semibold">{{ activeTile.label }}</div>
        <p v-if="!activeList.length" class="px-5 py-8 text-center text-gray-600">Nothing here right now.</p>
        <table v-else class="w-full text-sm">
          <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th class="px-5 py-2">Visit</th><th class="px-3 py-2">Patient</th><th class="px-3 py-2">Category</th><th class="px-5 py-2 text-right"><span class="sr-only">Action</span></th></tr>
          </thead>
          <tbody>
            <tr v-for="v in activeList" :key="v.name" class="border-b border-gray-100 last:border-0">
              <td class="px-5 py-2.5"><router-link :to="{ name: 'VisitView', params: { name: v.name } }" class="font-mono text-brand-700 hover:underline">{{ v.name }}</router-link></td>
              <td class="px-3 py-2.5 font-medium">{{ v.patient_name }}</td>
              <td class="px-3 py-2.5"><StatusBadge :status="v.registration_category" /></td>
              <td class="whitespace-nowrap px-5 py-2.5 text-right">
                <template v-if="active === 'ready' || active === 'referred'">
                  <router-link v-if="active === 'ready' && v.nurse_intervention" :to="{ name: 'NurseForm', params: { name: v.nurse_intervention } }" class="mr-3 text-sm font-semibold text-brand-700 hover:underline">View Vitals</router-link>
                  <router-link :to="{ name: 'ConsultationForm', params: { name: 'new' }, query: { visit: v.name } }" class="inline-flex h-8 items-center rounded-md bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800">Consult</router-link>
                </template>
                <template v-else-if="active === 'reports'">
                  <span class="mr-3 text-sm text-gray-600">{{ v.tests }}</span>
                  <button type="button" class="inline-flex h-8 items-center rounded-md bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800" @click="reportFor = v">View Report</button>
                </template>
                <span v-else-if="active === 'waiting'" class="text-sm text-gray-600">Waiting on nurse</span>
                <router-link v-else-if="active === 'visited' && v.consultation" :to="{ name: 'ConsultationForm', params: { name: v.consultation } }" class="text-sm font-semibold text-brand-700 hover:underline">View Consultation</router-link>
                <router-link v-else-if="active === 'admitted'" :to="{ name: 'VisitView', params: { name: v.name } }" class="text-sm font-semibold text-brand-700 hover:underline">View Visit</router-link>
                <span v-else-if="active === 'assigned'" class="text-sm text-gray-600">{{ assignedStatus(v) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Extra tiles -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button v-for="x in EXTRA" :key="x.key" type="button" class="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-gray-50" @click="extra = x.key">
          <span class="text-sm font-medium text-gray-700">{{ x.label }}</span>
          <span class="text-xl font-bold">{{ (stats[x.list] || []).length }}</span>
        </button>
      </div>
    </template>

    <!-- Today's Appointments -->
    <AppDialog :model-value="extra === 'appointments'" title="Today's Appointments" @update:model-value="extra = ''">
      <p v-if="!stats?.appointments_today?.length" class="text-sm text-gray-600">Nothing scheduled for today.</p>
      <table v-else class="w-full text-sm">
        <thead class="text-left text-xs uppercase text-gray-500"><tr><th class="py-1.5">Time</th><th>Patient</th><th>Status</th><th>Reason</th></tr></thead>
        <tbody>
          <tr v-for="a in stats.appointments_today" :key="a.name" class="cursor-pointer border-t border-gray-100 hover:bg-gray-50" @click="openAppointment(a)">
            <td class="py-2">{{ a.appointment_time }}</td><td class="font-medium">{{ a.patient_name }}</td><td><StatusBadge :status="a.status" /></td><td class="text-gray-600">{{ a.reason_for_visit }}</td>
          </tr>
        </tbody>
      </table>
    </AppDialog>

    <!-- Discharge Summary Pending -->
    <AppDialog :model-value="extra === 'discharge'" title="Discharge Summary Pending" @update:model-value="extra = ''">
      <p v-if="!stats?.discharge_pending_visits?.length" class="text-sm text-gray-600">Nothing pending.</p>
      <template v-else>
        <table class="w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500"><tr><th class="py-1.5">Visit</th><th>Patient</th><th>Discharged On</th></tr></thead>
          <tbody>
            <tr v-for="v in stats.discharge_pending_visits" :key="v.name" class="cursor-pointer border-t border-gray-100 hover:bg-gray-50" @click="writeDischargeSummary(v)">
              <td class="py-2 font-mono">{{ v.name }}</td><td class="font-medium">{{ v.patient_name }}</td><td>{{ v.discharge_date }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-3 text-sm text-gray-600">Click a row to write that patient's Discharge Summary.</p>
        <p v-if="dialogError" class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ dialogError }}</p>
      </template>
    </AppDialog>

    <!-- Patients Referred to Me -->
    <AppDialog :model-value="extra === 'referred'" :title="historyFor ? `History: ${historyFor.patient_name}` : 'Patients Referred to Me'" @update:model-value="extra = ''; historyFor = null">
      <template v-if="historyFor">
        <button type="button" class="mb-3 text-sm font-semibold text-brand-700 hover:underline" @click="historyFor = null">← Back to list</button>
        <PatientHistory :visit="historyFor.patient_consultation" />
      </template>
      <p v-else-if="!stats?.referred_to_me?.length" class="text-sm text-gray-600">No patients referred to you right now.</p>
      <template v-else>
        <table class="w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500"><tr><th class="py-1.5">Patient</th><th>Referred By</th><th>Date</th><th>Diagnosis</th></tr></thead>
          <tbody>
            <tr v-for="r in stats.referred_to_me" :key="r.name" class="cursor-pointer border-t border-gray-100 hover:bg-gray-50" @click="historyFor = r">
              <td class="py-2 font-medium">{{ r.patient_name }}</td><td>{{ r.doctor }}</td><td>{{ String(r.consultation_datetime || '').slice(0, 10) }}</td><td class="text-gray-600">{{ r.diagnosis }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-3 text-sm text-gray-600">Click a row to see that patient's full history.</p>
      </template>
    </AppDialog>

    <!-- Lab report, with the review consultation as the next step (as in Desk) -->
    <AppDialog :model-value="!!reportFor" :title="`Lab Report: ${reportFor?.patient_name || reportFor?.name || ''}`" @update:model-value="reportFor = null">
      <LabReports v-if="reportFor" :consultation="reportFor.consultation" />
      <template #footer>
        <router-link v-if="reportFor" :to="{ name: 'ConsultationForm', params: { name: 'new' }, query: { visit: reportFor.name } }" class="inline-flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">Review Consultation</router-link>
      </template>
    </AppDialog>

    <!-- Apply Leave -->
    <AppDialog v-model="leaveOpen" title="Apply Leave">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField id="leave-from" v-model="leave.from_date" type="date" label="From Date" reqd />
        <TextField id="leave-to" v-model="leave.to_date" type="date" label="To Date" reqd />
        <div class="sm:col-span-2"><TextField id="leave-reason" v-model="leave.reason" type="textarea" label="Reason" /></div>
      </div>
      <p v-if="leaveError" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ leaveError }}</p>
      <template #footer>
        <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="leaveBusy" @click="applyLeave">Apply</button>
      </template>
    </AppDialog>
  </AppLayout>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import AppDialog from '@/components/AppDialog.vue'
import TextField from '@/components/TextField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PatientHistory from '@/components/PatientHistory.vue'
import LabReports from '@/components/lab/LabReports.vue'
import { api, errorText, DC, VISIT } from '@/data/api'
import { todayStr } from '@/data/registrationRules'

const router = useRouter()

// Same tiles, order and meaning as the Desk Doctor Dashboard.
const TILES = [
  { key: 'assigned', label: 'Assigned Today', ring: 'border-blue-500', text: 'text-blue-700' },
  { key: 'waiting', label: 'Waiting for Vitals', ring: 'border-red-500', text: 'text-red-700' },
  { key: 'ready', label: 'Ready to Consult', ring: 'border-amber-500', text: 'text-amber-700' },
  { key: 'reports', label: 'Lab Reports Ready', ring: 'border-brand-600', text: 'text-brand-700' },
  { key: 'visited', label: 'Visited Today', ring: 'border-green-600', text: 'text-green-700' },
  { key: 'referred', label: 'Referred to Me', ring: 'border-violet-500', text: 'text-violet-700' },
  { key: 'admitted', label: 'Admitted (IP)', ring: 'border-gray-500', text: 'text-gray-700' },
]
const EXTRA = [
  { key: 'appointments', label: "Today's Appointments", list: 'appointments_today' },
  { key: 'discharge', label: 'Discharge Summary Pending', list: 'discharge_pending_visits' },
  { key: 'referred', label: 'Referred to Me', list: 'referred_to_me' },
]

const stats = ref(null)
const profile = ref(null)
const error = ref('')
const active = ref('ready')
const extra = ref('')
const historyFor = ref(null)
const reportFor = ref(null)
const dialogError = ref('')

const activeTile = computed(() => TILES.find((t) => t.key === active.value))
const activeList = computed(() => stats.value?.[`${active.value}_visits`] || [])
const profileLine = computed(() => {
  const p = profile.value
  if (!p) return ''
  return [p.name, p.department, p.specialization, p.qualification, p.registration_number && `Reg. No. ${p.registration_number}`, p.mobile].filter(Boolean).join(' · ')
})

function assignedStatus(v) {
  const s = stats.value
  if ((s.visited_visits || []).some((x) => x.name === v.name)) return 'Visited'
  if ((s.ready_visits || []).some((x) => x.name === v.name)) return 'Ready to Consult'
  return 'Waiting for Vitals'
}

async function load() {
  error.value = ''
  try {
    const [s, p] = await Promise.all([api(`${DC}.get_my_dashboard_stats`), api(`${DC}.get_my_profile`)])
    stats.value = s
    profile.value = p
  } catch (err) {
    error.value = errorText(err) || 'Could not load the dashboard.'
  }
}

function openAppointment(a) {
  extra.value = ''
  if (a.patient_visit) router.push({ name: 'VisitView', params: { name: a.patient_visit } })
  else router.push({ name: 'DocForm', params: { doctype: 'Appointment', name: a.name } })
}

// Same check as Desk: refused until the admission is Discharged and its
// Discharge Bill is fully paid.
async function writeDischargeSummary(v) {
  dialogError.value = ''
  try {
    const defaults = await api(`${VISIT}.get_discharge_defaults`, { patient_visit: v.name })
    extra.value = ''
    router.push({ name: 'DocForm', params: { doctype: 'Discharge Summary', name: 'new' }, query: defaults })
  } catch (err) {
    dialogError.value = errorText(err)
  }
}

const leaveOpen = ref(false)
const leaveBusy = ref(false)
const leaveError = ref('')
const leave = reactive({ from_date: todayStr(), to_date: todayStr(), reason: '' })
async function applyLeave() {
  leaveError.value = ''
  if (!leave.from_date || !leave.to_date) {
    leaveError.value = 'From Date and To Date are required.'
    return
  }
  leaveBusy.value = true
  try {
    await api(`${DC}.apply_my_leave`, { ...leave })
    leaveOpen.value = false
    await load()
  } catch (err) {
    leaveError.value = errorText(err)
  } finally {
    leaveBusy.value = false
  }
}

// Desk refreshes on the "doctor_dashboard_update" event; here the
// dashboard re-reads every 30 seconds while it is open.
let timer = null
onMounted(() => {
  load()
  timer = setInterval(load, 30000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>
