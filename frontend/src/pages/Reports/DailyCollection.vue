<template>
  <ReportShell title="Daily Collection Report" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="dcr-from" v-model="f.from_date" label="From Date (dd/mm/yyyy)" type="date" reqd />
        <TextField id="dcr-to" v-model="f.to_date" label="To Date (dd/mm/yyyy)" type="date" reqd />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['today', 'week', 'month']" @pick="pickRange" />
    </template>

    <template v-if="data">
      <div>
        <button type="button" class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm hover:bg-gray-50" @click="showVisited">
          Patients Visited: <b class="text-base text-brand-800">{{ data.visited_patients_count || 0 }}</b>
        </button>
      </div>

      <!-- Desk's two-column grid: wide boxes span the row; an odd paired box
      left alone in its run stretches to fill the row (balance_grid). -->
      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div v-for="b in boxes" :key="b.key" :class="b.full ? 'lg:col-span-2' : ''">
          <ReportTable :heading="b.heading" :columns="b.columns" :rows="b.rows" :total="b.total" :empty="b.empty">
            <template #cell="{ col, row, value, index }">
              <button
                v-if="b.clickable(col, row)"
                type="button"
                class="underline decoration-dotted underline-offset-[3px] hover:text-brand-800"
                @click="b.open(row, col, index)"
              >
                {{ cellShow(col, value) }}
              </button>
              <template v-else>{{ cellShow(col, value) }}</template>
            </template>
          </ReportTable>
        </div>
      </div>
    </template>

    <AppDialog v-model="dlg.open" :title="dlg.title">
      <p v-if="!dlg.rows.length" class="text-sm text-gray-600">No underlying records found for this.</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-600">
            <tr>
              <th class="px-3 py-2 font-semibold">Document</th>
              <th class="px-3 py-2 font-semibold">Detail</th>
              <th class="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in dlg.rows" :key="i" class="border-b border-gray-100 last:border-0">
              <td class="whitespace-nowrap px-3 py-2"><DocLink :doctype="d.doctype" :name="d.name" new-tab /></td>
              <td class="px-3 py-2">{{ d.detail }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">{{ d.amount != null ? money(d.amount) : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppDialog>
  </ReportShell>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import ExportButtons from '@/components/reports/ExportButtons.vue'
import QuickRanges from '@/components/reports/QuickRanges.vue'
import DocLink from '@/components/reports/DocLink.vue'
import AppDialog from '@/components/AppDialog.vue'
import TextField from '@/components/TextField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { money, ddmmyy, todayStr } from '@/data/reports/format'

// Desk page: metta/sales/page/daily_collection_report
const BASE = 'metta.sales.page.daily_collection_report.daily_collection_report'
const meta = reportByRoute('ReportsDailyCollection')
const USER_COLS = [
  ['gross_amt', 'Gross Amt'],
  ['charity', 'Charity'],
  ['card', 'Card'],
  ['gpay', 'Gpay'],
  ['credit_bills', 'Credit Bills'],
  ['sales_ret', 'Sales Ret'],
  ['adv_ip', 'Adv/IP'],
  ['cash_amt', 'Cash Amt'],
]
const SL = { key: 'sl', label: 'Sl No', type: 'number' }
const PART = { key: 'label', label: 'Particulars' }
const OP = { key: 'op_amount', label: 'OP Amount', type: 'currency' }
const IP = { key: 'ip_amount', label: 'IP Amount', type: 'currency' }
const AMT = { key: 'amount', label: 'Amount', type: 'currency' }
const TAX = { key: 'tax_amount', label: 'Tax Amount', type: 'currency' }

const { loading, error, run } = useRunner()
// Desk leaves both dates blank and doesn't run until Generate.
const f = reactive({ from_date: '', to_date: '' })
const data = ref(null)
// Desk's drill-down dialog: the documents behind a clicked row/cell.
const dlg = reactive({ open: false, title: '', rows: [] })

async function generate() {
  // Desk falls back to today for a blank date instead of blocking.
  if (!f.from_date) f.from_date = todayStr()
  if (!f.to_date) f.to_date = todayStr()
  const r = await run(`${BASE}.get_data`, { from_date: f.from_date, to_date: f.to_date })
  if (r) data.value = r
}
function pickRange([from, to]) {
  f.from_date = from
  f.to_date = to
  generate()
}

function openDocs(title, docs) {
  dlg.title = title
  dlg.rows = docs || []
  dlg.open = true
}
async function showVisited() {
  const r = await run(`${BASE}.get_visited_patients`, { from_date: f.from_date, to_date: f.to_date })
  if (!r) return
  openDocs(
    'Patients Visited',
    r.map((v) => ({ doctype: v.doctype, name: v.docname, detail: `${v.detail || ''} - ${v.registration_category}${v.department_name ? ' - ' + v.department_name : ''}`, amount: null })),
  )
}
async function showUserBills(owner) {
  const r = await run(`${BASE}.get_user_bill_detail`, { owner, from_date: f.from_date, to_date: f.to_date })
  if (!r) return
  openDocs('User Wise Details', r.map((v) => ({ doctype: v.doctype, name: v.docname, detail: `${v.detail || ''}${v.payment_mode ? ' - ' + v.payment_mode : ''}`, amount: v.payable_amount })))
}
async function showUserCharity(owner, category) {
  const r = await run(`${BASE}.get_user_charity_detail`, { owner, category, from_date: f.from_date, to_date: f.to_date })
  if (!r) return
  openDocs(`User Wise Charity Details - ${category}`, r.map((v) => ({ doctype: v.doctype, name: v.docname, detail: `${v.detail || ''}${v.payment_mode ? ' - ' + v.payment_mode : ''}`, amount: v.amount })))
}

const numbered = (rows) => rows.map((r, i) => ({ ...r, sl: i + 1 }))
const hasDocs = (row) => !!(row.docs && row.docs.length)

// One Desk box: Sl No / Particulars / OP / IP with a Total row; the amount
// cells open the documents behind that row.
function opIpBox(key, heading, d, wide) {
  return {
    key,
    heading,
    wide,
    columns: [SL, PART, OP, IP],
    rows: numbered((d && d.rows) || []),
    total: (d && d.rows && d.rows.length) ? { label: 'Total', op_amount: d.total?.op_amount || 0, ip_amount: d.total?.ip_amount || 0 } : null,
    empty: 'No data for this period.',
    clickable: (col, row) => (col.key === 'op_amount' || col.key === 'ip_amount') && hasDocs(row),
    open: (row) => openDocs(heading, row.docs),
  }
}
// Tax boxes: the Particulars cell opens the documents.
function taxBox(key, heading, d) {
  const t = (d && d.total) || {}
  return {
    key,
    heading,
    wide: true,
    columns: [SL, PART, OP, IP, AMT, TAX],
    rows: numbered((d && d.rows) || []),
    total: d && d.rows && d.rows.length ? { label: 'Total', op_amount: t.op_amount || 0, ip_amount: t.ip_amount || 0, amount: t.amount || 0, tax_amount: t.tax_amount || 0 } : null,
    empty: 'No data for this period.',
    clickable: (col, row) => col.key === 'label' && hasDocs(row),
    open: (row) => openDocs(heading, row.docs),
  }
}
function charityDetailBoxes(details) {
  return (details || []).map((d) => {
    const heading = `Charity - Details - ${d.category}`
    return {
      key: `charity-${d.category}`,
      heading,
      wide: false,
      columns: [SL, PART, OP, IP],
      rows: numbered(d.rows || []),
      total: { label: 'Total', op_amount: d.total.op_amount, ip_amount: d.total.ip_amount },
      empty: 'No data for this period.',
      clickable: (col, row) => col.key === 'label' && hasDocs(row),
      open: (row) => openDocs(heading, row.docs),
    }
  })
}

// The server's last User Wise row is Collection Report's own Total row.
function userWiseBox(d) {
  const all = d.user_wise_details || []
  const rows = numbered(all.slice(0, -1))
  const last = all.length ? all[all.length - 1] : null
  return {
    key: 'user-wise',
    heading: 'User Wise Details',
    wide: true,
    columns: [SL, { key: 'user_name', label: 'User Name' }, ...USER_COLS.map(([key, label]) => ({ key, label, type: 'currency' }))],
    rows,
    total: last ? Object.fromEntries([['user_name', last.user_name || ''], ...USER_COLS.map(([k]) => [k, last[k] || 0])]) : null,
    empty: 'No collections found for this period.',
    clickable: (col, row) => col.type === 'currency' && !!row.owner,
    open: (row) => showUserBills(row.owner),
  }
}
function userCharityBox(d) {
  const uc = d.user_wise_charity || { categories: [], rows: [] }
  const cats = uc.categories || []
  const all = uc.rows || []
  const ok = all.length && cats.length
  const last = ok ? all[all.length - 1] : null
  return {
    key: 'user-charity',
    heading: 'User Wise Charity Details',
    wide: true,
    columns: [SL, { key: 'user_name', label: 'User Name' }, ...cats.map((c) => ({ key: c, label: c, type: 'currency' }))],
    rows: ok ? numbered(all.slice(0, -1)).map((r) => ({ ...r, ...Object.fromEntries(cats.map((c) => [c, r[c] || 0])) })) : [],
    total: last ? Object.fromEntries([['user_name', last.user_name || ''], ...cats.map((c) => [c, last[c] || 0])]) : null,
    empty: 'No data for this period.',
    clickable: (col, row) => col.type === 'currency' && !!row.owner && !!row[col.key],
    open: (row, col) => showUserCharity(row.owner, col.key),
  }
}

// Same order as Desk's render(); Charity - Details boxes always last.
const boxes = computed(() => {
  const d = data.value
  if (!d) return []
  const list = [
    userWiseBox(d),
    opIpBox('advances', 'Advances', d.advances, false),
    opIpBox('ip-adjusted', 'IP Adjusted', d.ip_adjusted, false),
    opIpBox('credit-bills', 'Credit Bills', d.credit_bills, true),
    userCharityBox(d),
    opIpBox('sr-cash', 'Sales Return - Cash', d.sales_return_cash, false),
    opIpBox('sr-credit', 'Sales Return - Credit', d.sales_return_credit, false),
    opIpBox('charity-summary', 'Charity - Summary', d.charity && d.charity.summary, false),
    opIpBox('item-type', 'Item Type Collection', d.item_type_collection, false),
    taxBox('tax-bills', 'Tax - Details - Bills', d.tax_bills),
    taxBox('tax-returns', 'Tax - Details - Returns', d.tax_returns),
    opIpBox('local-group', 'Local Group Wise Details', d.local_group_wise, true),
    ...charityDetailBoxes(d.charity && d.charity.details),
  ]
  // balance_grid(): within each run of paired boxes, an odd last one fills the row.
  let run = []
  const flush = () => {
    if (run.length % 2 === 1) run[run.length - 1].full = true
    run = []
  }
  for (const b of list) {
    b.full = b.wide
    if (b.wide) flush()
    else run.push(b)
  }
  flush()
  return list
})

function cellShow(col, v) {
  if (col.type === 'currency') return money(v)
  return v ?? ''
}

// ---- export: same sections and order as Desk's get_export_data ----
function opIpSection(heading, d) {
  const rows = (d && d.rows) || []
  if (!rows.length) return null
  const t = d.total || { op_amount: 0, ip_amount: 0 }
  const out = rows.map((r, i) => [i + 1, r.label || '', money(r.op_amount), money(r.ip_amount)])
  out.push(['', 'Total', money(t.op_amount), money(t.ip_amount)])
  return { heading, columns: ['Sl No', 'Particulars', 'OP Amount', 'IP Amount'], rows: out }
}
function taxSection(heading, d) {
  const rows = (d && d.rows) || []
  if (!rows.length) return null
  const t = d.total || {}
  const out = rows.map((r, i) => [i + 1, r.label || '', money(r.op_amount), money(r.ip_amount), money(r.amount), money(r.tax_amount)])
  out.push(['', 'Total', money(t.op_amount), money(t.ip_amount), money(t.amount), money(t.tax_amount)])
  return { heading, columns: ['Sl No', 'Particulars', 'OP Amount', 'IP Amount', 'Amount', 'Tax Amount'], rows: out }
}
function userWiseSection(d) {
  const rows = d.user_wise_details || []
  if (!rows.length) return null
  return {
    heading: 'User Wise Details',
    columns: ['Sl No', 'User Name', ...USER_COLS.map(([, l]) => l)],
    rows: rows.map((r, i) => [i === rows.length - 1 ? '' : i + 1, r.user_name || '', ...USER_COLS.map(([k]) => money(r[k]))]),
  }
}
function userCharitySection(d) {
  const uc = d.user_wise_charity || { categories: [], rows: [] }
  const rows = uc.rows || []
  const cats = uc.categories || []
  if (!rows.length || !cats.length) return null
  return {
    heading: 'User Wise Charity Details',
    columns: ['Sl No', 'User Name', ...cats],
    rows: rows.map((r, i) => [i === rows.length - 1 ? '' : i + 1, r.user_name || '', ...cats.map((c) => money(r[c] || 0))]),
  }
}
function exportData() {
  const d = data.value
  if (!d) return null
  const details = (d.charity && d.charity.details) || []
  const sections = [
    userWiseSection(d),
    userCharitySection(d),
    opIpSection('Advances', d.advances),
    opIpSection('Item Type Collection', d.item_type_collection),
    opIpSection('Local Group Wise Details', d.local_group_wise),
    opIpSection('Sales Return - Cash', d.sales_return_cash),
    opIpSection('Sales Return - Credit', d.sales_return_credit),
    opIpSection('Charity - Summary', d.charity && d.charity.summary),
    ...details.map((c) => {
      const rows = c.rows.map((r, i) => [i + 1, r.label || '', money(r.op_amount), money(r.ip_amount)])
      rows.push(['', 'Total', money(c.total.op_amount), money(c.total.ip_amount)])
      return { heading: `Charity - Details - ${c.category}`, columns: ['Sl No', 'Particulars', 'OP Amount', 'IP Amount'], rows }
    }),
    opIpSection('IP Adjusted', d.ip_adjusted),
    opIpSection('Credit Bills', d.credit_bills),
    taxSection('Tax - Details - Bills', d.tax_bills),
    taxSection('Tax - Details - Returns', d.tax_returns),
  ].filter(Boolean)
  if (!sections.length) return null
  return {
    title: 'Daily Collection Report',
    subtitle: `From Date: ${ddmmyy(f.from_date)}   |   To Date: ${ddmmyy(f.to_date)}`,
    sections,
    filename: 'Daily_Collection_Report',
  }
}
</script>
