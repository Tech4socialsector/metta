<template>
  <!-- The former Reports > Hospital Overview, now the dashboard's Clinical
  and Stock & Pharmacy tabs (user, 2026-10-29). The dashboard owns the tab
  buttons; this keeps the Desk page's filters, cards and tables as they were. -->
  <div class="flex flex-col gap-5">
    <!-- Filters: each tab has its own pickers; the dates are shared, as in Desk. -->
    <section class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <template v-if="tab === 'clinical'">
          <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-800">
            Doctor
            <select v-model="draft.doctor" :class="SELECT">
              <option value="">All Doctors</option>
              <option v-for="d in lists.doctors" :key="d" :value="d">{{ d }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-800">
            Category
            <select v-model="draft.category" :class="SELECT">
              <option value="">All Categories</option>
              <option v-for="c in lists.categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
        </template>
        <template v-else>
          <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-800">
            Warehouse
            <select v-model="draft.warehouse" :class="SELECT">
              <option value="">All Warehouses</option>
              <option v-for="w in lists.warehouses" :key="w" :value="w">{{ w }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-800">
            Item Category
            <select v-model="draft.item_category" :class="SELECT">
              <option v-for="c in ITEM_CATEGORIES" :key="c" :value="c">{{ c || 'All Categories' }}</option>
            </select>
          </label>
        </template>
        <TextField id="ho-from" v-model="draft.from_date" label="Start Date" type="date" />
        <TextField id="ho-to" v-model="draft.to_date" label="End Date" type="date" />
        <div class="flex gap-2">
          <button type="button" class="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" @click="clear">Clear</button>
          <button type="button" :class="GEN_BTN" @click="apply">Apply</button>
        </div>
      </div>
    </section>

    <p v-if="error" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>
    <p v-if="loading" class="text-sm text-gray-600" aria-live="polite">Loading…</p>

    <!-- Clinical Overview -->
    <template v-if="tab === 'clinical' && clinical">
      <SectionTitle plain title="Patient Volume" icon="users" />
      <SummaryCards tinted :cards="clinicalCards.volume" />

      <SectionTitle plain title="Clinical Flow" icon="stethoscope" />
      <SummaryCards tinted :cards="clinicalCards.flow" />
      <ReportTable heading="Doctor-wise" :columns="DOC_COLS" :rows="clinical.doctor_table || []" empty="No data in this range">
        <template #cell="{ col, value }">{{ col.key === 'pct' ? `${value}%` : value }}</template>
      </ReportTable>

      <SectionTitle plain title="Admission & Discharge" icon="bed" />
      <SummaryCards tinted :cards="clinicalCards.admission" />

      <SectionTitle plain title="Billing · Subsidy (Charity) · TDS" icon="wallet" />
      <SummaryCards tinted :cards="clinicalCards.billing" />
      <template v-if="clinicalCards.modes.length">
        <SectionTitle plain title="Collections by Payment Mode" icon="credit-card" />
        <SummaryCards tinted :cards="clinicalCards.modes" />
      </template>

      <SectionTitle plain title="Patient Mix" icon="pie-chart" />
      <SummaryCards tinted v-if="clinicalCards.mix.length" :cards="clinicalCards.mix" />
      <p v-else class="text-sm text-gray-600">No visits in this range</p>
    </template>

    <!-- Stock & Pharmacy -->
    <template v-if="tab === 'stock' && stock">
      <SectionTitle plain title="Stock Levels & Alerts" icon="package" />
      <SummaryCards tinted :cards="stockCards.levels" />
      <template v-if="stockCards.locations.length">
        <SectionTitle plain title="Stock Value by Location" icon="warehouse" />
        <SummaryCards tinted :cards="stockCards.locations" />
      </template>

      <SectionTitle plain title="Procurement" icon="shopping-cart" />
      <SummaryCards tinted :cards="stockCards.procurement" />

      <SectionTitle plain title="Consumption" icon="activity" />
      <SummaryCards tinted :cards="stockCards.consumption" />
      <ReportTable heading="Top Suppliers by Spend" :columns="SUPPLIER_COLS" :rows="stock.top_suppliers || []" empty="No bills in this range">
        <template #cell="{ col, value }">
          <Pill v-if="col.key === 'status'" :label="value" :color="value === 'Paid' ? 'green' : value === 'Overdue' ? 'red' : 'orange'" />
          <template v-else-if="col.key === 'spend'">{{ money(value) }}</template>
          <template v-else>{{ value }}</template>
        </template>
      </ReportTable>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import SummaryCards from '@/components/reports/SummaryCards.vue'
import Pill from '@/components/reports/Pill.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import TextField from '@/components/TextField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { GEN_BTN } from '@/data/reports/catalog'
import { useRouter } from 'vue-router'
import { drillRoute } from '@/data/dashboardDrill'
import { money, todayStr, addDays } from '@/data/reports/format'

// Desk page: metta/metta/page/hospital_overview (no export there either).
const M = 'metta.metta.page.hospital_overview.hospital_overview'
const props = defineProps({ tab: { type: String, default: 'clinical' } })
const ITEM_CATEGORIES = ['', 'Medicine', 'Consumable']
const PENDING_PO_STATUSES = ['Pending Approval', 'Approved', 'Sent to Dealer', 'Partially Received']
const SELECT = 'h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-[15px] font-normal focus:outline-none focus:ring-2 focus:ring-brand-600'
const DOC_COLS = [
  { key: 'doctor', label: 'Doctor' },
  { key: 'visits', label: 'Visits', type: 'number' },
  { key: 'seen', label: 'Seen', type: 'number' },
  { key: 'pct', label: 'Seen %', type: 'number' },
]
const SUPPLIER_COLS = [
  { key: 'supplier', label: 'Supplier' },
  { key: 'orders', label: 'Orders', type: 'number' },
  { key: 'spend', label: 'Spend', type: 'currency' },
  { key: 'status', label: 'Payment Status' },
]

const { loading, error, run } = useRunner()
// The dashboard's Refresh button reloads whichever tab is open.
defineExpose({ load })
const tab = computed(() => props.tab)
// Applied filters (sent to the server) and the editable copy in the bar -
// Desk only reads the bar when Apply is clicked.
const applied = reactive({ from_date: '', to_date: '', doctor: '', category: '', warehouse: '', item_category: '' })
const draft = reactive({ ...applied })
const lists = reactive({ doctors: [], categories: [], warehouses: [] })
const clinical = ref(null)
const stock = ref(null)

async function load() {
  if (tab.value === 'stock') {
    const r = await run(`${M}.get_stock_data`, {
      from_date: applied.from_date,
      to_date: applied.to_date,
      warehouse: applied.warehouse || null,
      category: applied.item_category || null,
    })
    if (r) stock.value = r
  } else {
    const r = await run(`${M}.get_dashboard_data`, {
      from_date: applied.from_date,
      to_date: applied.to_date,
      doctor: applied.doctor || null,
      category: applied.category || null,
    })
    if (r) clinical.value = r
  }
}
// The dashboard switches tabs: unsaved edits in the filter bar are dropped.
watch(tab, () => {
  Object.assign(draft, applied)
  load()
})
// Desk keeps the previous date when a date box is emptied before Apply.
function apply() {
  applied.from_date = draft.from_date || applied.from_date
  applied.to_date = draft.to_date || applied.to_date
  if (tab.value === 'stock') Object.assign(applied, { warehouse: draft.warehouse, item_category: draft.item_category })
  else Object.assign(applied, { doctor: draft.doctor, category: draft.category })
  Object.assign(draft, applied)
  load()
}
function clear() {
  applied.from_date = applied.to_date = ''
  if (tab.value === 'stock') applied.warehouse = applied.item_category = ''
  else applied.doctor = applied.category = ''
  Object.assign(draft, applied)
  load()
}

Promise.all([run(`${M}.get_doctors`), run(`${M}.get_categories`), run(`${M}.get_warehouses`)]).then(([d, c, w]) => {
  lists.doctors = d || []
  lists.categories = c || []
  lists.warehouses = w || []
  load()
})

// A card opens its filtered list in the app; a row there opens the record.
const router = useRouter()
function between(data) {
  const r = data.range || {}
  return ['between', [`${r.from_date} 00:00:00`, `${r.to_date} 23:59:59`]]
}
const tile = (label, value, drill, extra = {}) => ({ label, value, click: drill ? () => router.push(drillRoute(...drill, label)) : null, ...extra })

const clinicalCards = computed(() => {
  const d = clinical.value
  const b = between(d)
  const doctor = applied.doctor || undefined
  const category = applied.category || undefined
  const delta = d.registered_delta === null || d.registered_delta === undefined ? '' : `${d.registered_delta >= 0 ? '+' : ''}${d.registered_delta} vs yesterday`
  const pending = d.discharge_summary_pending || 0
  const modes = Object.entries(d.collected_by_mode || {}).sort((a, z) => z[1] - a[1])
  return {
    volume: [
      tile('Registered', d.registered_count || 0, ['Patient Registration', { creation: b, billing_category: category }], { sub: delta }),
      tile('OP Visits', d.visits_op || 0, ['Patient Visit', { creation: b, registration_category: 'OP' }]),
      tile('IP Visits', d.visits_ip || 0, ['Patient Visit', { creation: b, registration_category: 'IP' }]),
      tile('Currently Admitted (IP)', d.currently_admitted || 0, ['Patient Visit', { admission_status: 'Admitted' }]),
    ],
    flow: [
      tile('Vitals Completed', d.nurse_done || 0, ['Nurse Interventions', { date: b, status: 'Completed' }]),
      tile('Vitals Pending', d.nurse_pending || 0, ['Nurse Interventions', { date: b, status: 'Pending' }]),
      tile(`Seen by Doctor — ${applied.doctor || 'All Doctors'}`, d.seen_count || 0, ['Doctor Consultation', { consultation_datetime: b, doctor }]),
      tile('Referrals', d.referral_count || 0, ['Doctor Consultation', { consultation_datetime: b, doctor, referred_to: ['is', 'set'] }]),
    ],
    admission: [
      tile('Discharged', d.discharged_count || 0, ['Patient Visit', { admission_status: 'Discharged', discharge_date: b }]),
      tile('Discharge Summary Pending', pending, pending > 0 ? ['Patient Visit', { name: ['in', d.discharge_summary_pending_visits || []] }] : null, {
        sub: pending > 0 ? 'Needs follow-up' : 'All caught up',
        tone: pending > 0 ? 'warn' : 'good',
      }),
      tile('MLC Cases', d.mlc_count || 0, ['Patient Visit', { creation: b, is_mlc_case: 1 }]),
    ],
    billing: [
      tile('Total Collected', money(d.total_collected || 0), ['Billing', { docstatus: 1, sale_datetime: b, billing_category: category }]),
      tile('Advance Collected', money(d.advance_collected_amount || 0), ['Patient Advance', { received_on: b }]),
      tile('Subsidy — General Patients', money(d.subsidy_general_amount || 0), ['Billing', { docstatus: 1, sale_datetime: b, billing_category: 'General', charity_amount: ['>', 0] }]),
      tile('Subsidy — Staff & Dependents', money(d.subsidy_staff_amount || 0), [
        'Billing',
        { docstatus: 1, sale_datetime: b, billing_category: ['in', ['Staff', 'Staff Dependent']], charity_amount: ['>', 0] },
      ]),
      tile('TDS / Markup Collected', money(d.tds_amount || 0), ['Billing', { docstatus: 1, sale_datetime: b, adjustment_type: 'Increase', charity_amount: ['>', 0] }]),
    ],
    modes: modes.map(([mode, amt]) =>
      tile(mode, money(amt), ['Billing', { docstatus: 1, sale_datetime: b, payment_mode: mode === 'Unspecified' ? ['is', 'not set'] : mode, billing_category: category }], {
        clickLabel: 'View bills',
      }),
    ),
    mix: (d.patient_mix || []).map((row) =>
      tile(row.category, row.count, ['Patient Visit', { creation: b, billing_category: row.category === 'Unspecified' ? ['is', 'not set'] : row.category }]),
    ),
  }
})

const stockCards = computed(() => {
  const d = stock.value
  const b = between(d)
  const today = todayStr()
  return {
    levels: [
      tile('Low Stock Items', d.low_stock_count || 0, ['Stock Balance', { name: ['in', d.low_stock_names || []] }]),
      tile('Near-Expiry Batches', d.near_expiry_count || 0, ['Batch', { expiry_date: ['between', [today, addDays(today, 90)]] }]),
      tile('Expired Stock (not removed)', d.expired_count || 0, ['Batch', { expiry_date: ['<', today] }], {
        sub: `${money(d.expired_value || 0)} — remove now`,
        tone: d.expired_count ? 'bad' : undefined,
      }),
      tile('Total Stock Value', money(d.total_stock_value || 0), ['Stock Balance', { actual_qty: ['>', 0], warehouse: applied.warehouse || undefined }]),
    ],
    locations: (d.stock_by_location || []).map((row) =>
      tile(row.category, money(row.value), ['Stock Balance', { actual_qty: ['>', 0], warehouse: ['in', row.warehouses || []] }]),
    ),
    procurement: [
      tile('Pending Purchase Orders', d.pending_po_count || 0, ['Purchase Order', { status: ['in', PENDING_PO_STATUSES] }]),
      tile('Overdue Deliveries', d.overdue_po_count || 0, ['Purchase Order', { status: ['in', PENDING_PO_STATUSES], expected_delivery: ['<', today] }]),
      tile('Pending Supplier Payments', money(d.pending_payment_amount || 0), ['Purchase Bill', { docstatus: 1, payment_status: ['!=', 'Paid'] }]),
      tile('Overdue Payments', money(d.overdue_payment_amount || 0), ['Purchase Bill', { docstatus: 1, payment_status: ['!=', 'Paid'], due_date: ['<', today] }]),
    ],
    consumption: [
      tile('Material Issued', d.issues_count || 0, ['Material Issue', { docstatus: 1, issue_date_time: b, warehouse: applied.warehouse || undefined }]),
    ],
  }
})
</script>
