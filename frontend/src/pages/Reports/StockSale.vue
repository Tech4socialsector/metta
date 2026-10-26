<template>
  <ReportShell title="Stock Sale Report" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="ssr-from" v-model="f.from_date" label="From Date" type="date" reqd />
        <TextField id="ssr-to" v-model="f.to_date" label="To Date" type="date" reqd />
        <LinkField id="ssr-wh" v-model="f.warehouse" label="Warehouse (Outlet)" doctype="Warehouse" />
        <LinkField id="ssr-item" v-model="f.item" label="Item" doctype="Item" />
        <SelectField id="ssr-item-type" v-model="f.item_type" label="Item Type" :options="ITEM_TYPES" />
        <SelectField id="ssr-bill-type" v-model="f.bill_type" label="Bill Type" :options="BILL_TYPES" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['today', 'week', 'month']" @pick="pickRange" />
    </template>

    <template v-if="rows">
      <SummaryCards :cards="cards" />
      <ReportTable :columns="COLUMNS" :rows="rows" :total="total" :row-class="(r) => (r.is_low_stock ? 'bg-red-50' : '')" empty="No sales or stock found for this range.">
        <template #cell="{ col, row, value }">
          <DocLink v-if="col.key === 'item'" doctype="Item" :name="value" />
          <span v-else-if="col.key === 'days_of_stock' && !selling(row)" class="text-gray-500">Not selling</span>
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
import TextField from '@/components/TextField.vue'
import LinkField from '@/components/LinkField.vue'
import SelectField from '@/components/SelectField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { flt, money, ddmmyy, filterLine } from '@/data/reports/format'

// Desk page: metta/stock/page/stock_sale_report
const METHOD = 'metta.stock.page.stock_sale_report.stock_sale_report.get_data'
const meta = reportByRoute('ReportsStockSale')
const ITEM_TYPES = ['', 'Medicine', 'Service', 'Consumable']
const BILL_TYPES = ['', 'Pharmacy', 'Service', 'Mixed']
const COLUMNS = [
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'item_type', label: 'Item Type' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'bill_count', label: 'Bills', type: 'number' },
  { key: 'qty_sold', label: 'Qty Sold', type: 'number' },
  { key: 'current_stock', label: 'Current Stock', type: 'number' },
  { key: 'sales_value', label: 'Sales Value', type: 'currency' },
  { key: 'gst_collected', label: 'GST Collected', type: 'currency' },
  { key: 'days_of_stock', label: 'Days of Stock Left', type: 'number' },
]

const { loading, error, run, warn } = useRunner()
// Dates start blank on purpose, as in Desk - nothing runs until asked.
const f = reactive({ from_date: '', to_date: '', warehouse: '', item: '', item_type: '', bill_type: '' })
const rows = ref(null)

const selling = (r) => r.days_of_stock !== null && r.days_of_stock !== undefined
const sum = (key) => (rows.value || []).reduce((s, r) => s + flt(r[key]), 0)

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

const total = computed(() => ({
  item: 'Total',
  bill_count: sum('bill_count'),
  qty_sold: sum('qty_sold'),
  current_stock: sum('current_stock'),
  sales_value: sum('sales_value'),
  gst_collected: sum('gst_collected'),
}))

const cards = computed(() => [
  { label: 'Items Listed', value: (rows.value || []).length },
  { label: 'Sales Value', value: money(sum('sales_value')) },
  { label: 'Current Stock Value', value: money(sum('stock_value')) },
  { label: 'Below Reorder Level', value: (rows.value || []).filter((r) => r.is_low_stock).length },
])

function show(col, v) {
  if (col.key === 'days_of_stock') return Math.round(v)
  if (col.key === 'bill_count') return v
  if (col.type === 'currency') return money(v)
  if (col.type === 'number') return flt(v)
  return v ?? ''
}

function exportData() {
  if (!rows.value) return null
  const data = rows.value.map((r) => [
    r.item || '',
    r.item_name || '',
    r.item_type || '',
    r.warehouse || '',
    r.bill_count,
    flt(r.qty_sold),
    flt(r.current_stock),
    money(r.sales_value),
    money(r.gst_collected),
    selling(r) ? Math.round(r.days_of_stock) : 'Not selling',
    r.is_low_stock ? 'Yes' : '',
  ])
  const t = total.value
  data.push(['Total', '', '', '', t.bill_count, t.qty_sold, t.current_stock, money(t.sales_value), money(t.gst_collected), '', ''])
  return {
    title: 'Stock Sale Report',
    subtitle: filterLine([
      ['From Date', ddmmyy(f.from_date)],
      ['To Date', ddmmyy(f.to_date)],
      ['Warehouse', f.warehouse],
      ['Item Type', f.item_type],
      ['Bill Type', f.bill_type],
    ]),
    columns: [...COLUMNS.map((c) => c.label), 'Below Reorder Level'],
    rows: data,
    filename: 'Stock_Sale_Report',
  }
}
</script>
