<template>
  <ReportShell title="Purchase Analysis" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3">
        <TextField id="pa-from" v-model="f.from_date" label="From Date" type="date" reqd />
        <TextField id="pa-to" v-model="f.to_date" label="To Date" type="date" reqd />
        <LinkField id="pa-supplier" v-model="f.supplier" label="Supplier" doctype="Supplier" />
        <LinkField id="pa-item" v-model="f.item" label="Item" doctype="Item" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['today', 'week', 'month']" @pick="pickRange" />
    </template>

    <p v-if="!rows" class="text-sm text-gray-600">Set a From Date and To Date, then click Generate.</p>
    <template v-else>
      <SummaryCards :cards="cards" />
      <ReportTable :columns="COLUMNS" :rows="rows" :total="total" empty="No Purchase Orders found for this range.">
        <template #cell="{ col, row, value }">
          <DocLink v-if="col.key === 'purchase_order'" doctype="Purchase Order" :name="value" />
          <Pill v-else-if="col.key === 'billing_status'" :label="billingStatus(row)" :color="BILLING_INDICATOR[billingStatus(row)]" />
          <template v-else>{{ show(col, row) }}</template>
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
import { flt, money, ddmmyy, pct1, cellText, filterLine } from '@/data/reports/format'

// Desk page: metta/stock/page/purchase_analysis
const METHOD = 'metta.stock.page.purchase_analysis.purchase_analysis.get_data'
const meta = reportByRoute('ReportsPurchaseAnalysis')
const BILLING_INDICATOR = { 'Not Billed': 'red', 'Partially Billed': 'orange', 'Fully Billed': 'green' }
const COLUMNS = [
  { key: 'order_date', label: 'Order Date', type: 'date' },
  { key: 'purchase_order', label: 'Purchase Order' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'qty_ordered', label: 'Qty Ordered', type: 'number' },
  { key: 'qty_received', label: 'Qty Received', type: 'number' },
  { key: 'pct_received', label: '% Received', type: 'number' },
  { key: 'rate', label: 'Rate', type: 'currency' },
  { key: 'ordered_amount', label: 'Ordered Amount', type: 'currency' },
  { key: 'billed_amount', label: 'Billed Amount', type: 'currency' },
  { key: 'billing_status', label: 'Billing Status' },
]

// Desk's rule: nothing billed / billed >= ordered / anything in between.
function billingStatus(r) {
  if (flt(r.billed_amount) <= 0) return 'Not Billed'
  if (flt(r.billed_amount) >= flt(r.ordered_amount)) return 'Fully Billed'
  return 'Partially Billed'
}

const { loading, error, run, warn } = useRunner()
const f = reactive({ from_date: '', to_date: '', supplier: '', item: '' })
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

const sum = (fn) => (rows.value || []).reduce((s, r) => s + fn(r), 0)
const total = computed(() => ({
  order_date: 'Total',
  qty_ordered: sum((r) => flt(r.qty_ordered)),
  qty_received: sum((r) => flt(r.qty_received)),
  pct_received: pct1(sum((r) => flt(r.qty_received)), sum((r) => flt(r.qty_ordered))),
  ordered_amount: sum((r) => flt(r.ordered_amount)),
  billed_amount: sum((r) => flt(r.billed_amount)),
}))

// Received value and pending value are qty x PO rate, as Desk works them out.
const cards = computed(() => {
  const pending = sum((r) => (flt(r.qty_ordered) - flt(r.qty_received)) * flt(r.rate))
  return [
    { label: 'Total Ordered Amount', value: money(total.value.ordered_amount) },
    { label: 'Total Received Value', value: money(sum((r) => flt(r.qty_received) * flt(r.rate))) },
    { label: 'Total Billed Amount', value: money(total.value.billed_amount) },
    { label: 'Pending Receipt Value', value: money(pending), tone: pending > 0 ? 'warn' : undefined },
  ]
})

function show(col, r) {
  if (col.key === 'pct_received') return pct1(r.qty_received, r.qty_ordered)
  if (col.key === 'billing_status') return billingStatus(r)
  const v = r[col.key]
  if (col.type === 'date') return ddmmyy(v)
  if (col.type === 'currency') return money(v)
  if (col.type === 'number') return flt(v)
  return v ?? ''
}

function exportData() {
  if (!rows.value) return null
  const t = total.value
  return {
    title: 'Purchase Analysis',
    subtitle: filterLine([
      ['From Date', ddmmyy(f.from_date)],
      ['To Date', ddmmyy(f.to_date)],
      ['Supplier', f.supplier],
      ['Item', f.item],
    ]),
    columns: COLUMNS.map((c) => c.label),
    rows: [
      ...rows.value.map((r) => COLUMNS.map((c) => cellText(show(c, r)))),
      ['Total', '', '', '', '', String(t.qty_ordered), String(t.qty_received), t.pct_received, '', money(t.ordered_amount), money(t.billed_amount), ''],
    ],
    filename: 'Purchase_Analysis',
  }
}
</script>
