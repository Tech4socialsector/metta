<template>
  <ReportShell title="Stock Ledger" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions>
      <div class="flex items-center gap-2">
        <button type="button" :class="EXP_BTN" :disabled="!rows || !rows.length" @click="exportAs('Excel')">Excel</button>
        <button type="button" :class="EXP_BTN" :disabled="!rows || !rows.length" @click="exportAs('CSV')">CSV</button>
      </div>
    </template>

    <!-- Filters from the report's own .json (the .js defines none): all
    optional, no defaults; Desk re-runs the report on every change. -->
    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <LinkField id="sl-item" v-model="f.item" label="Item" doctype="Item" />
        <LinkField id="sl-wh" v-model="f.warehouse" label="Warehouse" doctype="Warehouse" />
        <LinkField id="sl-batch" v-model="f.batch_no" label="Batch" doctype="Batch" />
        <SelectField id="sl-vtype" v-model="f.voucher_type" label="Voucher Type" :options="VOUCHER_TYPES" />
        <TextField id="sl-from" v-model="f.from_date" label="From Date" type="datetime-local" />
        <TextField id="sl-to" v-model="f.to_date" label="To Date" type="datetime-local" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
    </template>

    <!-- Newest first by default, so the top row is the stock now; each row's
    Balance Qty is still "stock right after this entry" either way. -->
    <div v-if="rows && rows.length" class="flex items-center justify-end gap-2 text-sm">
      <span class="text-gray-600">Order</span>
      <div class="inline-flex overflow-hidden rounded-md border border-gray-300" role="group" aria-label="Order">
        <button v-for="o in ORDERS" :key="o.key" type="button" class="h-8 px-3 font-semibold" :class="order === o.key ? 'bg-brand-700 text-white' : 'bg-white hover:bg-gray-50'" :aria-pressed="order === o.key" @click="order = o.key">{{ o.label }}</button>
      </div>
    </div>
    <ReportTable v-if="rows" :columns="columns" :rows="shownRows" empty="Nothing to show">
      <template #cell="{ col, row, value }">
        <DocLink v-if="col.fieldtype === 'Link' && value" :doctype="col.options" :name="value" />
        <DocLink v-else-if="col.fieldtype === 'Dynamic Link' && value && row[col.options]" :doctype="row[col.options]" :name="value" />
        <!-- In shows "+" in green, out shows "−" in red, so the direction reads at a glance. -->
        <span v-else-if="col.fieldname === 'qty_change' && Number(value)" class="font-semibold" :class="Number(value) > 0 ? 'text-green-700' : 'text-red-700'">{{ Number(value) > 0 ? '+' : '' }}{{ show(col, value) }}</span>
        <template v-else>{{ show(col, value) }}</template>
      </template>
    </ReportTable>
  </ReportShell>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import DocLink from '@/components/reports/DocLink.vue'
import TextField from '@/components/TextField.vue'
import LinkField from '@/components/LinkField.vue'
import SelectField from '@/components/SelectField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { exportQueryReport } from '@/data/reports/export'
import { QUERY_REPORT_RUN, queryReportArgs, normaliseColumns, normaliseRows } from '@/data/reports/queryReport'

// Desk script report: metta/stock/report/stock_ledger (add_total_row: 0)
const REPORT = 'Stock Ledger'
const meta = reportByRoute('ReportsStockLedger')
const VOUCHER_TYPES = ['', 'Purchase Receipt', 'Purchase Return', 'Stock Transfer', 'Material Issue', 'Stock Adjustment', 'Stock Reconciliation', 'Billing']
const EXP_BTN = 'h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

const { loading, error, run } = useRunner()
const f = reactive({ item: '', warehouse: '', batch_no: '', voucher_type: '', from_date: '', to_date: '' })
const columns = ref([])
const rows = ref(null)
// The server sends oldest first (Balance Qty is worked out in that order);
// flipping only the display keeps every row's balance as it is.
const ORDERS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
]
const order = ref('newest')
const shownRows = computed(() => (order.value === 'newest' ? [...(rows.value || [])].reverse() : rows.value || []))

// Datetime filters go to the server as "YYYY-MM-DD HH:MM:SS", as Desk sends them.
function serverFilters() {
  const dt = (v) => (v ? `${v.replace('T', ' ')}${v.length === 16 ? ':00' : ''}` : '')
  return { ...f, from_date: dt(f.from_date), to_date: dt(f.to_date) }
}

// Filter changes can overlap; only the latest run's answer is shown.
let seq = 0
async function generate() {
  const mine = ++seq
  const data = await run(QUERY_REPORT_RUN, queryReportArgs(REPORT, serverFilters()))
  if (!data || mine !== seq) return
  columns.value = normaliseColumns(data.columns).map((c) => (c.fieldtype === 'Float' ? { ...c, type: 'number' } : c))
  rows.value = normaliseRows(data.result, columns.value)
}
// A query report runs as soon as it opens and again on every filter change.
generate()
watch(() => ({ ...f }), generate)

function exportAs(format) {
  exportQueryReport(REPORT, Object.fromEntries(Object.entries(serverFilters()).filter(([, v]) => v)), format)
}

// Desk formatters with this site's settings (dd-mm-yyyy, HH:mm:ss, float
// precision 3, Indian grouping); a whole Float shows without decimals.
function show(col, v) {
  if (v === null || v === undefined || v === '') return ''
  if (col.fieldtype === 'Datetime') {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/)
    return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}` : v
  }
  if (col.fieldtype === 'Float') {
    const n = Number(v)
    const whole = Number.isInteger(n)
    return n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 3, maximumFractionDigits: whole ? 0 : 3 })
  }
  if (col.fieldtype === 'Date') return String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*/, (_, y, mo, d) => `${d}-${mo}-${y}`)
  return v
}
</script>
