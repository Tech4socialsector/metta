<template>
  <AppLayout title="Lab" subtitle="Tests ordered by doctors" fill>
    <template #actions>
      <router-link v-if="canCreate" :to="{ name: 'LabTest', params: { name: 'new' } }" class="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">New test</router-link>
    </template>

    <!-- The lab's stages in the order the work happens, payment first
    (user, 2026-10-27). Late is not a stage: it shows as a red tag on the
    stage those tests are stuck at, and on their rows. "All tests" sits at
    the end as a plain link. -->
    <div class="flex shrink-0 flex-col gap-2 xl:flex-row xl:items-stretch">
      <div role="tablist" aria-label="Lab stages" class="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3 xl:flex xl:items-center">
        <template v-for="(v, i) in STAGES" :key="v.key">
          <button
            type="button"
            role="tab"
            :aria-selected="view === v.key"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-colors xl:self-stretch"
            :class="view === v.key ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200 hover:border-brand-300'"
            @click="view = v.key"
          >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="view === v.key ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-700'">
              <LucideIcon :name="v.icon" class="h-[18px] w-[18px]" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[11px] font-bold uppercase tracking-[0.06em] text-gray-500">Step {{ i + 1 }}</span>
              <span class="block truncate text-[14px] font-bold text-accent-900">{{ v.label }}</span>
            </span>
            <span class="flex shrink-0 flex-col items-end gap-1">
              <span class="text-xl font-bold leading-none tabular-nums" :class="view === v.key ? 'text-brand-800' : 'text-gray-900'">{{ counts[v.key] ?? '–' }}</span>
              <span v-if="lateCounts[v.key]" class="rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-red-700 ring-1 ring-red-200">{{ lateCounts[v.key] }} late</span>
            </span>
          </button>
        </template>
      </div>
      <button
        type="button"
        class="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
        :class="view === 'all' ? 'bg-brand-700 text-white' : 'text-brand-700 hover:bg-brand-50'"
        :aria-pressed="view === 'all'"
        @click="view = 'all'"
      >
        <LucideIcon name="list" class="h-4 w-4" /> All tests ({{ counts.all ?? '–' }})
      </button>
    </div>

    <SampleQueue v-if="view === 'collect'" class="min-h-0 flex-1 overflow-y-auto" @collected="loadCounts" />
    <!-- Oldest first: the test ordered earliest is done first. -->
    <DataList
      v-else
      :key="view"
      :doctype="DT"
      :filters="current.filters()"
      :row-route="(r) => ({ name: 'LabTest', params: { name: r.name } })"
      :row-tag="lateTag"
      :extra-fields="['due_on']"
      :auto-refresh="60"
      :sort="current.sort || 'creation'"
      :sort-dir="current.sortDir || 'asc'"
      fill
    />
  </AppLayout>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import SampleQueue from '@/components/lab/SampleQueue.vue'
import { hasRole } from '@/data/session'
import { DT, nowIST } from '@/data/lab/labRules'

// The lab's work in the order it happens - nothing moves until it is paid.
// "Collect samples" is its own screen (one patient, all their paid tests,
// one click); the rest are lists. filters() is a function so the late
// counts compare with the time they are shown.
const STAGES = [
  { key: 'unpaid', label: 'Waiting for payment', icon: 'credit-card', filters: () => [['status', '=', 'Ordered'], ['is_paid', '=', 0]] },
  { key: 'collect', label: 'Collect sample', icon: 'test-tube', filters: () => [['status', '=', 'Ordered'], ['is_paid', '=', 1]] },
  { key: 'results', label: 'Enter results', icon: 'pencil-line', filters: () => [['status', '=', 'Sample Collected']] },
  { key: 'verify', label: 'Verify', icon: 'shield-check', filters: () => [['status', '=', 'Result Entered']] },
  { key: 'reported', label: 'Reported today', icon: 'file-check', filters: () => [['status', '=', 'Reported'], ['reported_on', '>=', `${nowIST().slice(0, 10)} 00:00:00`]], sortDir: 'desc' },
]
const VIEWS = [...STAGES, { key: 'all', label: 'All tests', filters: () => [], sort: 'creation', sortDir: 'desc' }]
// Late = past the due time (sample time + the template's turnaround hours)
// and not reported yet, so only these two stages can have late tests.
const LATE_IN = ['results', 'verify']
const lateFilters = (v) => [...v.filters(), ['due_on', '<', nowIST()]]
const lateTag = (r) => (r.due_on && r.status !== 'Reported' && r.due_on < nowIST() ? 'Late' : '')

const view = ref('unpaid')
const current = computed(() => VIEWS.find((v) => v.key === view.value))
const counts = reactive({})
const lateCounts = reactive({})

// Desk gives create to Lab Staff and Doctor (System Manager always).
const canCreate = computed(() => hasRole('Lab Staff', 'Doctor'))

const count = (filters) => call('frappe.desk.reportview.get_count', { doctype: DT, filters }).catch(() => null)
async function loadCounts() {
  await Promise.all([
    ...VIEWS.map(async (v) => (counts[v.key] = await count(v.filters()))),
    ...STAGES.filter((v) => LATE_IN.includes(v.key)).map(async (v) => (lateCounts[v.key] = await count(lateFilters(v)))),
  ])
}

let timer = null
onMounted(() => {
  loadCounts()
  timer = setInterval(loadCounts, 60000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>
