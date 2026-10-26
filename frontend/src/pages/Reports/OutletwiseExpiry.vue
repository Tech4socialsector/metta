<template>
  <ReportShell title="Outlet-wise Expiry Report" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <LinkField id="oer-wh" v-model="f.warehouse" label="Warehouse (Outlet)" doctype="Warehouse" />
        <LinkField id="oer-item" v-model="f.item" label="Item" doctype="Item" />
        <SelectField id="oer-type" v-model="f.item_type" label="Item Type" :options="ITEM_TYPES" />
        <SelectField id="oer-status" v-model="f.status" label="Status" :options="STATUSES" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
    </template>

    <template v-if="rows">
      <SummaryCards :cards="cards" />
      <ReportTable :columns="COLUMNS" :rows="rows" :row-class="(r) => (r.status === 'Expired' ? 'bg-red-50' : '')" empty="No batches found for this filter.">
        <template #cell="{ col, value }">
          <DocLink v-if="col.key === 'item'" doctype="Item" :name="value" />
          <DocLink v-else-if="col.key === 'batch_no'" doctype="Batch" :name="value" />
          <Pill v-else-if="col.key === 'status'" :label="value" :color="INDICATORS[value] || 'gray'" />
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
import DocLink from '@/components/reports/DocLink.vue'
import Pill from '@/components/reports/Pill.vue'
import LinkField from '@/components/LinkField.vue'
import SelectField from '@/components/SelectField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { flt, money, ddmmyy, cellText, filterLine } from '@/data/reports/format'

// Desk page: metta/stock/page/outletwise_expiry_report
const METHOD = 'metta.stock.page.outletwise_expiry_report.outletwise_expiry_report.get_data'
const meta = reportByRoute('ReportsOutletwiseExpiry')
const ITEM_TYPES = ['', 'Medicine', 'Service', 'Consumable']
const STATUSES = ['All', 'Expired', 'Expiring Soon', 'Safe']
const INDICATORS = { Expired: 'red', 'Expiring Soon': 'orange', Safe: 'green' }
const COLUMNS = [
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'item_type', label: 'Item Type' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'batch_no', label: 'Batch No' },
  { key: 'rack_location', label: 'Shelf' },
  { key: 'qty_after_transaction', label: 'Closing Qty', type: 'number' },
  { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
  { key: 'days_to_expiry', label: 'Days to Expiry', type: 'number' },
  { key: 'closing_value', label: 'Closing Value', type: 'currency' },
  { key: 'status', label: 'Status' },
]

const { loading, error, run } = useRunner()
const f = reactive({ warehouse: '', item: '', item_type: '', status: 'All' })
const rows = ref(null)

// A snapshot of stock on the shelf now - no date, so it loads at once (Desk).
async function generate() {
  const data = await run(METHOD, { ...f })
  if (data) rows.value = data
}
generate()

const cards = computed(() => {
  const r = rows.value || []
  const expired = r.filter((x) => x.status === 'Expired')
  const soon = r.filter((x) => x.status === 'Expiring Soon')
  const atRisk = [...expired, ...soon].reduce((s, x) => s + flt(x.closing_value), 0)
  return [
    { label: 'Total Batches', value: r.length },
    { label: 'Expired', value: expired.length, tone: 'bad' },
    { label: 'Expiring Soon', value: soon.length, tone: 'warn' },
    { label: 'Value at Risk', value: money(atRisk), tone: 'bad' },
  ]
})

function show(col, v) {
  if (col.type === 'date') return ddmmyy(v)
  if (col.type === 'currency') return money(v)
  if (col.key === 'qty_after_transaction') return flt(v)
  return v ?? ''
}

function exportData() {
  if (!rows.value) return null
  const sub = filterLine([
    ['Warehouse', f.warehouse],
    ['Item Type', f.item_type],
    ['Status', f.status !== 'All' ? f.status : ''],
  ])
  return {
    title: 'Outlet-wise Expiry Report',
    subtitle: sub || 'All Outlets',
    columns: COLUMNS.map((c) => c.label),
    rows: rows.value.map((r) => COLUMNS.map((c) => cellText(show(c, r[c.key])))),
    filename: 'Outletwise_Expiry_Report',
  }
}
</script>
