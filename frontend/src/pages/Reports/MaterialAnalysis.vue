<template>
  <ReportShell title="Material Analysis" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <!-- Desk's three tabs; Item Movement Registration opens first. -->
    <div class="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 self-start" role="tablist">
      <button
        v-for="[key, label] in TABS"
        :key="key"
        type="button"
        role="tab"
        :aria-selected="tab === key"
        class="h-9 rounded-md px-3 text-sm font-semibold"
        :class="tab === key ? 'bg-white text-brand-800 shadow-sm' : 'text-gray-600 hover:text-gray-900'"
        @click="tab = key"
      >
        {{ label }}
      </button>
    </div>

    <p v-if="tab === 'material_query'" class="text-sm text-gray-600">Material Query is not set up yet.</p>

    <!-- Item Movement Registration -->
    <template v-if="tab === 'item_movement'">
      <section class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
          <TextField id="im-from" v-model="im.from_date" label="From Date" type="date" reqd />
          <TextField id="im-to" v-model="im.to_date" label="To Date" type="date" reqd />
          <LinkField id="im-wh" v-model="im.warehouse" label="Warehouse (Outlet)" doctype="Warehouse" />
          <LinkField id="im-item" v-model="im.item" label="Item" doctype="Item" />
          <div><button type="button" :class="GEN_BTN" @click="generateIm">Generate</button></div>
        </div>
        <QuickRanges :ranges="RANGES" @pick="([a, b]) => ((im.from_date = a), (im.to_date = b), generateIm())" />
      </section>
      <p v-if="!imRows" class="text-sm text-gray-600">Set a From Date and To Date, then click Generate.</p>
      <template v-else>
        <SummaryCards :cards="imCards" />
        <ReportTable :columns="IM_COLUMNS" :rows="imRows" :total="imRows.length ? imTotal : null" empty="No stock movement found for this range.">
          <template #cell="{ col, row, value }">
            <DocLink v-if="col.key === 'item'" doctype="Item" :name="value" />
            <span v-else-if="col.key === 'item_name'" class="inline-flex items-center gap-2">{{ value }}<Pill v-if="row.not_moving" label="Not Moving" color="red" /></span>
            <template v-else>{{ col.type === 'number' ? flt(value) : (value ?? '') }}</template>
          </template>
        </ReportTable>
      </template>
    </template>

    <!-- Stock Position -->
    <template v-if="tab === 'stock_position'">
      <section class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
          <TextField id="sp-from" v-model="sp.from_date" label="From Date" type="date" reqd />
          <TextField id="sp-to" v-model="sp.to_date" label="To Date" type="date" reqd />
          <LinkField id="sp-wh" v-model="sp.warehouse" label="Warehouse (Outlet)" doctype="Warehouse" />
          <LinkField id="sp-item" v-model="sp.item" label="Item" doctype="Item" />
          <SelectField id="sp-status" v-model="sp.status" label="Status" :options="INDENT_STATUSES" />
          <div><button type="button" :class="GEN_BTN" @click="generateSp">Generate</button></div>
        </div>
        <QuickRanges :ranges="RANGES" @pick="([a, b]) => ((sp.from_date = a), (sp.to_date = b), generateSp())" />
      </section>
      <p v-if="!spRows" class="text-sm text-gray-600">Set a From Date and To Date, then click Generate.</p>
      <template v-else>
        <SummaryCards :cards="spCards" />
        <ReportTable :columns="SP_COLUMNS" :rows="spRows" :total="spRows.length ? spTotal : null" empty="No Stock Indents found for this range.">
          <template #cell="{ col, value }">
            <DocLink v-if="col.key === 'stock_indent'" doctype="Stock Indent" :name="value" />
            <DocLink v-else-if="col.key === 'item'" doctype="Item" :name="value" />
            <Pill v-else-if="col.key === 'status'" :label="value" :color="INDENT_INDICATORS[value] || 'gray'" />
            <template v-else-if="col.type === 'date'">{{ ddmmyy(value) }}</template>
            <template v-else>{{ col.type === 'number' ? flt(value) : (value ?? '') }}</template>
          </template>
        </ReportTable>
      </template>
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
import { flt, ddmmyy, cellText, filterLine } from '@/data/reports/format'

