<template>
  <!-- purchase_order.js render_item_search: search an item, see Central
  Store's balance, type Packing and No of Unit, Add. -->
  <div class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
    <div class="flex flex-wrap items-end gap-3">
      <div class="relative min-w-[220px] flex-[2_1_260px]">
        <label for="po-item-search" class="ctl-label mb-1 block">Product Name</label>
        <input id="po-item-search" v-model="term" type="search" autocomplete="off" placeholder="Search item..." class="ctl" @input="onInput" @blur="open = false" @focus="open = !!term" />
        <div v-if="open" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg" @mousedown.prevent>
          <p v-if="!results.length" class="px-3 py-2 text-sm text-gray-500">No matches</p>
          <table v-else class="w-full text-sm">
            <thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th class="px-3 py-1.5">Name</th><th class="px-3 py-1.5 text-right">Avail. Qty (Store)</th><th class="px-3 py-1.5">Manufacturer</th><th class="px-3 py-1.5">Rack/Shelf</th></tr>
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
      <!-- From Unit of Measure, so a pack the admin adds there shows here. -->
      <div class="w-36">
        <LinkField id="po-item-pack" v-model="pack" doctype="Unit of Measure" label="Pack" />
      </div>
      <div class="w-32">
        <label for="po-item-packing" class="ctl-label mb-1 block">{{ uom || 'Units' }} per {{ pack || 'Pack' }}</label>
        <input id="po-item-packing" v-model="packing" type="number" min="0" step="1" class="ctl" />
      </div>
      <div class="w-28">
        <label for="po-item-qty" class="ctl-label mb-1 block">No. of {{ pack ? `${pack}s` : 'Packs' }}</label>
        <input id="po-item-qty" v-model="qty" type="number" min="0" step="1" class="ctl" @keydown.enter.prevent="add" />
      </div>
      <button type="button" class="h-10 rounded-lg bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800" @click="add">Add</button>
    </div>
    <!-- The line as a sentence, so nobody guesses what was counted. -->
    <p v-if="selected" class="text-xs text-gray-600">
      Selected: {{ selected.name }} ({{ selected.item_code }})<template v-if="sentence"> · <b class="text-gray-900">{{ sentence }}</b></template>
    </p>
    <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { call, debounce } from 'frappe-ui'
import { errorText } from '@/data/api'
import LinkField from '@/components/LinkField.vue'
import { PO, cint, packSentence } from '@/data/purchase/rules'

// add({ item, item_name, available_qty, packing, no_of_unit, qty_ordered, unit_of_measure })
const emit = defineEmits(['add'])

const term = ref('')
const results = ref([])
const open = ref(false)
const selected = ref(null)
const packing = ref('')
const pack = ref('')
const uom = ref('')
const qty = ref('')
const error = ref('')
const sentence = computed(() => packSentence(pack.value, cint(packing.value), cint(qty.value), uom.value))

const search = debounce(async () => {
  if (!term.value) {
    open.value = false
    return
  }
  try {
    results.value = (await call(`${PO}.search_items_for_order`, { search_term: term.value })) || []
  } catch {
    results.value = []
  }
  open.value = true
}, 300)

// Typing again drops the picked item and its Packing, as in Desk.
function onInput() {
  selected.value = null
  packing.value = ''
  pack.value = ''
  uom.value = ''
  error.value = ''
  search()
}

async function pick(r) {
  selected.value = r
  term.value = r.name
  open.value = false
  // Pack and Units per Pack start from how this item last came; still editable.
  try {
    const d = await call(`${PO}.get_item_defaults_for_order`, { item: r.item_code })
    packing.value = cint(d?.packing) || ''
    pack.value = d?.pack_type || ''
    uom.value = d?.unit_of_measure || ''
  } catch {
    // left for the user to type
  }
}

async function add() {
  error.value = ''
  if (!selected.value) return (error.value = 'Please search and select an item first.')
  if (!pack.value) return (error.value = 'Please pick the Pack (Strip, Box, Bottle...) the supplier sends it in.')
  const p = cint(packing.value)
  if (!p || p <= 0) return (error.value = 'Please enter Units per Pack greater than 0.')
  const n = cint(qty.value)
  if (!n || n <= 0) return (error.value = 'Please enter No. of Packs greater than 0.')
  try {
    const d = (await call(`${PO}.get_item_defaults_for_order`, { item: selected.value.item_code })) || {}
    // No Rate/Amount - pricing is entered later, on the Purchase Bill.
    emit('add', {
      item: selected.value.item_code,
      item_name: selected.value.name,
      available_qty: selected.value.avail_qty,
      pack_type: pack.value,
      packing: p,
      no_of_unit: n,
      qty_ordered: p * n,
      unit_of_measure: d.unit_of_measure || '',
    })
    selected.value = null
    term.value = ''
    packing.value = ''
    pack.value = ''
    uom.value = ''
    qty.value = ''
  } catch (err) {
    error.value = errorText(err)
  }
}
</script>
