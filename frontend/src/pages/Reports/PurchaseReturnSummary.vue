<template>
  <ReportShell title="Purchase Return Summary" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3">
        <TextField id="prs-from" v-model="f.from_date" label="From Date" type="date" reqd />
        <TextField id="prs-to" v-model="f.to_date" label="To Date" type="date" reqd />
        <LinkField id="prs-supplier" v-model="f.supplier" label="Supplier" doctype="Supplier" />
        <LinkField id="prs-wh" v-model="f.warehouse" label="Warehouse (Outlet)" doctype="Warehouse" />
        <SelectField id="prs-status" v-model="f.status" label="Status" :options="STATUSES" />
        <SelectField id="prs-reason" v-model="f.return_reason" label="Return Reason" :options="REASONS" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['today', 'week', 'month']" @pick="pickRange" />
    </template>

    <p v-if="!rows" class="text-sm text-gray-600">Set a From Date and To Date, then click Generate.</p>
    <template v-else>
      <SummaryCards :cards="cards" />

      <section v-if="reasons.length" class="flex flex-col gap-2">
        <h2 class="text-xs font-bold uppercase tracking-wide text-gray-700">Return Reason Breakdown</h2>
        <div class="flex flex-wrap gap-2">
          <span v-for="r in reasons" :key="r.reason" class="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm">
            <strong>{{ r.reason }}</strong>: {{ r.count }} {{ r.count === 1 ? 'line' : 'lines' }}, {{ money(r.amount) }}
          </span>
        </div>
      </section>

      <section class="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <p v-if="!rows.length" class="px-4 py-6 text-center text-sm text-gray-600">No Purchase Returns found for this range.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-600">
              <tr>
                <th v-for="hd in HEADER" :key="hd" class="whitespace-nowrap px-3 py-2 font-semibold" :class="(hd === 'Qty Returned' || hd === 'Amount') && 'text-right'">{{ hd }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in groups" :key="g.key">
                <!-- Supplier row: expands to one row per return. -->
                <tr class="border-b border-gray-100 bg-gray-50/60 font-semibold">
                  <td class="w-8 px-3 py-2"><Toggle :open="open.has(g.key)" @click="toggle(g.key, g.returns.map((r) => r.key))" /></td>
                  <td colspan="5" class="px-3 py-2">
                    {{ g.supplier }} <Pill :label="`${g.returns.length} ${g.returns.length === 1 ? 'return' : 'returns'}`" color="gray" />
                  </td>
                  <td :class="NUM">{{ g.qty }}</td>
                  <td></td>
                  <td :class="NUM">{{ money(g.credit) }}</td>
                  <td></td>
                </tr>
                <template v-if="open.has(g.key)">
                  <template v-for="ret in g.returns" :key="ret.key">
                    <!-- Return row: expands to its item lines; shows the PO it came from and the replacement PO. -->
                    <tr class="border-b border-gray-100 font-medium">
                      <td class="px-3 py-2"><Toggle :open="open.has(ret.key)" @click="toggle(ret.key)" /></td>
                      <td class="whitespace-nowrap px-3 py-2">{{ ddmmyy(ret.return_date_time) }}</td>
                      <td class="whitespace-nowrap px-3 py-2"><DocLink doctype="Purchase Return" :name="ret.purchase_return" /></td>
                      <td colspan="3" class="px-3 py-2">
                        <Pill :label="`${ret.items.length} ${ret.items.length === 1 ? 'item' : 'items'}`" color="gray" />
                        <div v-if="ret.original_purchase_order || ret.replacement_purchase_order" class="mt-0.5 text-xs font-normal text-gray-600">
                          <span v-if="ret.original_purchase_order">From PO: <DocLink doctype="Purchase Order" :name="ret.original_purchase_order" /></span>
                          <span v-if="ret.original_purchase_order && ret.replacement_purchase_order"> | </span>
                          <span v-if="ret.replacement_purchase_order">Replacement PO: <DocLink doctype="Purchase Order" :name="ret.replacement_purchase_order" /></span>
                        </div>
                      </td>
                      <td :class="NUM">{{ ret.qty }}</td>
                      <td></td>
                      <td :class="NUM">{{ money(ret.total_credit_amount) }}</td>
                      <td class="px-3 py-2"><Pill :label="ret.status" :color="STATUS_INDICATOR[ret.status] || 'gray'" /></td>
                    </tr>
                    <template v-if="open.has(ret.key)">
                      <tr v-for="(r, i) in ret.items" :key="i" class="border-b border-gray-100 text-gray-700">
                        <td></td>
                        <td></td>
                        <td></td>
                        <td class="whitespace-nowrap px-3 py-2">{{ r.item }}</td>
                        <td class="px-3 py-2">{{ r.item_name }}</td>
                        <td class="whitespace-nowrap px-3 py-2">{{ r.batch }}</td>
                        <td :class="NUM">{{ flt(r.qty_returned) }}</td>
                        <td class="px-3 py-2">{{ r.return_reason }}</td>
                        <td :class="NUM">{{ money(r.amount) }}</td>
                        <td></td>
                      </tr>
                    </template>
                  </template>
                </template>
              </template>
              <tr class="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td colspan="6" class="px-3 py-2">Total</td>
                <td :class="NUM">{{ totalQty }}</td>
                <td></td>
                <td :class="NUM">{{ money(totalCredit) }}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </ReportShell>
</template>

<script setup>
import { computed, h, reactive, ref } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
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
import { flt, money, ddmmyy, filterLine } from '@/data/reports/format'

// Desk page: metta/purchase_order/page/purchase_return_summary
const METHOD = 'metta.purchase_order.page.purchase_return_summary.purchase_return_summary.get_data'
const meta = reportByRoute('ReportsPurchaseReturnSummary')
const STATUSES = ['', 'Submitted', 'Credit Received', 'Replacement Pending', 'Replacement Received', 'Cancelled']
const REASONS = ['', 'Damaged', 'Expired', 'Short Expiry', 'Excess', 'Recall']
const STATUS_INDICATOR = { Submitted: 'blue', 'Credit Received': 'green', 'Replacement Pending': 'orange', 'Replacement Received': 'green', Cancelled: 'red' }
// Credit on these returns hasn't come back yet - the Pending Credit card.
const OPEN_STATUSES = ['Submitted', 'Replacement Pending']
const HEADER = ['', 'Return Date', 'Purchase Return', 'Item', 'Item Name', 'Batch', 'Qty Returned', 'Reason', 'Amount', 'Status']
const NUM = 'whitespace-nowrap px-3 py-2 text-right tabular-nums'

const Toggle = (props, { emit }) =>
  h('button', { type: 'button', class: 'text-xs text-gray-600 hover:text-gray-900', 'aria-expanded': props.open, onClick: () => emit('click') }, props.open ? '▼' : '▶')
Toggle.props = ['open']
Toggle.emits = ['click']

const { loading, error, run, warn } = useRunner()
const f = reactive({ from_date: '', to_date: '', supplier: '', warehouse: '', status: '', return_reason: '' })
const rows = ref(null)
const open = ref(new Set())

async function generate() {
  if (!f.from_date || !f.to_date) return warn('Please set both From Date and To Date.')
  const data = await run(METHOD, { ...f })
  if (data) {
    rows.value = data
    open.value = new Set()
  }
}
function pickRange([from, to]) {
  f.from_date = from
  f.to_date = to
  generate()
}

function toggle(key, children = []) {
  const s = new Set(open.value)
  if (s.has(key)) {
    s.delete(key)
    children.forEach((c) => s.delete(c))
  } else s.add(key)
  open.value = s
}

// Supplier -> Purchase Return -> item lines. A return's credit amount is a
// header figure, counted once per return (not per item line).
const groups = computed(() => {
  const suppliers = new Map()
  for (const r of rows.value || []) {
    if (!suppliers.has(r.supplier)) suppliers.set(r.supplier, { key: `s:${r.supplier}`, supplier: r.supplier, map: new Map() })
    const s = suppliers.get(r.supplier)
    if (!s.map.has(r.purchase_return)) {
      s.map.set(r.purchase_return, { ...r, key: `r:${r.purchase_return}`, total_credit_amount: flt(r.total_credit_amount), qty: 0, items: [] })
    }
    const ret = s.map.get(r.purchase_return)
    ret.qty += flt(r.qty_returned)
    ret.items.push(r)
  }
  return [...suppliers.values()].map((s) => {
    const returns = [...s.map.values()]
    return { ...s, returns, qty: returns.reduce((a, x) => a + x.qty, 0), credit: returns.reduce((a, x) => a + x.total_credit_amount, 0) }
  })
})
const allReturns = computed(() => groups.value.flatMap((g) => g.returns))
const totalQty = computed(() => (rows.value || []).reduce((s, r) => s + flt(r.qty_returned), 0))
const totalCredit = computed(() => allReturns.value.reduce((s, r) => s + r.total_credit_amount, 0))

const cards = computed(() => {
  const pending = allReturns.value.filter((r) => OPEN_STATUSES.includes(r.status)).reduce((s, r) => s + r.total_credit_amount, 0)
  return [
    { label: 'Total Returns', value: allReturns.value.length },
    { label: 'Total Qty Returned', value: totalQty.value },
    { label: 'Total Credit Amount', value: money(totalCredit.value) },
    { label: 'Pending Credit', value: money(pending), tone: pending > 0 ? 'warn' : undefined },
  ]
})

// Lines and amount per reason, largest amount first.
const reasons = computed(() => {
  const by = new Map()
  for (const r of rows.value || []) {
    const reason = r.return_reason || 'Not Specified'
    if (!by.has(reason)) by.set(reason, { reason, count: 0, amount: 0 })
    const x = by.get(reason)
    x.count += 1
    x.amount += flt(r.amount)
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount)
})

function exportData() {
  if (!rows.value) return null
  const data = rows.value.map((r) => [
    r.supplier || '',
    r.purchase_return || '',
    ddmmyy(r.return_date_time),
    r.from_warehouse || '',
    r.original_purchase_order || '',
    r.replacement_purchase_order || '',
    r.item || '',
    r.item_name || '',
    r.batch || '',
    String(flt(r.qty_returned)),
    r.return_reason || '',
    money(r.amount),
    r.status || '',
  ])
  data.push(['Total', '', '', '', '', '', '', '', '', String(totalQty.value), '', money(totalCredit.value), ''])
  return {
    title: 'Purchase Return Summary',
    subtitle: filterLine([
      ['From Date', ddmmyy(f.from_date)],
      ['To Date', ddmmyy(f.to_date)],
      ['Supplier', f.supplier],
      ['Warehouse', f.warehouse],
      ['Status', f.status],
      ['Reason', f.return_reason],
    ]),
    columns: ['Supplier', 'Purchase Return', 'Return Date', 'From Warehouse', 'From PO', 'Replacement PO', 'Item', 'Item Name', 'Batch', 'Qty Returned', 'Reason', 'Amount', 'Status'],
    rows: data,
    filename: 'Purchase_Return_Summary',
  }
}
</script>
