<template>
  <!-- Diagnostic Test's Results table: rows come from the Lab Test Template,
  so only the Result column is typed; no add / delete, as in Desk. -->
  <div class="overflow-x-auto rounded-lg border border-gray-200">
    <table class="w-full min-w-[640px] text-sm">
      <thead class="bg-brand-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-700">
        <tr>
          <th class="px-3 py-2">Parameter</th>
          <th class="w-48 px-3 py-2">Result</th>
          <th class="px-3 py-2">Unit</th>
          <th class="px-3 py-2">Normal Range</th>
          <th class="px-3 py-2">Flag</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="r.name || i" class="border-t border-gray-100">
          <td class="px-3 py-1.5 font-medium text-gray-900">{{ r.parameter }}</td>
          <td class="px-3 py-1.5">
            <input
              :id="`result-${i}`"
              :value="r.result_value ?? ''"
              :readonly="readonly"
              :inputmode="r.value_type === 'Number' ? 'decimal' : undefined"
              :aria-label="`Result for ${r.parameter}`"
              :class="['h-8 w-full font-semibold', readonly ? 'ctl-ro' : 'ctl']"
              :style="FLAG_BG[r.flag]"
              @input="setValue(r, $event.target.value)"
            />
          </td>
          <td class="px-3 py-1.5 text-gray-600">{{ r.unit }}</td>
          <td class="px-3 py-1.5 tabular-nums text-gray-600">
            <!-- A number with no range can't be flagged; say so instead of a blank. -->
            <span v-if="r.value_type === 'Number' && !hasRange(r)" class="italic text-gray-400">No range set</span>
            <template v-else>{{ r.normal_range }}</template>
          </td>
          <td class="px-3 py-1.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <!-- Worked out while typing; the server stores the same value on save. -->
              <span v-if="r.flag" class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="['ring-1', FLAG_CLASS[r.flag]]">{{ FLAG_ARROW[r.flag] ? `${FLAG_ARROW[r.flag]} ` : '' }}{{ r.flag }}</span>
              <span v-if="notANumber(r)" class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">Enter a number</span>
              <span v-else-if="looksWrong(r)" class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">Check value</span>
            </div>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="5" class="px-3 py-3 text-gray-500">Rows appear from the Lab Test Template when the test is saved.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { resultFlag, FLAG_CLASS, FLAG_ARROW, FLAG_BG, hasRange, looksWrong, notANumber } from '@/data/lab/labRules'

defineProps({
  rows: { type: Array, required: true },
  readonly: { type: Boolean, default: false },
})

function setValue(r, v) {
  r.result_value = v
  r.flag = resultFlag(r)
}
</script>
