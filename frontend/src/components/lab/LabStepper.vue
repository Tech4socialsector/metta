<template>
  <!-- Where the test stands, from the SAVED record: each step with its time
  and ID once done, the current one highlighted. Cancelled stops the line. -->
  <ol class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Test progress">
    <li
      v-for="(s, i) in steps"
      :key="s.key"
      class="flex items-start gap-2.5 rounded-lg border px-3 py-2.5"
      :class="s.state === 'done' ? 'border-brand-200 bg-brand-50' : s.state === 'current' ? 'border-accent-400 bg-white ring-1 ring-accent-300' : 'border-gray-200 bg-white'"
      :aria-current="s.state === 'current' ? 'step' : undefined"
    >
      <span
        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        :class="s.state === 'done' ? 'bg-brand-700 text-white' : s.state === 'current' ? 'bg-accent-500 text-white' : 'bg-gray-200 text-gray-600'"
      >
        <LucideIcon v-if="s.state === 'done'" name="check" class="h-3.5 w-3.5" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold" :class="s.state === 'todo' ? 'text-gray-500' : 'text-gray-900'">{{ s.label }}</span>
        <span v-if="s.detail" class="block truncate text-xs text-gray-600" :title="s.detail">{{ s.detail }}</span>
      </span>
    </li>
  </ol>
</template>

<script setup>
import { computed } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { formatValue } from '@/data/meta'

const props = defineProps({ doc: { type: Object, required: true } })

const AFTER_SAMPLE = ['Sample Collected', 'Result Entered', 'Reported']
const when = (v) => (v ? formatValue({ fieldtype: 'Datetime' }, v) : '')

const steps = computed(() => {
  const d = props.doc
  const list = [
    { key: 'ordered', label: 'Ordered', done: true, detail: when(d.ordered_on) },
    { key: 'paid', label: 'Paid', done: !!d.is_paid, detail: d.is_paid ? d.billing || '' : 'Waiting at Billing' },
    { key: 'sample', label: 'Sample collected', done: AFTER_SAMPLE.includes(d.status), detail: [d.lab_sample, when(d.sample_collected_on)].filter(Boolean).join(' · ') },
    { key: 'results', label: 'Results entered', done: ['Result Entered', 'Reported'].includes(d.status), detail: when(d.result_entered_on) },
    { key: 'reported', label: 'Verified & reported', done: d.status === 'Reported', detail: when(d.verified_on || d.reported_on) },
  ]
  const firstOpen = d.status === 'Cancelled' ? -1 : list.findIndex((s) => !s.done)
  return list.map((s, i) => ({ ...s, state: s.done ? 'done' : i === firstOpen ? 'current' : 'todo' }))
})
</script>
