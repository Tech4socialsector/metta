<template>
  <ReportShell title="Previous Day Stock Report" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="pdsr-date" v-model="f.as_of_date" label="As of Date" type="date" reqd />
        <LinkField id="pdsr-wh" v-model="f.warehouse" label="Warehouse" doctype="Warehouse" />
        <LinkField id="pdsr-item" v-model="f.item" label="Item" doctype="Item" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['yesterday']" @pick="pickRange" />
    </template>

    <template v-if="rows">
      <SummaryCards :cards="cards" />
      <ReportTable :columns="COLUMNS" :rows="rows" :total="total" :row-class="(r) => (isZero(r) ? 'bg-red-50 text-red-800' : '')" empty="No stock found as of this date.">
        <template #cell="{ col, row, value }">
          <DocLink v-if="col.key === 'item'" doctype="Item" :name="value" />
          <DocLink v-else-if="col.key === 'voucher_no'" :doctype="row.voucher_type" :name="value" />
          <Pill v-else-if="col.key === 'status'" :label="value" :color="value === 'Zero Stock' ? 'red' : 'green'" />
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
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { flt, money, ddmmyy, addDays, todayStr, filterLine } from '@/data/reports/format'

// Desk page: metta/stock/page/previous_day_stock_report
const METHOD = 'metta.stock.page.previous_day_stock_report.previous_day_stock_report.get_data'
const meta = reportByRoute('ReportsPreviousDayStock')
const COLUMNS = [
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'batch_no', label: 'Batch' },
  { key: 'qty_after_transaction', label: 'Closing Qty', type: 'number' },
  { key: 'valuation_rate', label: 'Valuation Rate', type: 'currency' },
  { key: 'closing_value', label: 'Closing Value', type: 'currency' },
  { key: 'posting_datetime', label: 'Last Transaction', type: 'date' },
  { key: 'voucher_type', label: 'Voucher Type' },
  { key: 'voucher_no', label: 'Voucher No' },
  { key: 'status', label: 'Status' },
]

const { loading, error, run, warn } = useRunner()
// "Yesterday" is what this report is for, so Desk fills it in and runs at once.
const f = reactive({ as_of_date: addDays(todayStr(), -1), warehouse: '', item: '' })
const raw = ref(null)

const isZero = (r) => flt(r.qty_after_transaction) === 0

async function generate() {
  if (!f.as_of_date) return warn('Please set an As of Date.')
  const data = await run(METHOD, { ...f })
  if (data) raw.value = data
}
function pickRange([day]) {
  f.as_of_date = day
  generate()
}
generate()

// Zero-qty rows stay in the table (flagged) - Desk shows them too.
const rows = computed(() =>
  raw.value
    ? raw.value.map((r) => ({
        ...r,
        closing_value: flt(r.qty_after_transaction) * flt(r.valuation_rate),
        status: isZero(r) ? 'Zero Stock' : 'In Stock',
      }))
    : null,
)

// Desk's Total row only counts rows still holding stock.
const totalsOf = () => {
  const nz = (rows.value || []).filter((r) => flt(r.qty_after_transaction) > 0)
  return { qty: nz.reduce((s, r) => s + flt(r.qty_after_transaction), 0), value: nz.reduce((s, r) => s + r.closing_value, 0) }
}
const total = computed(() => {
  const t = totalsOf()
  return { item: 'Total', qty_after_transaction: t.qty, closing_value: t.value }
})

const cards = computed(() => {
  const r = rows.value || []
  const zero = r.filter(isZero).length
  return [
    { label: 'Items Tracked', value: new Set(r.filter((x) => flt(x.qty_after_transaction) > 0).map((x) => x.item)).size },
    { label: 'Total Closing Value', value: money(r.reduce((s, x) => s + x.closing_value, 0)) },
    { label: 'Items at Zero Stock', value: zero, tone: zero ? 'bad' : undefined },
  ]
})

function show(col, v) {
  if (col.type === 'currency') return money(v)
  if (col.type === 'date') return ddmmyy(v)
  if (col.type === 'number') return flt(v)
  return v ?? ''
}

function exportData() {
  if (!rows.value) return null
  const data = rows.value.map((r) => COLUMNS.map((c) => (c.type === 'number' ? flt(r[c.key]) : String(show(c, r[c.key])))))
  const t = totalsOf()
  data.push(['Total', '', '', '', t.qty, '', money(t.value), '', '', '', ''])
  return {
    title: 'Previous Day Stock Report',
    subtitle: filterLine([
      ['As of Date', ddmmyy(f.as_of_date)],
      ['Warehouse', f.warehouse],
      ['Item', f.item],
    ]),
    columns: COLUMNS.map((c) => c.label),
    rows: data,
    filename: 'Previous_Day_Stock_Report',
  }
}
</script>
