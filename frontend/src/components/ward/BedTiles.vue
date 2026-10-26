<template>
  <!-- Beds of one ward/room on the bed board, readable at a glance:
  occupied = light brand tile that opens the visit, free = green dashed
  tile. A patient admitted here whose bed number isn't set gets an amber
  "Bed not set" label - something to fix. Without read access to the
  visit (a Doctor's other patients) an occupied bed just says Occupied. -->
  <div v-if="tiles.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
    <template v-for="t in tiles" :key="t.key">
      <router-link
        v-if="t.visit"
        :to="{ name: 'VisitView', params: { name: t.visit.name } }"
        class="flex min-h-[6.25rem] flex-col gap-1 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm hover:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <span class="flex items-center gap-1.5">
          <LucideIcon name="bed-double" class="h-4 w-4 text-brand-700" />
          <span v-if="t.noBed" class="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">{{ t.label }}</span>
          <span v-else class="text-xs font-semibold uppercase tracking-wide text-brand-800">{{ t.label }}</span>
        </span>
        <span class="font-semibold text-gray-900">{{ t.visit.patient_name || t.visit.uhin_id }}</span>
        <span class="text-xs tabular-nums text-brand-700">{{ t.visit.name }}</span>
        <span class="mt-auto text-xs text-gray-600">{{ stayText(t.visit) }}</span>
      </router-link>
      <div v-else-if="t.occupied" class="flex min-h-[6.25rem] flex-col gap-1 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
        <span class="flex items-center gap-1.5">
          <LucideIcon name="bed-double" class="h-4 w-4 text-brand-700" />
          <span class="text-xs font-semibold uppercase tracking-wide text-brand-800">{{ t.label }}</span>
        </span>
        <span class="mt-auto font-medium text-gray-700">Occupied</span>
      </div>
      <div v-else class="flex min-h-[6.25rem] flex-col gap-1 rounded-lg border border-dashed border-green-400 bg-green-50/40 p-3 text-sm">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t.label }}</span>
        <span class="mt-auto flex items-center gap-1.5 font-semibold text-green-700">
          <LucideIcon name="circle-check" class="h-4 w-4" />Free
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { formatValue } from '@/data/meta'

const props = defineProps({
  // get_bed_status_list() rows: { bed_no, status, visit }
  beds: { type: Array, default: () => [] },
  // admitted visits whose bed isn't on the master's list - shown, never hidden
  unlisted: { type: Array, default: () => [] },
  // the visit field holding its bed number (bed_no / room_bed_no)
  bedField: { type: String, default: '' },
})

const tiles = computed(() => [
  ...props.beds.map((b) => ({ key: `b-${b.bed_no}`, label: `Bed ${b.bed_no}`, occupied: b.status !== 'Available', visit: b.status !== 'Available' ? b.visit : null })),
  ...props.unlisted.map((v) => {
    const bed = props.bedField ? v[props.bedField] : ''
    // In a ward/room list, a visit without a bed number needs fixing; on the
    // "Admitted, no bed yet" list (no bedField) it simply has no bed yet.
    return { key: `v-${v.name}`, label: bed ? `Bed ${bed}` : props.bedField ? 'Bed not set' : 'No bed yet', noBed: !bed && !!props.bedField, occupied: true, visit: v }
  }),
])

function stayText(v) {
  if (!v.admission_date) return ''
  const since = formatValue({ fieldtype: 'Date' }, v.admission_date)
  if (!v.days || v.days < 1) return `Admitted ${since} · today`
  return `Admitted ${since} · ${v.days} ${v.days === 1 ? 'day' : 'days'}`
}
</script>