// Desk page: metta/stock/page/material_analysis
const BASE = 'metta.stock.page.material_analysis.material_analysis'
const meta = reportByRoute('ReportsMaterialAnalysis')
const TABS = [
  ['material_query', 'Material Query'],
  ['item_movement', 'Item Movement Registration'],
  ['stock_position', 'Stock Position'],
]
const RANGES = ['today', 'week', 'month']
// Draft is left out, as in Desk - Stock Position never lists Draft indents.
const INDENT_STATUSES = ['', 'Submitted', 'Partially Issued', 'Issued', 'Cancelled']
const INDENT_INDICATORS = { Draft: 'gray', Submitted: 'blue', 'Partially Issued': 'orange', Issued: 'green', Cancelled: 'red' }
const IM_COLUMNS = [
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'item_type', label: 'Item Type' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'available_qty', label: 'Available', type: 'number' },
  { key: 'issued_qty', label: 'Issued', type: 'number' },
  { key: 'remaining_qty', label: 'Remaining', type: 'number' },
]
const SP_COLUMNS = [
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'stock_indent', label: 'Stock Indent' },
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'qty_requested', label: 'Qty Requested', type: 'number' },
  { key: 'qty_issued', label: 'Qty Issued', type: 'number' },
  { key: 'qty_pending', label: 'Qty Pending', type: 'number' },
  { key: 'issued_by', label: 'Issued By' },
  { key: 'issue_date', label: 'Issue Date', type: 'date' },
  { key: 'status', label: 'Status' },
]

const { loading, error, run, warn } = useRunner()
const tab = ref('item_movement')
// Desk leaves both tabs' dates blank and waits for Generate.
const im = reactive({ from_date: '', to_date: '', warehouse: '', item: '' })
const sp = reactive({ from_date: '', to_date: '', warehouse: '', item: '', status: '' })
const imRows = ref(null)
const spRows = ref(null)

async function generateIm() {
  if (!im.from_date || !im.to_date) return warn('Please set both From Date and To Date.')
  const data = await run(`${BASE}.get_item_movement_data`, { ...im })
  if (data) imRows.value = data
}
async function generateSp() {
  if (!sp.from_date || !sp.to_date) return warn('Please set both From Date and To Date.')
  const data = await run(`${BASE}.get_stock_position_data`, { ...sp })
  if (data) spRows.value = data
}

const sum = (rows, k) => rows.reduce((s, r) => s + flt(r[k]), 0)

const imTotal = computed(() => {
  const r = imRows.value || []
  return { item: 'Total', available_qty: sum(r, 'available_qty'), issued_qty: sum(r, 'issued_qty'), remaining_qty: sum(r, 'remaining_qty') }
})
const imCards = computed(() => [
  { label: 'Items Listed', value: (imRows.value || []).length },
  { label: 'Total Available', value: imTotal.value.available_qty },
  { label: 'Total Issued', value: imTotal.value.issued_qty },
  { label: 'Total Remaining', value: imTotal.value.remaining_qty },
])

const spTotal = computed(() => {
  const r = spRows.value || []
  return { warehouse: 'Total', qty_requested: sum(r, 'qty_requested'), qty_issued: sum(r, 'qty_issued'), qty_pending: sum(r, 'qty_pending') }
})
const spCards = computed(() => [
  { label: 'Outlets', value: new Set((spRows.value || []).map((r) => r.warehouse)).size },
  { label: 'Total Requested', value: spTotal.value.qty_requested },
  { label: 'Total Issued', value: spTotal.value.qty_issued },
  { label: 'Total Pending', value: spTotal.value.qty_pending },
])

// Like Desk, Export covers only the tab that's open.
function exportData() {
  if (tab.value === 'item_movement' && imRows.value) {
    const t = imTotal.value
    const rows = imRows.value.map((r) => [r.item || '', r.item_name || '', r.item_type || '', r.warehouse || '', flt(r.available_qty), flt(r.issued_qty), flt(r.remaining_qty), r.not_moving ? 'Yes' : ''])
    rows.push(['Total', '', '', '', t.available_qty, t.issued_qty, t.remaining_qty, ''])
    return {
      title: 'Item Movement Registration',
      subtitle: filterLine([
        ['From Date', ddmmyy(im.from_date)],
        ['To Date', ddmmyy(im.to_date)],
        ['Warehouse', im.warehouse],
        ['Item', im.item],
      ]),
      columns: ['Item', 'Item Name', 'Item Type', 'Warehouse', 'Available', 'Issued', 'Remaining', 'Not Moving'],
      rows: rows.map((r) => r.map(cellText)),
      filename: 'Item_Movement_Registration',
    }
  }
  if (tab.value === 'stock_position' && spRows.value) {
    const t = spTotal.value
    const rows = spRows.value.map((r) => [r.warehouse || '', r.stock_indent || '', r.item || '', r.item_name || '', flt(r.qty_requested), flt(r.qty_issued), flt(r.qty_pending), r.issued_by || '', ddmmyy(r.issue_date), r.status || ''])
    rows.push(['Total', '', '', '', t.qty_requested, t.qty_issued, t.qty_pending, '', '', ''])
    return {
      title: 'Stock Position',
      subtitle: filterLine([
        ['From Date', ddmmyy(sp.from_date)],
        ['To Date', ddmmyy(sp.to_date)],
        ['Warehouse', sp.warehouse],
        ['Item', sp.item],
        ['Status', sp.status],
      ]),
      columns: SP_COLUMNS.map((c) => c.label),
      rows: rows.map((r) => r.map(cellText)),
      filename: 'Stock_Position',
    }
  }
  return null
}
</script>
