<template>
  <section class="overflow-hidden rounded-xl border border-gray-200 bg-white">
    <h2 v-if="heading" class="border-b border-accent-100 bg-accent-50 px-4 py-2.5 text-[13px] font-extrabold uppercase tracking-wide text-accent-900">{{ heading }}</h2>
    <p v-if="!rows.length" class="px-4 py-6 text-center text-sm text-gray-600">{{ empty }}</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-accent-100 bg-accent-50 text-left text-xs uppercase text-accent-900">
          <tr>
            <th v-for="c in columns" :key="c.key" class="whitespace-nowrap px-3 py-2 font-bold" :class="alignOf(c)">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i" class="border-b border-gray-100 last:border-0" :class="rowClass && rowClass(r)">
            <td v-for="c in columns" :key="c.key" class="whitespace-nowrap px-3 py-2" :class="alignOf(c)">
              <slot name="cell" :col="c" :row="r" :value="r[c.key]" :index="i">{{ show(c, r[c.key]) }}</slot>
            </td>
          </tr>
          <tr v-if="total" class="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <td v-for="c in columns" :key="c.key" class="whitespace-nowrap px-3 py-2" :class="alignOf(c)">{{ c.key in total ? show(c, total[c.key], true) : '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { money, num, ddmmyy } from '@/data/reports/format'

// columns: [{ key, label, type?: 'currency'|'number'|'date'|'text' }]
// total: optional { key: value } shown as a highlighted last row.
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  total: { type: Object, default: null },
  heading: { type: String, default: '' },
  empty: { type: String, default: 'No data for this period.' },
  rowClass: { type: Function, default: null },
})

function alignOf(c) {
  return c.type === 'currency' || c.type === 'number' ? 'text-right tabular-nums' : c.type === 'date' ? 'text-center' : ''
}
function show(c, v, isTotal) {
  if (isTotal && typeof v === 'string') return v
  if (c.type === 'currency') return money(v)
  if (c.type === 'number') return v === null || v === undefined || v === '' ? '' : num(v)
  if (c.type === 'date') return ddmmyy(v)
  return v ?? ''
}
</script>
