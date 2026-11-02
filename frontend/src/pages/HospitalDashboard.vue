<template>
  <AppLayout title="Hospital Dashboard" :subtitle="tab === 'today' ? dayLabel : ''">
    <template #actions>
      <input v-if="tab === 'today'" v-model="day" type="date" :max="today" aria-label="Day" class="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm" @change="load" />
      <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="loading" @click="refresh">Refresh</button>
    </template>

    <div class="flex gap-2" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        :aria-selected="tab === t.key"
        class="h-9 rounded-md border px-4 text-sm font-semibold"
        :class="tab === t.key ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Clinical / Stock: the former Reports > Hospital Overview. -->
    <OverviewPanel v-if="tab !== 'today'" ref="overview" :tab="tab" />

    <p v-else-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>
    <p v-else-if="loading && !data" class="text-sm text-gray-600">Loading…</p>

    <template v-if="tab === 'today' && data">
      <SectionTitle plain title="Front Desk" icon="clipboard-list" />
      <SummaryCards tinted :cards="cards.frontDesk" />

      <SectionTitle plain title="Doctors" icon="stethoscope" />
      <SummaryCards tinted :cards="cards.doctors" />
      <ReportTable v-if="data.doctors.by_doctor.length" heading="Doctor-wise" :columns="DOC_COLS" :rows="data.doctors.by_doctor" empty="">
        <template #cell="{ col, value }">{{ col.key === 'pct' ? `${value}%` : value }}</template>
      </ReportTable>

      <SectionTitle plain title="Ward / IP" icon="bed-double" />
      <SummaryCards tinted :cards="cards.ward" />

      <SectionTitle plain title="Lab" icon="flask-conical" />
      <SummaryCards tinted :cards="cards.lab" />

      <SectionTitle plain title="Billing" icon="receipt-text" />
      <SummaryCards tinted :cards="cards.billing" />

      <SectionTitle plain title="Pharmacy & Stock" icon="pill" />
      <SummaryCards tinted :cards="cards.pharmacy" />
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import SummaryCards from '@/components/reports/SummaryCards.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import OverviewPanel from '@/components/dashboard/OverviewPanel.vue'
import { api, errorText } from '@/data/api'
import { money, todayStr, addDays } from '@/data/reports/format'
import { drillRoute } from '@/data/dashboardDrill'

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'clinical', label: 'Clinical Overview' },
  { key: 'stock', label: 'Stock & Pharmacy' },
]
const tab = ref('today')
const overview = ref(null)

const DOC_COLS = [
  { key: 'doctor', label: 'Doctor' },
  { key: 'visits', label: 'Visits', type: 'number' },
  { key: 'seen', label: 'Seen', type: 'number' },
  { key: 'pct', label: 'Seen %', type: 'number' },
]

const today = todayStr()
const day = ref(today)
const data = ref(null)
const loading = ref(false)
const error = ref('')

