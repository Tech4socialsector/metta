<template>
  <ReportShell title="GRL for GST" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="grl-from" v-model="f.from_date" label="From Date" type="date" reqd />
        <TextField id="grl-to" v-model="f.to_date" label="To Date" type="date" reqd />
        <LinkField id="grl-wh" v-model="f.warehouse" label="Warehouse (Outlet)" doctype="Warehouse" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['month', 'last_month']" @pick="pickRange" />
    </template>

    <p v-if="!data && !loading" class="text-sm text-gray-600">Set a From Date and To Date, then click Generate.</p>

    <template v-if="data">
      <SummaryCards :cards="cards" />

      <div class="flex gap-2" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          role="tab"
          :aria-selected="active === t.key"
          class="h-9 rounded-md border px-4 text-sm font-semibold"
          :class="active === t.key ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'"
          @click="active = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <SectionTitle :title="`HSN-wise Summary - ${detailLabel}`" icon="list" />
      <ReportTable :columns="HSN_COLS" :rows="section.hsn_summary" :total="hsnTotal(section.hsn_summary)">
        <template #cell="{ col, value }">{{ col.key === 'gst_percent' ? pct(value) : showHsn(col, value) }}</template>
      </ReportTable>

      <SectionTitle :title="`Invoice-wise Detail - ${detailLabel}`" icon="file-text" />
      <ReportTable :columns="detailCols" :rows="section.detail" :total="detailTotal(section.detail)">
        <template #cell="{ col, row, value }"><GrlCell :col="col" :row="row" :value="value" /></template>
      </ReportTable>

      <SectionTitle :title="`Less: ${returnsLabel}`" icon="undo-2" />
      <p v-if="!section.returns_hsn_summary.length" class="text-sm text-gray-600">None in this period.</p>
      <template v-else>
        <ReportTable :columns="HSN_COLS" :rows="section.returns_hsn_summary" :total="hsnTotal(section.returns_hsn_summary)">
          <template #cell="{ col, value }">{{ col.key === 'gst_percent' ? pct(value) : showHsn(col, value) }}</template>
        </ReportTable>
        <ReportTable :columns="detailCols" :rows="section.returns_detail" :total="detailTotal(section.returns_detail)">
          <template #cell="{ col, row, value }"><GrlCell :col="col" :row="row" :value="value" /></template>
        </ReportTable>
      </template>
    </template>
  </ReportShell>
</template>

<script setup>
import { computed, h, reactive, ref } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import SummaryCards from '@/components/reports/SummaryCards.vue'
import ExportButtons from '@/components/reports/ExportButtons.vue'
import QuickRanges from '@/components/reports/QuickRanges.vue'
import DocLink from '@/components/reports/DocLink.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import TextField from '@/components/TextField.vue'
import LinkField from '@/components/LinkField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { flt, money, ddmmyy, filterLine } from '@/data/reports/format'

// Desk page: metta/sales/page/grl_for_gst
const METHOD = 'metta.sales.page.grl_for_gst.grl_for_gst.get_data'
const meta = reportByRoute('ReportsGrlForGst')
const TABS = [
  { key: 'output', label: 'Output Tax (Sales)' },
  { key: 'input', label: 'Input Tax (Purchases)' },
]
const HSN_COLS = [
  { key: 'hsn_code', label: 'HSN Code' },
  { key: 'hsn_description', label: 'Description' },
  { key: 'gst_percent', label: 'GST %', type: 'number' },
  { key: 'doc_count', label: 'Docs', type: 'number' },
  { key: 'taxable_value', label: 'Taxable Value', type: 'currency' },
  { key: 'gst_amount', label: 'GST Amount', type: 'currency' },
]

const { loading, error, run, warn } = useRunner()
// Dates start blank, as in Desk - GST is filed for a period picked on purpose.
const f = reactive({ from_date: '', to_date: '', warehouse: '' })
const data = ref(null)
const active = ref('output')

