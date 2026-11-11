<template>
  <!-- Same layout, tiles and lists as before; the look follows the user's
  design (2026-11-11): tinted tiles with icons, a titled table with
  coloured pills, and buttons with icons. -->
  <AppLayout title="My Dashboard" :subtitle="profileLine">
    <template #actions>
      <button type="button" :class="BTN_PLAIN" @click="leaveOpen = true"><LucideIcon name="calendar-plus" class="h-4 w-4 text-gray-500" /> Apply Leave</button>
      <router-link :to="{ name: 'DocList', params: { doctype: 'Doctor Leave' } }" :class="BTN_PLAIN"><LucideIcon name="calendar-days" class="h-4 w-4 text-gray-500" /> My Leaves</router-link>
      <router-link v-if="profile?.name" :to="{ name: 'DocForm', params: { doctype: 'Doctor Master', name: profile.name } }" :class="BTN_PLAIN"><LucideIcon name="user-round" class="h-4 w-4 text-gray-500" /> My Profile</router-link>
      <button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50" aria-label="Refresh" title="Refresh" @click="load"><LucideIcon name="refresh-cw" class="h-4 w-4" /></button>
    </template>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>
    <p v-else-if="stats && !stats.linked" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Your account isn't linked to a Doctor Master record, so there's nothing to show here - ask an administrator to link it.</p>

    <template v-if="stats?.linked">
      <p v-if="stats.leave" class="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"><LucideIcon name="calendar-x" class="h-4 w-4" /> You have Doctor Leave scheduled: {{ stats.leave.from_date }} – {{ stats.leave.to_date }}</p>

      <!-- Main tiles in two rows of four under a heading each (user picked
      option D, 2026-11-11) - not all eight squeezed into one row. Click a
      tile to open those patients in a large popup (user, 2026-11-11). -->
      <div v-for="g in TILE_ROWS" :key="g.label" class="flex flex-col gap-2.5">
        <span class="text-xs font-bold uppercase tracking-[0.06em] text-gray-500">{{ g.label }}</span>
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <button
            v-for="t in g.tiles"
            :key="t.key"
            type="button"
            class="flex items-center gap-4 rounded-2xl border-2 bg-white px-5 py-6 text-left transition-all"
            :class="listOpen && active === t.key ? `${t.active} shadow-md` : `${t.border} hover:shadow-md`"
            aria-haspopup="dialog"
            @click="openList(t.key)"
          >
            <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" :class="t.iconBg"><LucideIcon :name="t.icon" class="h-7 w-7" :class="t.text" /></span>
            <span class="min-w-0">
              <!-- Numbers in black (user, 2026-11-11); colour stays on the icon and border. -->
              <span class="block text-[30px] font-bold leading-none tabular-nums text-gray-900">{{ stats[t.key] ?? 0 }}</span>
              <span class="mt-2 block text-[15px] font-semibold text-gray-600">{{ t.label }}</span>
            </span>
          </button>
        </div>
      </div>

      <!-- The clicked card's patients, in a large popup over the dashboard
      instead of a list pushed below the cards. -->
      <Teleport to="body">
      <div v-if="listOpen" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" @click.self="listOpen = false">
      <section role="dialog" aria-modal="true" :aria-label="activeTile.label" class="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div class="flex items-center gap-2.5 border-b border-gray-200 px-5 py-4">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg" :class="activeTile.iconBg"><LucideIcon :name="activeTile.icon" class="h-4 w-4" :class="activeTile.text" /></span>
          <h2 class="text-lg font-bold text-gray-900">{{ activeTile.label }}</h2>
          <span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-gray-700">{{ activeList.length }}</span>
          <button type="button" class="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Close" @click="listOpen = false"><LucideIcon name="x" class="h-4 w-4" /></button>
        </div>
        <div class="overflow-y-auto">
        <p v-if="dialogError && active === 'discharge'" class="mx-5 my-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ dialogError }}</p>
        <div v-if="!activeList.length" class="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <span class="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100"><LucideIcon name="circle-check" class="h-5 w-5 text-gray-500" /></span>
          <p class="text-sm text-gray-600">Nothing here right now.</p>
        </div>
        <!-- Fixed widths on the first columns keep Visit / Patient / Category lined up on the left instead of spread across the popup. -->
        <table v-else class="w-full table-fixed text-sm">
          <thead class="sticky top-0 border-b border-gray-200 bg-gray-50 text-left text-[13px] font-semibold text-gray-700">
            <tr v-if="active === 'discharge'"><th class="w-[190px] px-5 py-3">Visit</th><th class="w-[240px] px-3 py-3">Patient</th><th class="w-[150px] px-3 py-3">Discharged On</th><th class="px-3 py-3">Discharge Bill</th><th class="w-[220px] px-5 py-3 text-right">Action</th></tr>
            <tr v-else-if="active === 'reports'"><th class="w-[190px] px-5 py-3">Visit</th><th class="w-[240px] px-3 py-3">Patient</th><th class="w-[120px] px-3 py-3">Category</th><th class="px-3 py-3">Tests</th><th class="w-[200px] px-5 py-3 text-right">Action</th></tr>
            <tr v-else><th class="w-[190px] px-5 py-3">Visit</th><th class="w-[240px] px-3 py-3">Patient</th><th class="w-[120px] px-3 py-3">Category</th><th class="px-5 py-3 text-right">Action</th></tr>
          </thead>
          <tbody>
            <tr v-for="v in activeList" :key="v.name" class="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
              <td class="px-5 py-3"><router-link :to="{ name: 'VisitView', params: { name: v.name } }" class="font-mono text-gray-800 hover:text-brand-700 hover:underline">{{ v.name }}</router-link></td>
              <td class="truncate px-3 py-3 font-semibold text-gray-900" :title="v.patient_name">{{ v.patient_name }}</td>
              <template v-if="active === 'discharge'">
                <td class="whitespace-nowrap px-3 py-3 text-gray-700">{{ fmtDate(v.discharge_date) }}</td>
                <!-- Why a summary can or can't be written yet - it waits for
                Billing to submit the Discharge Bill and collect the balance. -->
                <td class="px-3 py-3"><span class="rounded-full px-3 py-1 text-xs font-semibold" :class="billState(v).tone">{{ billState(v).text }}</span></td>
              </template>
              <td v-if="active !== 'discharge'" class="px-3 py-3"><span class="rounded-full px-3 py-1 text-xs font-bold" :class="v.registration_category === 'IP' ? 'bg-blue-50 text-blue-800' : 'bg-cyan-50 text-cyan-800'">{{ v.registration_category }}</span></td>
              <td v-if="active === 'reports'" class="px-3 py-3 text-gray-700">{{ v.tests }}</td>
              <td class="whitespace-nowrap px-5 py-3 text-right">
                <template v-if="active === 'discharge'">
                  <button v-if="v.ready" type="button" :class="BTN_MAIN" @click="writeDischargeSummary(v)"><LucideIcon name="file-pen-line" class="h-4 w-4" /> Write Summary</button>
                  <span v-else class="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">Waiting for Billing</span>
                </template>
                <template v-else-if="active === 'ready' || active === 'referred'">
                  <router-link v-if="active === 'ready' && v.nurse_intervention" :to="{ name: 'NurseForm', params: { name: v.nurse_intervention } }" :class="[BTN_LINK, 'mr-2']"><LucideIcon name="heart-pulse" class="h-4 w-4" /> View Vitals</router-link>
                  <router-link :to="{ name: 'ConsultationForm', params: { name: 'new' }, query: { visit: v.name } }" :class="BTN_MAIN"><LucideIcon name="stethoscope" class="h-4 w-4" /> Consult</router-link>
                </template>
                <template v-else-if="active === 'reports'">
                  <button type="button" :class="BTN_MAIN" @click="reportFor = v"><LucideIcon name="file-text" class="h-4 w-4" /> View Report</button>
                </template>
                <span v-else-if="active === 'waiting'" class="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Waiting on nurse</span>
                <router-link v-else-if="active === 'visited' && v.consultation" :to="{ name: 'ConsultationForm', params: { name: v.consultation } }" :class="BTN_LINK"><LucideIcon name="file-text" class="h-4 w-4" /> View Consultation</router-link>
                <router-link v-else-if="active === 'admitted'" :to="{ name: 'VisitView', params: { name: v.name } }" :class="BTN_LINK"><LucideIcon name="bed-double" class="h-4 w-4" /> View Visit</router-link>
                <span v-else-if="active === 'assigned'" class="rounded-full px-3 py-1 text-xs font-semibold" :class="ASSIGNED_TONE[assignedStatus(v)]">{{ assignedStatus(v) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>
      </div>
      </Teleport>

      <!-- Extra tiles -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button v-for="x in EXTRA" :key="x.key" type="button" class="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-sm hover:shadow-md" @click="extra = x.key">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl" :class="x.tint"><LucideIcon :name="x.icon" class="h-5 w-5" :class="x.text" /></span>
          <span class="flex-1 text-sm font-semibold text-gray-800">{{ x.label }}</span>
          <span class="text-xl font-bold tabular-nums text-gray-900">{{ (stats[x.list] || []).length }}</span>
          <LucideIcon name="chevron-right" class="h-4 w-4 text-gray-400" />
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

    <!-- Patients Referred to Me -->
    <AppDialog :model-value="extra === 'referred'" :title="historyFor ? `History: ${historyFor.patient_name}` : 'Referral History'" @update:model-value="extra = ''; historyFor = null">
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
    <AppDialog :model-value="!!reportFor" size="xl" :title="`Lab Report: ${reportFor?.patient_name || reportFor?.name || ''}`" @update:model-value="reportFor = null">
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
import { formatValue } from '@/data/meta'
import { money } from '@/data/billing/rules'

const router = useRouter()

// Same tiles, order and meaning as the Desk Doctor Dashboard.
// White cards with only a coloured border (user, 2026-11-11): a light border
// normally, the full colour plus a shadow on the picked card. Full class names
// so Tailwind keeps them.
const TILES = [
  { key: 'assigned', label: 'Assigned Today', icon: 'users', border: 'border-blue-200', active: 'border-blue-500', iconBg: 'bg-blue-50', text: 'text-blue-700' },
  { key: 'waiting', label: 'Waiting for Vitals', icon: 'activity', border: 'border-red-200', active: 'border-red-500', iconBg: 'bg-red-50', text: 'text-red-700' },
  { key: 'ready', label: 'Ready to Consult', icon: 'user-check', border: 'border-amber-200', active: 'border-amber-500', iconBg: 'bg-amber-50', text: 'text-amber-700' },
  { key: 'reports', label: 'Lab Reports Ready', icon: 'flask-conical', border: 'border-teal-200', active: 'border-teal-500', iconBg: 'bg-teal-50', text: 'text-teal-700' },
  { key: 'visited', label: 'Visited Today', icon: 'stethoscope', border: 'border-green-200', active: 'border-green-600', iconBg: 'bg-green-50', text: 'text-green-700' },
  { key: 'referred', label: 'Referred to Me', icon: 'share-2', border: 'border-violet-200', active: 'border-violet-500', iconBg: 'bg-violet-50', text: 'text-violet-700' },
  { key: 'admitted', label: 'Admitted (IP)', icon: 'bed-double', border: 'border-gray-300', active: 'border-gray-600', iconBg: 'bg-gray-100', text: 'text-gray-700' },
  // A main tile, not a small popup (user, 2026-11-11): the full list with
  // each patient's Discharge Bill status shows below like the other tiles.
  { key: 'discharge', label: 'Discharge Summary Pending', icon: 'log-out', border: 'border-orange-200', active: 'border-orange-500', iconBg: 'bg-orange-50', text: 'text-orange-700' },
]
// The two rows the tiles show in: today's OP work first, then results,
// referrals and in-patients.
const tilesFor = (keys) => keys.map((k) => TILES.find((t) => t.key === k))
const TILE_ROWS = [
  { label: "Today's OP patients", tiles: tilesFor(['assigned', 'waiting', 'ready', 'visited']) },
  { label: 'Results, referrals & in-patients', tiles: tilesFor(['reports', 'referred', 'admitted', 'discharge']) },
]
// "Referral History" (every referral to this doctor), so it isn't confused
// with the "Referred to Me" tile (referrals still waiting to be seen).
const EXTRA = [
  { key: 'appointments', label: "Today's Appointments", list: 'appointments_today', icon: 'calendar-days', tint: 'bg-cyan-50', text: 'text-cyan-700' },
  { key: 'referred', label: 'Referral History', list: 'referred_to_me', icon: 'history', tint: 'bg-violet-50', text: 'text-violet-700' },
]
// Buttons, in the design's style (full class names so Tailwind keeps them).
const BTN_MAIN = 'inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800'
const BTN_LINK = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50'
const BTN_PLAIN = 'flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50'
// Assigned Today's status, as a coloured pill.
const ASSIGNED_TONE = {
  Visited: 'bg-green-50 text-green-800',
  'Ready to Consult': 'bg-amber-50 text-amber-800',
  'Waiting for Vitals': 'bg-red-50 text-red-800',
}

const stats = ref(null)
const profile = ref(null)
const error = ref('')
const active = ref('ready')
// Card lists open in a popup (z-40) so the Lab Report / leave dialogs (z-50) still open on top of it.
const listOpen = ref(false)
function openList(key) {
  active.value = key
  listOpen.value = true
}
function onEsc(e) {
  if (e.key === 'Escape' && listOpen.value && !reportFor.value) listOpen.value = false
}
const extra = ref('')
const historyFor = ref(null)
const reportFor = ref(null)
const dialogError = ref('')

const activeTile = computed(() => TILES.find((t) => t.key === active.value))
const activeList = computed(() => stats.value?.[active.value === 'discharge' ? 'discharge_pending_visits' : `${active.value}_visits`] || [])

const fmtDate = (v) => (v ? formatValue({ fieldtype: 'Date' }, v) : '')
// The Discharge Bill's state, in the order Billing works through it.
function billState(v) {
  if (v.ready) return { text: `Paid · ${v.discharge_bill}`, tone: 'bg-green-50 text-green-800' }
  if (!v.discharge_bill) return { text: 'Not made yet', tone: 'bg-amber-50 text-amber-900' }
  if (!v.bill_submitted) return { text: `${v.discharge_bill} not submitted`, tone: 'bg-amber-50 text-amber-900' }
  return { text: `${money(v.balance_due)} due on ${v.discharge_bill}`, tone: 'bg-red-50 text-red-800' }
}
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
    // The Discharge Summary's own screen - the same one the visit's
    // "Discharge Summary" button opens.
    router.push({ name: 'WardDischargeSummaryForm', params: { name: 'new' }, query: defaults })
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
  window.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onEsc)
})
</script>