const dayLabel = computed(() =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day.value}T00:00:00`)),
)

// A card is tinted only when its number needs someone's attention, the
// same way the Hospital Overview highlights non-zero pending counts.
const warn = (n) => (n ? 'warn' : undefined)
const bad = (n) => (n ? 'bad' : undefined)

// Each card opens its list (drillRoute); a row there opens the record.
const router = useRouter()
const card = (label, value, drill, extra = {}) => ({ label, value, click: drill ? () => router.push(drillRoute(...drill, label)) : null, ...extra })

const cards = computed(() => {
  const { front_desk: f, doctors: d, ward: w, lab: l, billing: b, pharmacy: p } = data.value
  const on = ['between', [`${data.value.date} 00:00:00`, `${data.value.date} 23:59:59`]]
  const names = (list) => ['in', list?.length ? list : ['']]
  return {
    frontDesk: [
      card('New registrations', f.registrations, ['Patient Registration', { creation: on }]),
      card('OP visits', f.op_visits, ['Patient Visit', { creation: on, registration_category: 'OP' }]),
      card('IP visits', f.ip_visits, ['Patient Visit', { creation: on, registration_category: 'IP' }]),
      card('Waiting for doctor', f.waiting_for_doctor, ['Patient Visit', { name: names(f.waiting_visits) }], { tone: warn(f.waiting_for_doctor) }),
      card('Vitals pending', f.vitals_pending, ['Nurse Interventions', { date: on, status: ['!=', 'Completed'] }], { tone: warn(f.vitals_pending) }),
    ],
    doctors: [
      card('Patients seen', `${d.consultations} / ${d.visits}`, ['Doctor Consultation', { consultation_datetime: on }], { sub: `${d.seen_pct}% of visits` }),
      card('Referrals', d.referrals, ['Doctor Consultation', { consultation_datetime: on, referred_to: ['is', 'set'] }]),
    ],
    ward: [
      card('Admitted now', w.admitted, ['Patient Visit', { registration_category: 'IP', admission_status: 'Admitted' }]),
      // Beds are a board, not a list - this one opens the ward board.
      { label: 'Beds occupied', value: `${w.beds_occupied} / ${w.beds_total}`, sub: `${Math.max(w.beds_total - w.beds_occupied, 0)} free`, click: () => router.push({ name: 'WardBoard' }), clickLabel: 'View wards' },
      card('Admitted, no bed yet', w.not_in_bed, ['Patient Visit', { name: names(w.not_in_bed_visits) }], { tone: warn(w.not_in_bed) }),
      card('Admissions', w.admissions, ['Patient Visit', { admission_date: data.value.date }]),
      card('Discharges', w.discharges, ['Patient Visit', { admission_status: 'Discharged', discharge_date: data.value.date }]),
    ],
    lab: [
      card('Tests ordered', l.ordered, ['Diagnostic Test', { ordered_on: on }]),
      card('Awaiting sample', l.awaiting_sample, ['Diagnostic Test', { status: 'Ordered' }], { tone: warn(l.awaiting_sample) }),
      card('In progress', l.in_progress, ['Diagnostic Test', { status: ['in', ['Sample Collected', 'Result Entered']] }]),
      card('Past due time', l.late, ['Diagnostic Test', { name: names(l.late_tests) }], { tone: bad(l.late) }),
      card('Reported', l.reported, ['Diagnostic Test', { reported_on: on }]),
    ],
    billing: [
      card('Collected', money(b.total_collected), ['Billing', { docstatus: 1, sale_datetime: on }]),
      ...Object.entries(b.by_mode).map(([mode, amt]) =>
        card(mode, money(amt), ['Billing', { docstatus: 1, sale_datetime: on, payment_mode: mode === 'Unspecified' ? ['is', 'not set'] : mode }]),
      ),
      card('Advances', money(b.advance_amount), ['Patient Advance', { received_on: on }], { sub: `${b.advance_count} received` }),
      card('Discharge bills due', money(b.discharge_due_amount), ['Discharge Bill', { docstatus: 1, balance_due: ['>', 0] }], { sub: `${b.discharge_due_count} bills`, tone: warn(b.discharge_due_count) }),
    ],
    pharmacy: [
      card('Low stock', p.low_stock, ['Stock Balance', { name: names(p.low_stock_names) }], { tone: warn(p.low_stock) }),
      card('Expiring soon', p.expiring_soon, ['Batch', { expiry_date: ['between', [today, addDays(today, 90)]] }], { tone: warn(p.expiring_soon) }),
      card('Expired, still in stock', p.expired, ['Batch', { expiry_date: ['<', today] }], { tone: bad(p.expired) }),
    ],
  }
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api('metta.vue.dashboard.get_hospital_dashboard', { date: day.value })
  } catch (err) {
    error.value = errorText(err) || 'Could not load the dashboard. Please try again.'
  } finally {
    loading.value = false
  }
}
function refresh() {
  if (tab.value === 'today') load()
  else overview.value?.load()
}
onMounted(load)
</script>
