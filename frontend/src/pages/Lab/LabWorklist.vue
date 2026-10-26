<template>
  <AppLayout title="Lab" subtitle="Tests ordered by doctors" fill>
    <template #actions>
      <router-link v-if="canCreate" :to="{ name: 'LabTest', params: { name: 'new' } }" class="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">New test</router-link>
    </template>

    <!-- One card per step of the lab's day; the card picks the list below. -->
    <div class="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
      <button
        v-for="v in VIEWS"
        :key="v.key"
        type="button"
        class="flex flex-col items-start gap-0.5 rounded-xl border-2 bg-white px-4 py-2.5 text-left shadow-sm"
        :class="view === v.key ? 'border-brand-600' : 'border-transparent hover:border-gray-200'"
        :aria-pressed="view === v.key"
        @click="view = v.key"
      >
        <span class="text-sm text-gray-600">{{ v.label }}</span>
        <span class="text-2xl font-bold" :class="v.key === 'late' && counts.late ? 'text-red-700' : 'text-brand-700'">{{ counts[v.key] ?? '–' }}</span>
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
import SampleQueue from '@/components/lab/SampleQueue.vue'
import { hasRole } from '@/data/session'
import { DT, nowIST } from '@/data/lab/labRules'

// The lab's work in the order it happens. "Collect samples" is its own
// screen (one patient, all their paid tests, one click); the rest are lists.
// filters() is a function so "Late" compares with the time it is shown.
const VIEWS = [
  { key: 'collect', label: 'Collect samples', filters: () => [['status', '=', 'Ordered'], ['is_paid', '=', 1]] },
  { key: 'unpaid', label: 'Waiting for payment', filters: () => [['status', '=', 'Ordered'], ['is_paid', '=', 0]] },
  { key: 'results', label: 'Results to enter', filters: () => [['status', '=', 'Sample Collected']] },
  { key: 'verify', label: 'To verify', filters: () => [['status', '=', 'Result Entered']] },
  { key: 'late', label: 'Late', filters: () => [['status', 'in', ['Sample Collected', 'Result Entered']], ['due_on', '<', nowIST()]] },
  { key: 'reported', label: 'Reported today', filters: () => [['status', '=', 'Reported'], ['reported_on', '>=', `${nowIST().slice(0, 10)} 00:00:00`]], sortDir: 'desc' },
  { key: 'all', label: 'All tests', filters: () => [], sort: 'creation', sortDir: 'desc' },
]

const view = ref('collect')
const current = computed(() => VIEWS.find((v) => v.key === view.value))
const counts = reactive({})

// Desk gives create to Lab Staff and Doctor (System Manager always).
const canCreate = computed(() => hasRole('Lab Staff', 'Doctor'))

async function loadCounts() {
  await Promise.all(
    VIEWS.map(async (v) => {
      try {
        counts[v.key] = await call('frappe.desk.reportview.get_count', { doctype: DT, filters: v.filters() })
      } catch {
        counts[v.key] = null
      }
    }),
  )
}

let timer = null
onMounted(() => {
  loadCounts()
  timer = setInterval(loadCounts, 60000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>
