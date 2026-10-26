<template>
  <!-- render_item_search (billing.js): search, pick with arrows + Enter,
  type Qty, Enter adds - no mouse needed. -->
  <div class="flex flex-wrap items-end gap-2">
    <div class="relative min-w-[220px] flex-[2_1_260px]">
      <label :for="`${table}-search`" class="ctl-label mb-1 block">Item Name</label>
      <input
        :id="`${table}-search`"
        ref="searchEl"
        v-model="term"
        type="text"
        autocomplete="off"
        placeholder="Search item..."
        class="ctl"
        @input="onInput"
        @keydown="onKey"
        @blur="open = false"
      />
      <div v-if="open" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg" @mousedown.prevent>
        <p v-if="!results.length" class="px-3 py-2 text-sm text-gray-500">No matches</p>
        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="px-3 py-1.5">Name</th>
              <th class="px-3 py-1.5 text-right">Rate (excl. GST)</th>
              <th v-if="showAvail" class="px-3 py-1.5 text-right">Avail. Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in results" :key="r.item_code" class="cursor-pointer" :class="i === active ? 'bg-brand-50' : 'hover:bg-gray-50'" @click="select(i)">
              <td class="px-3 py-1.5">{{ r.name }}</td>
              <td class="px-3 py-1.5 text-right tabular-nums">{{ flt(r.rate).toFixed(2) }}</td>
              <td v-if="showAvail" class="px-3 py-1.5 text-right tabular-nums" :class="r.avail_qty === 0 && 'text-red-600'">{{ r.avail_qty }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="w-20">
      <label :for="`${table}-qty`" class="ctl-label mb-1 block">Qty</label>
      <input :id="`${table}-qty`" ref="qtyEl" v-model="qty" type="text" inputmode="decimal" class="ctl" @keydown.enter.prevent="add" />
    </div>
    <button type="button" class="h-9 rounded-lg border border-brand-700 px-4 text-sm font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-60" :disabled="adding" @click="add">Add</button>
    <p v-if="selected" class="basis-full text-xs text-gray-600">Selected: {{ selected.name }} ({{ selected.item_code }})</p>
    <p v-if="error" class="basis-full text-sm text-red-700">{{ error }}</p>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import { debounce } from 'frappe-ui'
import { api, errorText } from '@/data/api'
import { flt } from '@/data/registrationRules'
import { BILLING } from '@/data/billing/rules'

const props = defineProps({
  // 'pharmacy_items' (Medicine/Consumable in stock) or 'service_items'
  table: { type: String, required: true },
  showAvail: Boolean,
})
const emit = defineEmits(['add'])

const term = ref('')
const qty = ref('1')
const results = ref([])
const open = ref(false)
const active = ref(-1)
const selected = ref(null)
const error = ref('')
const adding = ref(false)
const searchEl = ref(null)
const qtyEl = ref(null)

const search = debounce(async () => {
  if (!term.value) {
    open.value = false
    return
  }
  try {
    results.value = (await api(`${BILLING}.search_items_for_billing`, { search_term: term.value, table: props.table })) || []
  } catch {
    results.value = []
  }
  open.value = true
  // First result pre-highlighted, so Enter picks it straight away.
  active.value = 0
}, 300)

function onInput() {
  selected.value = null
  error.value = ''
  search()
}

function onKey(e) {
  if (!open.value || !results.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(active.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    select(active.value)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

async function select(i) {
  const r = results.value[i]
  if (!r) return
  selected.value = r
  term.value = r.name
  open.value = false
  // Straight into Qty next.
  await nextTick()
  qtyEl.value?.focus()
  qtyEl.value?.select()
}

// try_add_item: messages verbatim from billing.js.
async function add() {
  error.value = ''
  if (!selected.value) {
    error.value = 'Please search and select an item first.'
    return
  }
  const q = flt(qty.value)
  if (!q || q <= 0) {
    error.value = 'Please enter a Qty greater than 0.'
    return
  }
  adding.value = true
  try {
    const data = (await api(`${BILLING}.get_billing_item_row`, { item_code: selected.value.item_code, qty: q })) || {}
    emit('add', data)
    selected.value = null
    term.value = ''
    qty.value = '1'
    results.value = []
    // Back to Item Name, ready for the next one.
    searchEl.value?.focus()
  } catch (err) {
    error.value = errorText(err)
  } finally {
    adding.value = false
  }
}
</script>
