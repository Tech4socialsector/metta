<template>
  <!-- Stock lookup (approved mock, 2026-10-25): one search for an item's
  batches, quantity, expiry and movements - instead of opening the Batch,
  Stock Balance and Stock Ledger lists one by one. Read-only. -->
  <AppLayout title="Stock lookup" subtitle="Batches, quantity, expiry and movements of an item">
    <!-- Highlighted search, same look as the indent's "Add item" box. -->
    <section class="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-[240px] flex-[3_1_380px]">
          <label for="lookup-search" class="ctl-label mb-1 block">Item</label>
          <div class="relative">
            <LucideIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-700" />
            <input
              id="lookup-search"
              v-model="term"
              type="search"
              autocomplete="off"
              placeholder="Type a medicine or item name, or its code…"
              class="h-10 w-full rounded-md border border-brand-300 bg-white pl-9 pr-3 text-[15px] placeholder:text-gray-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
              @input="searchSoon"
            />
          </div>
        </div>
        <div class="w-52">
          <label for="lookup-store" class="ctl-label mb-1 block">Store</label>
          <select id="lookup-store" v-model="store" class="h-10 w-full rounded-md border border-brand-300 bg-white px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200">
            <option value="">All stores</option>
            <option v-for="s in stores" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
        </div>
      </div>
      <div v-if="term.trim().length >= 2" class="flex flex-wrap gap-2">
        <span v-if="searching && !results.length" class="text-sm text-gray-600">Searching…</span>
        <span v-else-if="!results.length" class="text-sm text-gray-600">No item matches “{{ term }}”.</span>
        <button
          v-for="r in results"
          :key="r.name"
          type="button"
          class="flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold"
          :class="r.name === itemCode ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white text-gray-800 hover:border-brand-400'"
          @click="pick(r.name)"
        >
          {{ r.item_name }}
          <span class="font-normal" :class="r.name === itemCode ? 'text-white/80' : 'text-gray-500'">· {{ fmtQty(r.qty) }} in stock</span>
        </button>
      </div>
    </section>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>

    <div v-if="!itemCode" class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
      <span class="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><LucideIcon name="package" class="h-5 w-5" /></span>
      <p class="text-sm font-medium text-gray-800">Search an item to see its stock</p>
    </div>
    <p v-else-if="!info" class="text-sm text-gray-600">Loading…</p>

    <template v-else>
      <!-- The item at a glance. -->
      <section class="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div class="min-w-0 flex-[1_1_260px]">
          <h2 class="text-lg font-semibold text-gray-900">{{ info.item.item_name }}</h2>
          <p class="text-sm text-gray-600">{{ [info.item.name, info.item.item_group, info.item.rack_location ? `Rack ${info.item.rack_location}` : ''].filter(Boolean).join(' · ') }}</p>
        </div>
        <div v-for="s in stats" :key="s.label" class="min-w-[130px] rounded-lg bg-gray-50 px-4 py-2">
          <div class="text-xs text-gray-600">{{ s.label }}</div>
          <div class="text-[17px] font-bold tabular-nums" :class="s.tone">{{ s.value }}</div>
        </div>
      </section>

      <div class="grid grid-cols-1 items-start gap-4 2xl:grid-cols-2">
        <section class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3">
          <SubHeading icon="boxes">Batches</SubHeading>
          <p v-if="!info.batches.length" class="px-1 py-3 text-sm text-gray-600">No batch in stock{{ store ? ` at ${store}` : '' }}.</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-brand-100 bg-brand-50 text-left text-xs uppercase text-brand-800">
                <tr><th class="px-3 py-2 font-medium">Batch</th><th class="px-3 py-2 font-medium">Store</th><th class="px-3 py-2 text-right font-medium">Qty</th><th class="px-3 py-2 font-medium">Expiry</th><th class="px-3 py-2 text-right font-medium">Selling rate</th></tr>
              </thead>
              <tbody>
                <tr v-for="b in info.batches" :key="`${b.batch}-${b.warehouse}`" class="border-b border-gray-100 last:border-0">
                  <td class="px-3 py-2 font-medium text-gray-900">{{ b.batch }}</td>
                  <td class="px-3 py-2 text-gray-600">{{ b.warehouse }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ fmtQty(b.qty) }}</td>
                  <td class="px-3 py-2"><span v-if="b.expiry_date" class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="expiryTone(b.expiry_date)">{{ fmtDate(b.expiry_date) }}</span></td>
                  <td class="px-3 py-2 text-right tabular-nums text-gray-600">{{ b.selling_rate ? `₹ ${b.selling_rate.toFixed(2)}` : '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3">
          <SubHeading icon="arrow-down-up">Recent movements</SubHeading>
          <p v-if="!info.moves.length" class="px-1 py-3 text-sm text-gray-600">No movements yet.</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-brand-100 bg-brand-50 text-left text-xs uppercase text-brand-800">
                <tr><th class="px-3 py-2 font-medium">Date</th><th class="px-3 py-2 font-medium">What</th><th v-if="!store" class="px-3 py-2 font-medium">Store</th><th class="px-3 py-2 text-right font-medium">In</th><th class="px-3 py-2 text-right font-medium">Out</th><th class="px-3 py-2 text-right font-medium">Balance</th></tr>
              </thead>
              <tbody>
                <tr v-for="m in info.moves" :key="m.creation + m.voucher_no" class="border-b border-gray-100 last:border-0">
                  <td class="whitespace-nowrap px-3 py-2 text-gray-600">{{ fmtDate(m.posting_datetime) }}</td>
                  <td class="px-3 py-2">{{ m.voucher_type }} <span class="text-xs text-gray-500">{{ m.voucher_no }}</span></td>
                  <td v-if="!store" class="px-3 py-2 text-gray-600">{{ m.warehouse }}</td>
                  <td class="px-3 py-2 text-right tabular-nums text-green-700">{{ m.qty_change > 0 ? fmtQty(m.qty_change) : '' }}</td>
                  <td class="px-3 py-2 text-right tabular-nums text-red-700">{{ m.qty_change < 0 ? fmtQty(-m.qty_change) : '' }}</td>
                  <td class="px-3 py-2 text-right font-semibold tabular-nums">{{ fmtQty(m.qty_after_transaction) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { debounce } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import SubHeading from '@/components/SubHeading.vue'
import { api, errorText } from '@/data/api'

const route = useRoute()
const router = useRouter()

const stores = ref([])
const term = ref('')
const results = ref([])
const searching = ref(false)
const info = ref(null)
const error = ref('')

// Item and store live in the URL: the Pharmacy home links straight to an
// item, and Back returns to the same lookup.
const itemCode = computed(() => route.query.item || '')
const store = computed({
  get: () => route.query.store ?? '',
  set: (v) => router.replace({ query: { ...route.query, store: v || undefined } }),
})

const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const daysTo = (d) => Math.round((new Date(`${String(d).slice(0, 10)}T00:00:00`) - new Date(new Date().toDateString())) / 86400000)
// Past expiry red, within 30 days orange, later green.
function expiryTone(d) {
  const days = daysTo(d)
  if (days < 0) return 'bg-red-50 text-red-700'
  if (days <= 30) return 'bg-accent-50 text-accent-700'
  return 'bg-green-50 text-green-700'
}

const stats = computed(() => {
  const i = info.value
  const low = i.reorder_level != null && i.total <= i.reorder_level
  return [
    { label: 'In stock', value: fmtQty(i.total), tone: i.total <= 0 ? 'text-red-700' : low ? 'text-accent-700' : 'text-gray-900' },
    { label: 'Reorder level', value: i.reorder_level != null ? fmtQty(i.reorder_level) : '—', tone: 'text-gray-900' },
    { label: 'Batches', value: String(i.batches.length), tone: 'text-gray-900' },
    { label: 'Nearest expiry', value: fmtDate(i.nearest_expiry), tone: i.nearest_expiry && daysTo(i.nearest_expiry) <= 30 ? 'text-accent-700' : 'text-gray-900' },
  ]
})

async function search() {
  const q = term.value.trim()
  if (q.length < 2) {
    results.value = []
    return
  }
  searching.value = true
  try {
    results.value = (await api('metta.vue.stock.search_items', { txt: q, warehouse: store.value || undefined })) || []
  } catch (err) {
    error.value = errorText(err)
  } finally {
    searching.value = false
  }
}
const searchSoon = debounce(search, 250)

function pick(code) {
  router.replace({ query: { ...route.query, item: code } })
}

async function loadItem() {
  info.value = null
  error.value = ''
  if (!itemCode.value) return
  try {
    info.value = await api('metta.vue.stock.get_item_stock', { item: itemCode.value, warehouse: store.value || undefined })
  } catch (err) {
    error.value = errorText(err) || 'Could not load this item.'
  }
}

onMounted(async () => {
  try {
    stores.value = await api('metta.vue.stock.get_stores')
  } catch {
    stores.value = []
  }
  loadItem()
})
watch(() => [route.query.item, route.query.store], loadItem)
watch(store, () => term.value.trim().length >= 2 && search())
</script>
