<template>
  <!-- Vitals Check: OP vitals only (user, 2026-10-24). Same layout as
  Patients - count cards on top, the picked card decides the list below.
  Opens on All; the date filter is optional. -->
  <AppLayout title="Vitals Check" subtitle="Vitals for OP patients waiting after registration" fill>
    <template #actions>
      <PeriodFilter />
      <router-link
        v-if="next"
        :to="{ name: 'NurseForm', params: { name: next.name } }"
        class="flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
      >
        Start next — {{ next.patient_name || next.name }}
        <LucideIcon name="arrow-right" class="h-4 w-4" />
      </router-link>
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
        <span class="text-[13px]" :class="c.warn ? 'font-medium text-accent-700' : 'text-gray-600'">{{ c.sub }}</span>
      </button>
    </div>

    <DataList
      :key="listKey"
      fill
      doctype="Nurse Interventions"
      :filters="current.filters"
      :row-route="(r) => ({ name: 'NurseForm', params: { name: r.name } })"
      :auto-refresh="60"
      sort="creation"
      :sort-dir="current.sortDir"
    />
  </AppLayout>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
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

// The picked card lives in the URL, so Back from a vitals form returns to the same list.
const view = computed({
  get: () => (['waiting', 'done', 'all'].includes(route.query.view) ? route.query.view : 'waiting'),
  set: (v) => router.replace({ query: { ...route.query, view: v } }),
})

// OP only: the vitals record links to the visit, and OP visits are named
// OP-YYYY-##### (admissions are IP-...). Nurse Interventions' "date" is
// set when the visit creates the record.
const OP_ONLY = ['patient_registration', 'like', 'OP-%']
const DEFS = computed(() => {
  const since = rangeFilters('date', range.value, true)
  return {
    waiting: { filters: [OP_ONLY, ['status', '=', 'Pending'], ...since], sortDir: 'asc' },
    done: { filters: [OP_ONLY, ['status', '=', 'Completed'], ...since], sortDir: 'desc' },
    all: { filters: [OP_ONLY, ...since], sortDir: 'desc' },
  }
})
const current = computed(() => DEFS.value[view.value])
const listKey = computed(() => `${view.value}|${JSON.stringify(range.value)}`)

const counts = reactive({ waiting: null, done: null, all: null })
// Oldest patient still waiting: drives "Start next" and the waiting time.
const next = ref(null)
const now = ref(Date.now())
const waitedMs = computed(() => (next.value?.creation ? now.value - new Date(next.value.creation.replace(' ', 'T')).getTime() : 0))

const longestWait = computed(() => {
  if (!next.value) return ''
  const mins = Math.max(0, Math.round(waitedMs.value / 60000))
  if (mins >= 1440) return `${Math.floor(mins / 1440)} d`
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`
})

const cards = computed(() => [
  {
    key: 'waiting',
    label: 'Waiting for vitals',
    icon: 'clock',
    sub: longestWait.value ? `Longest wait ${longestWait.value}` : 'No one waiting',
    // Over 20 minutes the line turns to the accent colour - call this patient first.
    warn: waitedMs.value > 20 * 60000,
  },
  { key: 'done', label: 'Completed', icon: 'circle-check', sub: word.value ? `Vitals done ${word.value}` : 'All vitals done' },
  { key: 'all', label: 'All OP vitals', icon: 'clipboard-list', sub: word.value ? `OP visits ${word.value}` : 'Every OP visit' },
])

const show = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'))

async function count(filters) {
  try {
    return await call('frappe.desk.reportview.get_count', { doctype: 'Nurse Interventions', filters })
  } catch {
    return null
  }
}
async function loadCounts() {
  const d = DEFS.value
  const [waiting, done, all, oldest] = await Promise.all([
    count(d.waiting.filters),
    count(d.done.filters),
    count(d.all.filters),
    call('frappe.client.get_list', {
      doctype: 'Nurse Interventions',
      filters: d.waiting.filters,
      fields: ['name', 'patient_name', 'creation'],
      order_by: 'creation asc',
      limit_page_length: 1,
    }).catch(() => []),
  ])
  Object.assign(counts, { waiting, done, all })
  next.value = oldest?.[0] || null
  now.value = Date.now()
}
watch(() => JSON.stringify(range.value), loadCounts, { immediate: true })

// Same pace as the list's own refresh, so the cards stay in step with it.
const timer = setInterval(loadCounts, 60000)
onBeforeUnmount(() => clearInterval(timer))
</script>
