<template>
  <!-- Sales Bill Item rows (Pharmacy Items or Service Items). Batch, GST and
  its split only show for Medicine/Consumable rows, as their depends_on says. -->
  <div class="overflow-x-auto rounded-lg border border-gray-200">
    <table class="w-full text-sm">
      <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
        <tr>
          <th class="px-3 py-2">Item</th>
          <th v-if="stock" class="px-3 py-2">Batch</th>
          <th class="w-20 px-3 py-2 text-right">Qty</th>
          <th class="w-28 px-3 py-2 text-right">Rate (MRP)</th>
          <th v-if="stock" class="w-16 px-3 py-2 text-right">GST %</th>
          <th class="w-28 px-3 py-2 text-right">Net Amount</th>
          <th class="w-16 px-2 py-2"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td :colspan="stock ? 7 : 5" class="px-3 py-5 text-center text-gray-500">No items yet.</td>
        </tr>
        <template v-for="(row, i) in rows" :key="keyOf(row)">
          <tr class="border-t border-gray-100 align-top">
            <td class="px-3 py-2">
              <div class="font-medium text-gray-900">{{ row.item_name || row.item }}</div>
              <div class="text-xs text-gray-500">{{ row.item }}</div>
            </td>
            <td v-if="stock" class="min-w-[150px] px-3 py-2">
              <QueryLink
                v-if="isStockRow(row)"
                :id="`${idPrefix}-batch-${i}`"
                compact
                doctype="Batch"
                :aria-label="`Batch for ${row.item_name || row.item}`"
                :model-value="row.batch_no || ''"
                :filters="batchFilters(row)"
                :readonly="readonly"
                :error="!readonly && !row.batch_no"
                @update:model-value="(v) => setField(row, 'batch_no', v)"
              />
            </td>
            <td class="px-3 py-2 text-right">
              <input v-if="!readonly" type="number" min="1" step="1" :value="row.qty" :aria-label="`Qty for ${row.item_name || row.item}`" class="ctl w-20 text-right tabular-nums" @change="setField(row, 'qty', toInt($event.target.value))" />
              <span v-else class="tabular-nums">{{ row.qty }}</span>
            </td>
            <td class="px-3 py-2 text-right">
              <input v-if="!readonly" type="number" min="0" step="any" :value="row.rate" :aria-label="`Rate for ${row.item_name || row.item}`" class="ctl w-28 text-right tabular-nums" @change="setField(row, 'rate', toNum($event.target.value))" />
              <span v-else class="tabular-nums">{{ money(row.rate) }}</span>
            </td>
            <td v-if="stock" class="px-3 py-2 text-right tabular-nums text-gray-700">{{ isStockRow(row) ? `${flt(row.gst_percent)}%` : '' }}</td>
            <td class="px-3 py-2 text-right font-medium tabular-nums">{{ money(row.net_amount) }}</td>
            <td class="whitespace-nowrap px-2 py-2 text-right">
              <button type="button" class="rounded p-1 text-gray-500 hover:bg-gray-100" :aria-label="`Details of ${row.item_name || row.item}`" :aria-expanded="!!open[keyOf(row)]" @click="open[keyOf(row)] = !open[keyOf(row)]">
                <LucideIcon :name="open[keyOf(row)] ? 'chevron-up' : 'chevron-down'" class="h-4 w-4" />
              </button>
              <button v-if="!readonly" type="button" class="rounded p-1 text-red-600 hover:bg-red-50" :aria-label="`Remove ${row.item_name || row.item}`" @click="emit('remove', i)">
                <LucideIcon name="trash-2" class="h-4 w-4" />
              </button>
            </td>
          </tr>
          <tr v-if="open[keyOf(row)]" class="bg-gray-50/60">
            <td :colspan="stock ? 7 : 5" class="px-3 py-2">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                <div><dt class="text-gray-500">UOM</dt><dd>{{ row.uom || '—' }}</dd></div>
                <div>
                  <dt class="text-gray-500">Conversion Factor<span v-if="isStockRow(row)" class="text-red-600"> *</span></dt>
                  <dd>
                    <input v-if="!readonly" type="number" step="any" :value="row.conversion_factor" :aria-label="`Conversion factor for ${row.item_name || row.item}`" class="ctl w-20" @change="setField(row, 'conversion_factor', toNum($event.target.value))" />
                    <span v-else>{{ row.conversion_factor }}</span>
                  </dd>
                </div>
                <div><dt class="text-gray-500">Stock Qty</dt><dd>{{ row.stock_qty ?? '—' }}</dd></div>
                <div><dt class="text-gray-500">Amount</dt><dd>{{ money(row.amount) }}</dd></div>
                <template v-if="isStockRow(row)">
                  <div><dt class="text-gray-500">GST Amount</dt><dd>{{ money(row.gst_amount) }}</dd></div>
                  <div><dt class="text-gray-500">CGST Rate / Amount</dt><dd>{{ flt(row.cgst_rate) }}% · {{ money(row.cgst_amount) }}</dd></div>
                  <div><dt class="text-gray-500">SGST Rate / Amount</dt><dd>{{ flt(row.sgst_rate) }}% · {{ money(row.sgst_amount) }}</dd></div>
                </template>
              </dl>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { computed, reactive } from 'vue'
import QueryLink from '@/components/billing/QueryLink.vue'
import { flt, todayStr } from '@/data/registrationRules'
import { isStockRow, money } from '@/data/billing/rules'

const props = defineProps({
  rows: { type: Array, required: true },
  idPrefix: { type: String, required: true },
  readonly: Boolean,
})
// change: (row, fieldname) after a value is set, for the form's handlers
const emit = defineEmits(['change', 'remove'])

const open = reactive({})
// Show the Batch / GST columns when any row is stock-tracked.
const stock = computed(() => props.rows.some(isStockRow))

// Rows have no name until saved - a stable key per row object instead.
const keys = new WeakMap()
let seq = 0
function keyOf(row) {
  if (row.name) return row.name
  if (!keys.has(row)) keys.set(row, `new-${++seq}`)
  return keys.get(row)
}

// set_query batch_no (billing.js): this row's item, not disabled, not expired.
function batchFilters(row) {
  return { item: row.item, disabled: 0, expiry_date: ['>=', todayStr()] }
}

const toInt = (v) => (v === '' ? null : parseInt(v, 10))
const toNum = (v) => (v === '' ? null : parseFloat(v))

function setField(row, field, value) {
  row[field] = value
  emit('change', row, field)
}
</script>