const isOutput = computed(() => active.value === 'output')
const section = computed(() => data.value[active.value])
const detailLabel = computed(() => (isOutput.value ? 'Sales' : 'Purchases'))
const returnsLabel = computed(() => (isOutput.value ? 'Sales Returns' : 'Purchase Returns'))
const detailCols = computed(() => [
  { key: 'doc_type', label: 'Type' },
  { key: 'doc_no', label: 'Doc No' },
  { key: 'doc_date', label: 'Date', type: 'date' },
  { key: 'party', label: isOutput.value ? 'Customer' : 'Supplier' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'item', label: 'Item' },
  { key: 'item_name', label: 'Item Name' },
  { key: 'hsn_code', label: 'HSN Code' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'rate', label: 'Rate', type: 'currency' },
  { key: 'amount', label: 'Taxable Value', type: 'currency' },
  { key: 'gst_percent', label: 'GST %', type: 'number' },
  { key: 'gst_amount', label: 'GST Amount', type: 'currency' },
])

async function generate() {
  if (!f.from_date || !f.to_date) return warn('Please set both From Date and To Date.')
  const res = await run(METHOD, { ...f })
  if (res) data.value = res
}
function pickRange([from, to]) {
  f.from_date = from
  f.to_date = to
  generate()
}

const cards = computed(() => {
  const s = data.value.summary
  return [
    { label: 'Output Taxable Value', value: money(s.output_taxable), sub: 'Sales, net of Sales Returns' },
    { label: 'Output GST', value: money(s.output_gst), sub: `CGST ${money(s.output_cgst)} + SGST ${money(s.output_sgst)}` },
    { label: 'Input Taxable Value', value: money(s.input_taxable), sub: 'Purchases, net of Purchase Returns' },
    { label: 'Input GST (ITC)', value: money(s.input_gst), sub: `CGST ${money(s.input_cgst)} + SGST ${money(s.input_sgst)}` },
    { label: 'Net GST Payable', value: money(s.net_gst_payable), sub: 'Output GST minus Input GST (ITC)', tone: 'bad' },
  ]
})

function pct(v) {
  return v !== null && v !== undefined ? `${flt(v)}%` : ''
}
function showHsn(col, v) {
  if (col.type === 'currency') return money(v)
  if (col.key === 'doc_count') return v
  return v ?? ''
}
const sum = (rows, k) => rows.reduce((s, r) => s + flt(r[k]), 0)
function hsnTotal(rows) {
  return rows.length ? { hsn_code: 'Total', taxable_value: sum(rows, 'taxable_value'), gst_amount: sum(rows, 'gst_amount') } : null
}
function detailTotal(rows) {
  return rows.length ? { doc_type: 'Total', amount: sum(rows, 'amount'), gst_amount: sum(rows, 'gst_amount') } : null
}

// One detail cell: document numbers and items open their records.
function detailText(col, row, v) {
  if (col.key === 'doc_date') return ddmmyy(v)
  if (col.key === 'party') return v || (isOutput.value ? 'Walk-in' : '')
  if (col.key === 'qty') return flt(v)
  if (col.type === 'currency') return money(v)
  if (col.key === 'gst_percent') return pct(v)
  return v ?? ''
}
const GrlCell = (props) => {
  const { col, row, value } = props
  if (col.key === 'doc_no') return h(DocLink, { doctype: row.doc_type, name: value })
  if (col.key === 'item') return h(DocLink, { doctype: 'Item', name: value })
  return detailText(col, row, value)
}
GrlCell.props = ['col', 'row', 'value']

// Desk exports the open tab's invoice-wise rows (sales + returns) with one total row.
function exportData() {
  if (!data.value) return null
  const rowsSource = [...section.value.detail, ...section.value.returns_detail]
  if (!rowsSource.length) return null
  const cols = detailCols.value
  const rows = rowsSource.map((r) => cols.map((c) => String(detailText(c, r, r[c.key]))))
  rows.push(['Total', '', '', '', '', '', '', '', '', '', money(sum(rowsSource, 'amount')), '', money(sum(rowsSource, 'gst_amount'))])
  const bits = [
    ['From Date', ddmmyy(f.from_date)],
    ['To Date', ddmmyy(f.to_date)],
  ]
  if (isOutput.value && f.warehouse) bits.push(['Warehouse', f.warehouse])
  return {
    title: isOutput.value ? 'GRL for GST - Output Tax (Sales)' : 'GRL for GST - Input Tax (Purchases)',
    subtitle: filterLine(bits),
    columns: cols.map((c) => c.label),
    rows,
    filename: isOutput.value ? 'GRL_GST_Output' : 'GRL_GST_Input',
  }
}
</script>
