<template>
  <ReportShell title="FSN Analysis" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="fsn-from" v-model="f.from_date" label="From Date" type="date" reqd />
        <TextField id="fsn-to" v-model="f.to_date" label="To Date" type="date" reqd />
        <LinkField id="fsn-wh" v-model="f.warehouse" label="Warehouse" doctype="Warehouse" />
        <LinkField id="fsn-item" v-model="f.item" label="Item" doctype="Item" />
        <SelectField id="fsn-type" v-model="f.item_type" label="Item Type" :options="ITEM_TYPES" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['week', 'month', 'last_30', 'last_90']" @pick="pickRange" />
    </template>

    <template v-if="rows">
      <SummaryCards :cards="cards" />
      <ReportTable :columns="COLUMNS" :rows="rows" :row-class="(r) => (r.movement_status === 'Non-Moving' ? 'bg-red-50' : '')" empty="No stock movement found for this range.">
        <template #cell="{ col, row, value }">
          <DocLink v-if="col.key === 'item'" doctype="Item" :name="value" />
          <Pill v-else-if="col.key === 'movement_status'" :label="value" :color="INDICATORS[value] || 'gray'" />
          <template v-else-if="col.key === 'active_days'">{{ row.active_days }}/{{ row.total_days }} days</template>
          <template v-else>{{ show(col, value) }}</template>
        </template>
      </ReportTable>
    </template>
  </ReportShell>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import SummaryCards from '@/components/reports/SummaryCards.vue'
import ExportButtons from '@/components/reports/ExportButtons.vue'
import QuickRanges from '@/components/reports/QuickRanges.vue'
import DocLink from '@/components/reports/DocLink.vue'
import Pill from '@/components/reports/Pill.vue'
import TextField from '@/components/TextField.vue'
import LinkField from '@/components/LinkField.vue'
import SelectField from '@/components/SelectField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { flt, money, ddmmyy, todayStr, addDays, cellText, filterLine } from '@/data/reports/format'

// Desk page: metta/stock/page/fsn_analysis
const METHOD = 'metta.stock.page.fsn_analysis.fsn_analysis.get_data'
const meta = reportByRoute('ReportsFsnAnalysis')
const ITEM_TYPES = ['', 'Medicine', 'Service', 'Consumable']
const INDICATORS = { 'Fast-Moving': 'green', 'Slow-Moving': 'orange', 'Non-Moving': 'red' }
const COLUMNS = [
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'item_type', label: 'Item Type' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'opening_qty', label: 'Opening Qty', type: 'number' },
  { key: 'inward_qty', label: 'Inward Qty', type: 'number' },
  { key: 'outward_qty', label: 'Outward Qty', type: 'number' },
  { key: 'closing_qty', label: 'Closing Qty', type: 'number' },
  { key: 'closing_value', label: 'Closing Value', type: 'currency' },
  { key: 'active_days', label: 'Active Days', type: 'number' },
  { key: 'last_outward_datetime', label: 'Last Outward', type: 'date' },
  { key: 'movement_status', label: 'Movement Status' },
]

const { loading, error, run, warn } = useRunner()
// Desk defaults to the last 30 days so the frequency ratio has a window.
const f = reactive({ from_date: addDays(todayStr(), -30), to_date: todayStr(), warehouse: '', item: '', item_type: '' })
const rows = ref(null)

async function generate() {
  if (!f.from_date || !f.to_date) return warn('Please set both From Date and To Date.')
  const data = await run(METHOD, { ...f })
  if (data) rows.value = data
}
function pickRange([from, to]) {
  f.from_date = from
  f.to_date = to
  generate()
}
generate()

const cards = computed(() => {
  const r = rows.value || []
  const count = (s) => r.filter((x) => x.movement_status === s).length
  return [
    { label: 'Total Items', value: r.length },
    { label: 'Fast-Moving', value: count('Fast-Moving'), tone: 'good' },
    { label: 'Slow-Moving', value: count('Slow-Moving'), tone: 'warn' },
    { label: 'Non-Moving', value: count('Non-Moving'), tone: 'bad' },
  ]
})

function show(col, v) {
  if (col.type === 'date') return ddmmyy(v)
  if (col.type === 'currency') return money(v)
  if (col.type === 'number') return flt(v)
  return v ?? ''
}

function exportData() {
  if (!rows.value) return null
  return {
    title: 'FSN Analysis',
    subtitle: filterLine([
      ['From Date', ddmmyy(f.from_date)],
      ['To Date', ddmmyy(f.to_date)],
      ['Warehouse', f.warehouse],
      ['Item Type', f.item_type],
    ]),
    columns: COLUMNS.map((c) => c.label),
    rows: rows.value.map((r) => COLUMNS.map((c) => (c.key === 'active_days' ? `${r.active_days}/${r.total_days}` : cellText(show(c, r[c.key]))))),
    filename: 'Material_Analysis',
  }
}
</script>
