<template>
  <ReportShell title="Date wise Purchase Order Details" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3">
        <TextField id="dwpo-from" v-model="f.from_date" label="From Date" type="date" reqd />
        <TextField id="dwpo-to" v-model="f.to_date" label="To Date" type="date" reqd />
        <LinkField id="dwpo-supplier" v-model="f.supplier" label="Supplier" doctype="Supplier" />
        <SelectField id="dwpo-status" v-model="f.status" label="Status" :options="STATUSES" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['today', 'week', 'month']" @pick="pickRange" />
    </template>

    <p class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800">{{ summary }}</p>

    <ReportTable v-if="rows" :columns="COLUMNS" :rows="rows" :total="total" empty="No Purchase Orders found for this range.">
      <template #cell="{ col, row, value }">
        <DocLink v-if="col.key === 'purchase_order'" doctype="Purchase Order" :name="value" />
        <Pill v-else-if="col.key === 'status'" :label="value" :color="STATUS_INDICATOR[value]" />
        <template v-else>{{ show(col, row) }}</template>
      </template>
    </ReportTable>
  </ReportShell>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import ExportButtons from '@/components/reports/ExportButtons.vue'
import QuickRanges from '@/components/reports/QuickRanges.vue'
import DocLink from '@/components/reports/DocLink.vue'
import Pill from '@/components/reports/Pill.vue'
import TextField from '@/components/TextField.vue'
import LinkField from '@/components/LinkField.vue'
import SelectField from '@/components/SelectField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { flt, money, ddmmyy, pct1, cellText, filterLine } from '@/data/reports/format'

// Desk page: metta/purchase_order/page/date_wise_purchase_order_details
const METHOD = 'metta.purchase_order.page.date_wise_purchase_order_details.date_wise_purchase_order_details.get_data'
const meta = reportByRoute('ReportsDateWisePurchaseOrder')
const STATUSES = ['', 'Pending Approval', 'Approved', 'Rejected', 'Sent to Dealer', 'Partially Received', 'Received', 'Closed', 'Cancelled']
const STATUS_INDICATOR = {
  'Pending Approval': 'orange',
  Approved: 'blue',
  Rejected: 'red',
  'Sent to Dealer': 'blue',
  'Partially Received': 'yellow',
  Received: 'green',
  Closed: 'darkgrey',
  Cancelled: 'red',
}
const COLUMNS = [
  { key: 'order_date', label: 'Order Date', type: 'date' },
  { key: 'purchase_order', label: 'Purchase Order' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'status', label: 'Status' },
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'qty_ordered', label: 'Qty Ordered', type: 'number' },
  { key: 'qty_received', label: 'Qty Received', type: 'number' },
  { key: 'pct_received', label: '% Received', type: 'number' },
  { key: 'rate', label: 'Rate', type: 'currency' },
  { key: 'amount', label: 'Amount', type: 'currency' },
  { key: 'expected_delivery', label: 'Expected Delivery', type: 'date' },
]

const { loading, error, run, warn } = useRunner()
// Desk leaves the dates blank on purpose - no query until someone asks.
const f = reactive({ from_date: '', to_date: '', supplier: '', status: '' })
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

const sum = (k) => (rows.value || []).reduce((s, r) => s + flt(r[k]), 0)
const summary = computed(() => {
  if (!rows.value) return 'Set a From Date and To Date, then click Generate.'
  const pos = new Set(rows.value.map((r) => r.purchase_order)).size
  return `${rows.value.length} item line(s) across ${pos} Purchase Order(s) - Total Amount: ${money(sum('amount'))}`
})
const total = computed(() => ({
  order_date: 'Total',
  qty_ordered: sum('qty_ordered'),
  qty_received: sum('qty_received'),
  pct_received: pct1(sum('qty_received'), sum('qty_ordered')),
  amount: sum('amount'),
}))

// One formatter for screen and export, as Desk's render/get_export_data agree.
function show(col, r) {
  if (col.key === 'pct_received') return pct1(r.qty_received, r.qty_ordered)
  const v = r[col.key]
  if (col.type === 'date') return ddmmyy(v)
  if (col.type === 'currency') return money(v)
  if (col.type === 'number') return flt(v)
  return v ?? ''
}

function exportData() {
  if (!rows.value) return null
  const t = total.value
  const pairs = [
    ['From Date', ddmmyy(f.from_date)],
    ['To Date', ddmmyy(f.to_date)],
    ['Supplier', f.supplier],
    ['Status', f.status],
  ]
  return {
    title: 'Date wise Purchase Order Details',
    subtitle: filterLine(pairs),
    columns: COLUMNS.map((c) => c.label),
    rows: [
      ...rows.value.map((r) => COLUMNS.map((c) => cellText(show(c, r)))),
      // Aligned under the matching columns (Desk's export shifts this row one cell left).
      ['Total', '', '', '', '', '', String(t.qty_ordered), String(t.qty_received), t.pct_received, '', money(t.amount), ''],
    ],
    filename: 'Date_wise_Purchase_Order_Details',
  }
}
</script>
