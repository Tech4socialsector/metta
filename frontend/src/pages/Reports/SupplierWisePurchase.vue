<template>
  <ReportShell title="Supplier Wise Purchase" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3">
        <TextField id="swp-from" v-model="f.from_date" label="From Date" type="date" />
        <TextField id="swp-to" v-model="f.to_date" label="To Date" type="date" />
        <LinkField id="swp-supplier" v-model="f.supplier" label="Supplier" doctype="Supplier" />
        <SelectField id="swp-status" v-model="f.status" label="Status" :options="STATUSES" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['today', 'week', 'month']" @pick="pickRange" />
    </template>

    <template v-if="rows">
      <SummaryCards :cards="cards" />

      <section class="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <p v-if="!rows.length" class="px-4 py-6 text-center text-sm text-gray-600">No Purchase Orders found for this range.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-600">
              <tr>
                <th v-for="h in HEADER" :key="h" class="whitespace-nowrap px-3 py-2 font-semibold" :class="NUM_HEADS.has(h) && 'text-right'">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in groups" :key="g.supplier">
                <!-- Supplier row: expands to one row per PO. -->
                <tr class="border-b border-gray-100 bg-gray-50/60 font-semibold">
                  <td class="w-8 px-3 py-2"><Toggle :open="open.has(g.key)" @click="toggle(g.key, [...g.pos.values()].map((p) => p.key))" /></td>
                  <td colspan="4" class="px-3 py-2">
                    {{ g.supplier }} <Pill :label="`${g.pos.size} ${g.pos.size === 1 ? 'PO' : 'POs'}`" color="gray" />
                  </td>
                  <NumCells :t="g" />
                  <td class="px-3 py-2"><Pill :label="billingStatus(g.ordered, g.billed)" :color="BILLING_INDICATOR[billingStatus(g.ordered, g.billed)]" /></td>
                </tr>
                <template v-if="open.has(g.key)">
                  <template v-for="po in g.pos.values()" :key="po.key">
                    <!-- PO row: expands to its item lines. -->
                    <tr class="border-b border-gray-100">
                      <td class="px-3 py-2"><Toggle :open="open.has(po.key)" @click="toggle(po.key)" /></td>
                      <td class="whitespace-nowrap px-3 py-2"><DocLink doctype="Purchase Order" :name="po.purchase_order" /></td>
                      <td class="whitespace-nowrap px-3 py-2">{{ ddmmyy(po.order_date) }}</td>
                      <td colspan="2" class="px-3 py-2"><Pill :label="`${po.items.length} ${po.items.length === 1 ? 'item' : 'items'}`" color="gray" /></td>
                      <NumCells :t="po" />
                      <td class="px-3 py-2"><Pill :label="billingStatus(po.ordered, po.billed)" :color="BILLING_INDICATOR[billingStatus(po.ordered, po.billed)]" /></td>
                    </tr>
                    <template v-if="open.has(po.key)">
                      <tr v-for="(r, i) in po.items" :key="i" class="border-b border-gray-100 text-gray-700">
                        <td></td>
                        <td></td>
                        <td></td>
                        <td class="whitespace-nowrap px-3 py-2">{{ r.item }}</td>
                        <td class="px-3 py-2">{{ r.item_name }}</td>
                        <td :class="NUM">{{ flt(r.qty_ordered) }}</td>
                        <td :class="NUM">{{ flt(r.qty_received) }}</td>
                        <td :class="NUM">{{ pct1(r.qty_received, r.qty_ordered) }}</td>
                        <td :class="NUM">{{ money(r.rate) }}</td>
                        <td :class="NUM">{{ money(r.ordered_amount) }}</td>
                        <td :class="NUM">{{ money(r.billed_amount) }}</td>
                        <td class="px-3 py-2"><Pill :label="billingStatus(r.ordered_amount, r.billed_amount)" :color="BILLING_INDICATOR[billingStatus(r.ordered_amount, r.billed_amount)]" /></td>
                      </tr>
                    </template>
                  </template>
                </template>
              </template>
              <tr class="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td colspan="5" class="px-3 py-2">Total</td>
                <NumCells :t="grand" />
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
import { flt, money, ddmmyy, pct1, filterLine } from '@/data/reports/format'

// Desk page: metta/purchase_order/page/supplier_wise_purchase
const METHOD = 'metta.purchase_order.page.supplier_wise_purchase.supplier_wise_purchase.get_data'
const meta = reportByRoute('ReportsSupplierWisePurchase')
const STATUSES = ['', 'Pending Approval', 'Approved', 'Rejected', 'Sent to Dealer', 'Partially Received', 'Received', 'Closed', 'Cancelled']
const BILLING_INDICATOR = { 'Not Billed': 'red', 'Partially Billed': 'orange', 'Fully Billed': 'green' }
const HEADER = ['', 'Purchase Order', 'Order Date', 'Item', 'Item Name', 'Qty Ordered', 'Qty Received', '% Received', 'Rate', 'Amount', 'Billed Amount', 'Status']
const NUM_HEADS = new Set(['Qty Ordered', 'Qty Received', '% Received', 'Rate', 'Amount', 'Billed Amount'])
const NUM = 'whitespace-nowrap px-3 py-2 text-right tabular-nums'

