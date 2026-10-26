<template>
  <!-- stock_indent.js render_item_search: find an item (with its stock in
  the requesting warehouse), type Req. Qty, Add. -->
  <!-- Highlighted on purpose: this is where staff start on an indent, so the
  box, its heading and the larger white search field make it easy to spot. -->
  <div class="flex flex-wrap items-end gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
    <h3 class="flex basis-full items-center gap-2 text-sm font-semibold text-brand-800">
      <LucideIcon name="search" class="h-4 w-4 text-brand-700" />Add item
    </h3>
    <div class="relative min-w-[220px] flex-[2_1_260px]">
      <label for="indent-search" class="ctl-label mb-1 block">Product Name</label>
      <div class="relative">
        <LucideIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-700" />
        <input
          id="indent-search"
          v-model="term"
          type="search"
          autocomplete="off"
          placeholder="Type a medicine or item name…"
          class="h-10 w-full rounded-md border border-brand-300 bg-white pl-9 pr-3 text-[15px] text-gray-900 placeholder:text-gray-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
          @input="onInput"
          @focus="term && (open = true)"
          @blur="open = false"
        />
      </div>
      <div v-if="open && term" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg" @mousedown.prevent>
        <p v-if="!results.length" class="px-3 py-2 text-sm text-gray-500">{{ loading ? 'Searching…' : 'No matches' }}</p>
        <table v-else class="w-full text-sm">
          <thead class="bg-brand-50 text-left text-xs uppercase text-brand-800">
            <tr><th class="px-3 py-1.5">Name</th><th class="px-3 py-1.5 text-right">Avail. Qty</th><th class="px-3 py-1.5">Manufacturer</th><th class="px-3 py-1.5">Rack/Shelf</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in results" :key="r.item_code" class="cursor-pointer hover:bg-brand-50" @click="pick(r)">
              <td class="px-3 py-1.5">{{ r.name }}</td>
              <td class="px-3 py-1.5 text-right" :class="r.avail_qty === 0 && 'text-red-600'">{{ r.avail_qty }}</td>
              <td class="px-3 py-1.5 text-gray-600">{{ r.manufacturer }}</td>
              <td class="px-3 py-1.5 text-gray-600">{{ r.rack_location }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="w-32">
      <label for="indent-qty" class="ctl-label mb-1 block">Req. Qty</label>
      <input id="indent-qty" v-model="qty" type="number" min="0" step="1" class="h-10 w-full rounded-md border border-brand-300 bg-white px-3 text-right text-[15px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" @keydown.enter.prevent="add" />
    </div>
    <button type="button" class="flex h-10 items-center gap-1.5 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800" @click="add">
      <LucideIcon name="plus" class="h-4 w-4" />Add
    </button>
    <!-- On its own line under the row: inside the Product Name column it made
    that column taller, and the bottom-aligned Req. Qty / Add slid down. -->
    <p v-if="selected" class="basis-full">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
        <LucideIcon name="circle-check" class="h-3.5 w-3.5 text-brand-700" />{{ selected.name }} · {{ selected.item_code }} · Avail. {{ selected.avail_qty ?? 0 }}
      </span>
    </p>
    <p v-if="error" class="basis-full text-sm text-red-700">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { call, debounce } from 'frappe-ui'
import LucideIcon from '@/components/LucideIcon.vue'

const INDENT_API = 'metta.purchase_request.doctype.stock_indent.stock_indent'

const props = defineProps({
  doc: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const term = ref('')
const qty = ref('')
const results = ref([])
const selected = ref(null)
const open = ref(false)
const loading = ref(false)
const error = ref('')

async function search() {
  if (!term.value) {
    open.value = false
    return
  }
  loading.value = true
  try {
    results.value = (await call(`${INDENT_API}.search_items_for_indent`, { warehouse: props.doc.requesting_warehouse, search_term: term.value })) || []
    open.value = true
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}
const searchSoon = debounce(search, 300)

function onInput() {
  selected.value = null
  error.value = ''
  searchSoon()
}
function pick(r) {
  selected.value = r
  term.value = r.name
  open.value = false
}

// Avail. Qty depends on the warehouse - re-run the current search.
watch(
  () => props.doc.requesting_warehouse,
  () => {
    if (term.value) onInput()
  },
)

async function add() {
  error.value = ''
  if (!selected.value) {
    error.value = 'Please search and select an item first.'
    return
  }
  const n = parseInt(qty.value, 10)
  if (!n || n <= 0) {
    error.value = 'Please enter a Req. Qty greater than 0.'
    return
  }
  // Unit and the stock figures for Central Store to decide on (the server
  // fills them again on save, so a failed lookup here loses nothing).
  let extra = { unit_of_measure: selected.value.unit_of_measure || '' }
  try {
    extra = { ...extra, ...(await call(`${INDENT_API}.get_indent_row_details`, { item: selected.value.item_code, warehouse: props.doc.requesting_warehouse })) }
  } catch {
    // keep what the search already gave
  }
  // A blank starter row must not linger as an empty Row 1.
  const rows = props.doc.items || []
  if (rows.length && rows.every((r) => !r.item)) props.ctx.clearTable('items')
  props.ctx.addRow('items', { item: selected.value.item_code, item_name: selected.value.name, qty_requested: n, qty_issued: 0, qty_pending: n, ...extra })
  selected.value = null
  term.value = ''
  qty.value = ''
  results.value = []
}
</script>
