<template>
  <ReportShell title="Batch-wise Stock Listing" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="bwsl-date" v-model="f.as_on_date" label="As on Date" type="date" reqd />
        <LinkField id="bwsl-wh" v-model="f.warehouse" label="Warehouse (Outlet)" doctype="Warehouse" />
        <LinkField id="bwsl-item" v-model="f.item" label="Item" doctype="Item" />
        <LinkField id="bwsl-batch" v-model="f.batch_no" label="Batch No." doctype="Batch" :hint="batchNote" />
        <LinkField id="bwsl-supplier" v-model="f.supplier" label="Supplier" doctype="Supplier" />
        <SelectField id="bwsl-type" v-model="f.item_type" label="Item Type" :options="ITEM_TYPES" />
        <SelectField id="bwsl-status" v-model="f.status" label="Expiry Status" :options="STATUSES" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
    </template>

    <template v-if="rows">
      <SummaryCards :cards="cards" />
      <ReportTable :columns="COLUMNS" :rows="rows" :row-class="(r) => (r.status === 'Expired' ? 'bg-red-50' : '')" empty="No available batches found for this filter.">
        <template #cell="{ col, row, value }">
          <DocLink v-if="col.key === 'item'" doctype="Item" :name="value" />
          <DocLink v-else-if="col.key === 'batch_no'" doctype="Batch" :name="value" />
          <Pill v-else-if="col.key === 'status'" :label="value" :color="INDICATORS[value]" />
          <template v-else>{{ show(col, value) }}</template>
        </template>
      </ReportTable>
    </template>
  </ReportShell>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import SummaryCards from '@/components/reports/SummaryCards.vue'
import ExportButtons from '@/components/reports/ExportButtons.vue'
import DocLink from '@/components/reports/DocLink.vue'
import Pill from '@/components/reports/Pill.vue'
import TextField from '@/components/TextField.vue'
import LinkField from '@/components/LinkField.vue'
import SelectField from '@/components/SelectField.vue'
import { getValue } from '@/data/api'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { flt, money, ddmmyy, todayStr, cellText } from '@/data/reports/format'

// Desk page: metta/stock/page/batch_wise_stock_listing
const METHOD = 'metta.stock.page.batch_wise_stock_listing.batch_wise_stock_listing.get_data'
const meta = reportByRoute('ReportsBatchWiseStock')
const ITEM_TYPES = ['', 'Medicine', 'Service', 'Consumable']
const STATUSES = ['All', 'Expired', 'Expiring in 30 Days', 'Expiring in 31-60 Days', 'Expiring in 61-90 Days', 'Safe']
const INDICATORS = { Expired: 'red', 'Expiring in 30 Days': 'orange', 'Expiring in 31-60 Days': 'yellow', 'Expiring in 61-90 Days': 'blue', Safe: 'green' }
// Desk centres dates/days/qty/value; ReportTable right-aligns numbers instead.
const COLUMNS = [
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'item_type', label: 'Item Type' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'batch_no', label: 'Batch No.' },
  { key: 'manufacturing_date', label: 'Mfg. Date', type: 'date' },
  { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
  { key: 'days_to_expiry', label: 'Days Left', type: 'number' },
  { key: 'available_qty', label: 'Available Qty', type: 'number' },
  { key: 'rack_location', label: 'Shelf' },
  { key: 'stock_value', label: 'Stock Value', type: 'currency' },
  { key: 'status', label: 'Status' },
]

const { loading, error, run } = useRunner()
const f = reactive({ as_on_date: todayStr(), warehouse: '', item: '', batch_no: '', supplier: '', item_type: '', status: 'All' })
const rows = ref(null)

// Desk shows the picked batch's supplier under the Batch field.
const batchNote = ref('')
watch(
  () => f.batch_no,
  async (b) => {
    batchNote.value = ''
    if (!b) return
    const r = await getValue('Batch', b, 'supplier').catch(() => null)
    if (f.batch_no === b) batchNote.value = r?.supplier ? `Supplier: ${r.supplier}` : 'No supplier on record for this batch.'
  },
)

async function generate() {
  const data = await run(METHOD, { ...f })
  if (data) rows.value = data
}
generate()

const cards = computed(() => {
  const r = rows.value || []
  const expired = r.filter((x) => x.status === 'Expired').length
  const expiring = r.filter((x) => x.status === 'Expiring in 30 Days').length
  return [
    { label: 'Active Batches', value: r.length },
    { label: 'Available Stock Qty', value: r.reduce((s, x) => s + flt(x.available_qty), 0) },
    { label: 'Expiring in 30 Days', value: expiring, tone: 'warn' },
    { label: 'Expired Batches', value: expired, tone: 'bad' },
    { label: 'Stock Value', value: money(r.reduce((s, x) => s + flt(x.stock_value), 0)) },
  ]
})

function show(col, v) {
  if (col.type === 'date') return ddmmyy(v)
  if (col.type === 'currency') return money(v)
  if (col.key === 'available_qty') return flt(v)
  return v ?? ''
}

function exportData() {
  if (!rows.value) return null
  return {
    title: 'Batch-wise Stock Listing',
    subtitle: `As on Date: ${ddmmyy(f.as_on_date)}`,
    columns: COLUMNS.map((c) => c.label),
    rows: rows.value.map((r) => COLUMNS.map((c) => cellText(show(c, r[c.key])))),
    filename: 'Batch_Wise_Stock_Listing',
  }
}
</script>