// The same Not / Partially / Fully Billed rule Desk applies at every level.
function billingStatus(ordered, billed) {
  if (flt(billed) <= 0) return 'Not Billed'
  if (flt(billed) >= flt(ordered)) return 'Fully Billed'
  return 'Partially Billed'
}

// Qty ordered / received / % / (rate blank) / amount / billed - the shared
// numeric cells of supplier, PO and total rows.
const NumCells = (props) => [
  h('td', { class: NUM }, props.t.qty_ordered),
  h('td', { class: NUM }, props.t.qty_received),
  h('td', { class: NUM }, pct1(props.t.qty_received, props.t.qty_ordered)),
  h('td'),
  h('td', { class: NUM }, money(props.t.ordered)),
  h('td', { class: NUM }, money(props.t.billed)),
]
NumCells.props = ['t']
const Toggle = (props, { emit }) =>
  h('button', { type: 'button', class: 'text-xs text-gray-600 hover:text-gray-900', 'aria-expanded': props.open, onClick: () => emit('click') }, props.open ? '▼' : '▶')
Toggle.props = ['open']
Toggle.emits = ['click']

const { loading, error, run } = useRunner()
const f = reactive({ from_date: '', to_date: '', supplier: '', status: '' })
const rows = ref(null)
const open = ref(new Set())

async function generate() {
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
// Desk loads every supplier's POs straight away; filters only narrow it.
generate()

// Collapsing a supplier also collapses its POs, as in Desk.
function toggle(key, children = []) {
  const s = new Set(open.value)
  if (s.has(key)) {
    s.delete(key)
    children.forEach((c) => s.delete(c))
  } else s.add(key)
  open.value = s
}

const blank = () => ({ qty_ordered: 0, qty_received: 0, ordered: 0, billed: 0 })
function add(t, r) {
  t.qty_ordered += flt(r.qty_ordered)
  t.qty_received += flt(r.qty_received)
  t.ordered += flt(r.ordered_amount)
  t.billed += flt(r.billed_amount)
}

// Supplier -> Purchase Order -> item lines, in the server's order.
const groups = computed(() => {
  const suppliers = new Map()
  for (const r of rows.value || []) {
    if (!suppliers.has(r.supplier)) suppliers.set(r.supplier, { key: `s:${r.supplier}`, supplier: r.supplier, pos: new Map(), ...blank() })
    const s = suppliers.get(r.supplier)
    add(s, r)
    if (!s.pos.has(r.purchase_order)) s.pos.set(r.purchase_order, { key: `p:${r.purchase_order}`, purchase_order: r.purchase_order, order_date: r.order_date, items: [], ...blank() })
    const po = s.pos.get(r.purchase_order)
    add(po, r)
    po.items.push(r)
  }
  return [...suppliers.values()]
})
const grand = computed(() => {
  const t = blank()
  ;(rows.value || []).forEach((r) => add(t, r))
  return t
})

const cards = computed(() => {
  const pending = grand.value.ordered - grand.value.billed
  return [
    { label: 'Total Suppliers', value: groups.value.length },
    { label: 'Total Purchase Orders', value: groups.value.reduce((s, g) => s + g.pos.size, 0) },
    { label: 'Total Ordered Amount', value: money(grand.value.ordered) },
    { label: 'Total Billed Amount', value: money(grand.value.billed) },
    { label: 'Total Pending Amount', value: money(pending), tone: pending > 0 ? 'warn' : undefined },
  ]
})

// Desk exports one flat row per item line (no toggles in a file).
function exportData() {
  if (!rows.value) return null
  const t = grand.value
  const data = rows.value.map((r) => [
    r.supplier || '',
    r.purchase_order || '',
    ddmmyy(r.order_date),
    r.item || '',
    r.item_name || '',
    String(flt(r.qty_ordered)),
    String(flt(r.qty_received)),
    pct1(r.qty_received, r.qty_ordered),
    money(r.rate),
    money(r.ordered_amount),
    money(r.billed_amount),
    billingStatus(r.ordered_amount, r.billed_amount),
  ])
  data.push(['Total', '', '', '', '', String(t.qty_ordered), String(t.qty_received), pct1(t.qty_received, t.qty_ordered), '', money(t.ordered), money(t.billed), ''])
  const sub = filterLine([
    ['From Date', ddmmyy(f.from_date)],
    ['To Date', ddmmyy(f.to_date)],
    ['Supplier', f.supplier],
    ['Status', f.status],
  ])
  return {
    title: 'Supplier Wise Purchase',
    subtitle: sub || 'All Purchase Orders',
    columns: ['Supplier', 'Purchase Order', 'Order Date', 'Item', 'Item Name', 'Qty Ordered', 'Qty Received', '% Received', 'Rate', 'Amount', 'Billed Amount', 'Status'],
    rows: data,
    filename: 'Supplier_Wise_Purchase',
  }
}
</script>
