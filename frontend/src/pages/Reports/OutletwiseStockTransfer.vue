<template>
  <ReportShell title="Outletwise Stock Transfer Summary" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions><ExportButtons :get-data="exportData" /></template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="owsts-from" v-model="f.from_date" label="From Date" type="date" reqd />
        <TextField id="owsts-to" v-model="f.to_date" label="To Date" type="date" reqd />
        <LinkField id="owsts-from-wh" v-model="f.from_warehouse" label="From Warehouse" doctype="Warehouse" />
        <LinkField id="owsts-to-wh" v-model="f.to_warehouse" label="To Warehouse" doctype="Warehouse" />
        <SelectField id="owsts-status" v-model="f.status" label="Status" :options="STATUSES" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
      <QuickRanges :ranges="['today', 'week', 'month']" @pick="pickRange" />
    </template>

    <template v-if="rows">
      <SummaryCards :cards="cards" />

      <!-- One summary row per Stock Transfer with its items folded underneath,
      as on the Desk page; ReportTable has no grouping, so the same table
      style is drawn here. -->
      <section class="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <p v-if="!rows.length" class="px-4 py-6 text-center text-sm text-gray-600">No Stock Transfers found for this range.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-accent-100 bg-accent-50 text-left text-xs uppercase text-accent-900">
              <tr>
                <th class="w-8 px-3 py-2"></th>
                <th class="whitespace-nowrap px-3 py-2 font-bold">Dispatch Date</th>
                <th class="whitespace-nowrap px-3 py-2 font-bold">Stock Transfer</th>
                <th class="whitespace-nowrap px-3 py-2 font-bold">From Warehouse</th>
                <th class="whitespace-nowrap px-3 py-2 font-bold">To Warehouse</th>
                <th class="whitespace-nowrap px-3 py-2 text-center font-bold">Items</th>
                <th class="whitespace-nowrap px-3 py-2 text-right font-bold">Qty Dispatched</th>
                <th class="whitespace-nowrap px-3 py-2 text-right font-bold">Qty Confirmed</th>
                <th class="whitespace-nowrap px-3 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in groups" :key="g.stock_transfer">
                <tr class="border-b border-gray-100" :class="g.has_discrepancy && 'bg-red-50'">
                  <td class="px-3 py-2 text-center">
                    <button
                      type="button"
                      class="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100"
                      :aria-expanded="!!open[g.stock_transfer]"
                      :aria-label="`Items of ${g.stock_transfer}`"
                      @click="open[g.stock_transfer] = !open[g.stock_transfer]"
                    >
                      {{ open[g.stock_transfer] ? '▼' : '▶' }}
                    </button>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2">{{ ddmmyy(g.dispatch_date_time) }}</td>
                  <td class="whitespace-nowrap px-3 py-2"><DocLink doctype="Stock Transfer" :name="g.stock_transfer" /></td>
                  <td class="whitespace-nowrap px-3 py-2">{{ g.from_warehouse || '' }}</td>
                  <td class="whitespace-nowrap px-3 py-2">{{ g.to_warehouse || '' }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-center"><Pill :label="`${g.item_count} ${g.item_count === 1 ? 'item' : 'items'}`" color="gray" /></td>
                  <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">{{ g.total_dispatched }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">{{ g.total_confirmed }}</td>
                  <td class="whitespace-nowrap px-3 py-2"><Pill :label="g.status || ''" :color="INDICATOR[g.status] || 'gray'" /></td>
                </tr>
                <template v-if="open[g.stock_transfer]">
                  <tr class="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase text-gray-600">
                    <td></td>
                    <td></td>
                    <td class="px-3 py-1.5 pl-8">Item Code</td>
                    <td class="px-3 py-1.5">Item Name</td>
                    <td class="px-3 py-1.5">Batch</td>
                    <td></td>
                    <td class="px-3 py-1.5 text-right">Qty Dispatched</td>
                    <td class="px-3 py-1.5 text-right">Qty Confirmed</td>
                    <td></td>
                  </tr>
                  <tr v-for="(it, i) in g.items" :key="i" class="border-b border-gray-100 bg-gray-50/50 text-xs">
                    <td></td>
                    <td></td>
                    <td class="whitespace-nowrap px-3 py-1.5 pl-8 font-semibold">{{ it.item || '' }}</td>
                    <td class="whitespace-nowrap px-3 py-1.5">{{ it.item_name || '' }}</td>
                    <td class="whitespace-nowrap px-3 py-1.5">{{ it.batch || '' }}</td>
                    <td></td>
                    <td class="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{{ flt(it.qty_dispatched) }}</td>
                    <td class="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{{ flt(it.qty_confirmed) }}</td>
                    <td></td>
                  </tr>
                </template>
              </template>
              <tr class="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td colspan="6" class="px-3 py-2">Total</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ totals.dispatched }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ totals.confirmed }}</td>
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
import { computed, reactive, ref } from 'vue'
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
import { flt, ddmmyy, filterLine } from '@/data/reports/format'

// Desk page: metta/stock/page/outletwise_stock_tra
const METHOD = 'metta.stock.page.outletwise_stock_tra.outletwise_stock_tra.get_data'
const meta = reportByRoute('ReportsOutletwiseStockTransfer')
const STATUSES = ['', 'Draft', 'Dispatched', 'Confirmed', 'Cancelled']
const INDICATOR = { Draft: 'gray', Dispatched: 'orange', Confirmed: 'green', Cancelled: 'red' }

const { loading, error, run, warn } = useRunner()
// Dates start blank on purpose, as in Desk - nothing runs until asked.
const f = reactive({ from_date: '', to_date: '', from_warehouse: '', to_warehouse: '', status: '' })
const rows = ref(null)
const open = reactive({})

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

const totals = computed(() => {
  const r = rows.value || []
  return { dispatched: r.reduce((s, x) => s + flt(x.qty_dispatched), 0), confirmed: r.reduce((s, x) => s + flt(x.qty_confirmed), 0) }
})

const cards = computed(() => {
  const r = rows.value || []
  const discrepancies = new Set(r.filter((x) => x.has_discrepancy).map((x) => x.stock_transfer)).size
  return [
    { label: 'Total Transfers', value: new Set(r.map((x) => x.stock_transfer)).size },
    { label: 'Qty Dispatched', value: totals.value.dispatched },
    { label: 'Qty Confirmed', value: totals.value.confirmed },
    { label: 'Discrepancies', value: discrepancies, tone: discrepancies ? 'bad' : undefined },
  ]
})

// Rows arrive one per item line, in dispatch order; folded per transfer.
const groups = computed(() => {
  const map = new Map()
  for (const row of rows.value || []) {
    if (!map.has(row.stock_transfer)) {
      map.set(row.stock_transfer, { ...row, has_discrepancy: false, item_count: 0, total_dispatched: 0, total_confirmed: 0, items: [] })
    }
    const g = map.get(row.stock_transfer)
    g.has_discrepancy = g.has_discrepancy || !!row.has_discrepancy
    g.item_count += 1
    g.total_dispatched += flt(row.qty_dispatched)
    g.total_confirmed += flt(row.qty_confirmed)
    g.items.push(row)
  }
  return [...map.values()]
})

// Export is flat, one line per item, plus a Total line - as Desk's.
function exportData() {
  if (!rows.value) return null
  const data = rows.value.map((r) => [
    ddmmyy(r.dispatch_date_time),
    r.stock_transfer || '',
    r.from_warehouse || '',
    r.to_warehouse || '',
    r.item || '',
    r.item_name || '',
    r.batch || '',
    flt(r.qty_dispatched),
    flt(r.qty_confirmed),
    r.status || '',
  ])
  data.push(['Total', '', '', '', '', '', '', totals.value.dispatched, totals.value.confirmed, ''])
  return {
    title: 'Outletwise Stock Transfer Summary',
    subtitle: filterLine([
      ['From Date', ddmmyy(f.from_date)],
      ['To Date', ddmmyy(f.to_date)],
      ['From Warehouse', f.from_warehouse],
      ['To Warehouse', f.to_warehouse],
      ['Status', f.status],
    ]),
    columns: ['Dispatch Date', 'Stock Transfer', 'From Warehouse', 'To Warehouse', 'Item Code', 'Item Name', 'Batch', 'Qty Dispatched', 'Qty Confirmed', 'Status'],
    rows: data,
    filename: 'Outletwise_Stock_Transfer_Summary',
  }
}
</script>
