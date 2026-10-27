<template>
  <!-- Patients and visits in one place (user, 2026-10-24): four count cards
  across the top; the picked card decides what the list below shows. Opens
  on All - the date filter is optional. -->
  <AppLayout title="Patients" subtitle="Registered patients, OP visits and in-patients in one place" fill>
    <template #actions>
      <PeriodFilter />
    </template>

    <div role="tablist" aria-label="What to list" class="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
      <button
        v-for="c in cards"
        :key="c.key"
        type="button"
        role="tab"
        :aria-selected="view === c.key"
        class="flex flex-col gap-2 rounded-xl border bg-white px-4 py-3.5 text-left transition-colors"
        :class="view === c.key ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200 hover:border-gray-300'"
        @click="view = c.key"
      >
        <span class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg" :class="view === c.key ? 'bg-brand-700 text-white' : 'bg-brand-100 text-brand-700'">
            <LucideIcon :name="c.icon" class="h-[18px] w-[18px]" />
          </span>
          <span class="text-sm font-semibold text-gray-800">{{ c.label }}</span>
        </span>
        <span class="text-[28px] font-bold leading-none tabular-nums" :class="view === c.key ? 'text-brand-800' : 'text-gray-900'">{{ show(counts[c.key]) }}</span>
        <span class="text-[13px] text-gray-600">{{ c.sub }}</span>
      </button>
    </div>

    <DataList :key="listKey" fill :doctype="current.doctype" :filters="current.filters" :row-route="current.rowRoute" :id-column="current.idLabel" />
  </AppLayout>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import PeriodFilter from '@/components/PeriodFilter.vue'
import { usePeriod, rangeFilters } from '@/data/period'

const route = useRoute()
const router = useRouter()
const { range, word } = usePeriod()

// The picked card lives in the URL, so Back from a patient returns to the same list.
const view = computed({
  get: () => (['registered', 'op', 'ip'].includes(route.query.view) ? route.query.view : 'op'),
  set: (v) => router.replace({ query: { ...route.query, view: v } }),
})

const toPatient = (r) => ({ name: 'PatientView', params: { uhin: r.name } })
const toVisit = (r) => ({ name: 'VisitView', params: { name: r.name } })

// Each card: what its number counts and what the list shows when picked.
// Registered and In-patients ignore the date filter (all patients ever /
// who is in a bed now).
// Visit lists show the visit's own ID as "OP ID" / "IP ID" (user, 2026-10-27).
const CARD_DEFS = computed(() => {
  const r = range.value
  return {
    registered: { label: 'Registered', icon: 'users', doctype: 'Patient Registration', filters: [], rowRoute: toPatient },
    op: { label: 'OP visits', icon: 'clipboard-list', doctype: 'Patient Visit', filters: [['registration_category', '=', 'OP'], ...rangeFilters('date', r)], rowRoute: toVisit, idLabel: 'OP ID' },
    ip: { label: 'In-patients', icon: 'bed-double', doctype: 'Patient Visit', filters: [['registration_category', '=', 'IP'], ['admission_status', '=', 'Admitted']], rowRoute: toVisit, idLabel: 'IP ID' },
  }
})

const counts = reactive({ registered: null, op: null, ip: null, waiting: null, admitted: null })
const inWord = (base) => (word.value ? `${base} ${word.value}` : base)

const cards = computed(() => {
  const d = CARD_DEFS.value
  return [
    { key: 'registered', ...d.registered, sub: 'All patients ever registered' },
    { key: 'op', ...d.op, sub: counts.waiting === null ? inWord('OP visits') : `${show(counts.waiting)} waiting for vitals` },
    { key: 'ip', ...d.ip, sub: word.value && counts.admitted !== null ? `${show(counts.admitted)} admitted ${word.value}` : 'In a bed now' },
  ]
})
const current = computed(() => ({ key: view.value, ...CARD_DEFS.value[view.value] }))
// A new list (fresh columns and filters) whenever the card or dates change.
const listKey = computed(() => `${view.value}|${JSON.stringify(range.value)}`)

const show = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'))

// Same count call the list uses, so the numbers follow the user's
// permissions. A card the user can't read shows a dash.
async function count(doctype, filters) {
  try {
    return await call('frappe.desk.reportview.get_count', { doctype, filters })
  } catch {
    return null
  }
}
async function loadCounts() {
  const d = CARD_DEFS.value
  const r = range.value
  const [registered, op, ip, waiting, admitted] = await Promise.all([
    count(d.registered.doctype, d.registered.filters),
    count(d.op.doctype, d.op.filters),
    count(d.ip.doctype, d.ip.filters),
    // OP vitals still pending in the same dates
    count('Nurse Interventions', [['status', '=', 'Pending'], ['patient_registration', 'like', 'OP-%'], ...rangeFilters('date', r, true)]),
    count('Patient Visit', [['registration_category', '=', 'IP'], ...rangeFilters('admission_date', r)]),
  ])
  Object.assign(counts, { registered, op, ip, waiting, admitted })
}
watch(() => JSON.stringify(range.value), loadCounts, { immediate: true })
</script>
