<template>
  <!-- Pharmacy home (approved mock, 2026-10-25): stock that needs attention
  in this store - four count cards that switch the list below. No billing or
  dispensing here: Billing submits the bill and that reduces stock. -->
  <AppLayout title="Pharmacy" subtitle="Stock that needs attention in this store">
    <template #actions>
      <label class="flex items-center gap-2 text-sm text-gray-600">Store
        <select v-model="store" class="ctl w-44" aria-label="Store">
          <option v-for="s in stores" :key="s.name" :value="s.name">{{ s.name }}</option>
        </select>
      </label>
      <router-link :to="{ name: 'StockLookup', query: { store } }" class="flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50">
        <LucideIcon name="search" class="h-4 w-4" />Stock lookup
      </router-link>
      <router-link :to="{ name: 'StockIndentForm', params: { name: 'new' } }" class="flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
        <LucideIcon name="plus" class="h-4 w-4" />New stock indent
      </router-link>
    </template>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>

    <div role="tablist" aria-label="Needs attention" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <button
        v-for="c in cards"
        :key="c.key"
        type="button"
        role="tab"
        :aria-selected="view === c.key"
        class="flex flex-col gap-2 rounded-xl border bg-white px-4 py-3.5 text-left transition-colors"
        :class="view === c.key ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200 hover:border-gray-300'"
        @click="view = c.key"
      >
        <span class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg" :class="view === c.key ? 'bg-brand-700 text-white' : 'bg-brand-100 text-brand-700'">
            <LucideIcon :name="c.icon" class="h-[18px] w-[18px]" />
          </span>
          <span class="text-sm font-semibold text-gray-800">{{ c.label }}</span>
        </span>
        <span class="text-[28px] font-bold leading-none tabular-nums" :class="view === c.key ? 'text-brand-800' : 'text-gray-900'">{{ data ? c.rows.length : '—' }}</span>
        <span class="text-[13px] text-gray-600">{{ c.sub }}</span>
      </button>
    </div>

    <section class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3">
        <div class="relative w-full sm:w-72">
          <LucideIcon name="search" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input v-model="search" type="search" placeholder="Search item" aria-label="Search item" class="ctl pl-8" />
        </div>
        <span class="ml-auto text-sm text-gray-600">{{ current.note }}</span>
      </div>
      <div v-if="!data" class="px-4 py-10 text-center text-sm text-gray-500">Loading…</div>
      <div v-else-if="!shown.length" class="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span class="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><LucideIcon name="circle-check" class="h-5 w-5" /></span>
        <p class="text-sm font-medium text-gray-800">{{ search ? 'No items match' : current.empty }}</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-brand-100 bg-brand-50 text-left text-xs uppercase text-brand-800">
            <tr>
              <th v-for="h in current.cols" :key="h.label" class="whitespace-nowrap px-4 py-2.5 font-medium" :class="h.right && 'text-right'">{{ h.label }}</th>
              <th class="w-32 px-4 py-2.5"><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.key" class="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td v-for="(cell, ci) in r.cells" :key="ci" class="whitespace-nowrap px-4 py-2.5" :class="[current.cols[ci].right && 'text-right tabular-nums', ci === 0 ? 'font-medium text-gray-900' : 'text-gray-600']">
                <span v-if="cell && cell.tag" class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="cell.tag">{{ cell.text }}</span>
                <template v-else>{{ cell }}</template>
              </td>
              <td class="whitespace-nowrap px-4 py-2 text-right">
                <router-link :to="r.to" class="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-semibold" :class="r.primary ? 'bg-brand-700 text-white hover:bg-brand-800' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'">{{ r.action }}</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { api, errorText } from '@/data/api'

const route = useRoute()
const router = useRouter()

const stores = ref([])
const data = ref(null)
const error = ref('')
const search = ref('')

// Card and store live in the URL, so Back from an item returns to the same list.
const view = computed({
  get: () => (['low', 'expiring', 'expired', 'indents'].includes(route.query.view) ? route.query.view : 'low'),
  set: (v) => router.replace({ query: { ...route.query, view: v } }),
})
const store = computed({
  get: () => route.query.store || data.value?.warehouse || '',
  set: (v) => router.replace({ query: { ...route.query, store: v } }),
})

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN')
const RED = 'bg-red-50 text-red-700'
const ORANGE = 'bg-accent-50 text-accent-700'
const BLUE = 'bg-brand-50 text-brand-800'
const AMBER = 'bg-amber-50 text-amber-800'
const lookup = (item) => ({ name: 'StockLookup', query: { item, store: store.value } })

// Each card: its rows (from the server), the columns it shows and the one
// action a row needs.
const cards = computed(() => {
  const d = data.value || { low: [], expiring: [], expired: [], indents: [] }
  return [
    {
      key: 'low',
      label: 'Low stock',
      icon: 'trending-down',
      sub: 'At or below reorder level',
      note: 'Raise an indent to ask the store for more',
      empty: 'Nothing is below its reorder level',
      cols: [{ label: 'Item' }, { label: 'Group' }, { label: 'In stock', right: true }, { label: 'Reorder level', right: true }, { label: 'Status' }],
      rows: d.low.map((r) => ({
        key: r.item,
        name: r.item_name,
        cells: [r.item_name, r.item_group || '', fmtQty(r.qty), fmtQty(r.reorder_level), r.qty <= 0 ? { tag: RED, text: 'Out of stock' } : { tag: ORANGE, text: 'Low' }],
        action: 'Raise indent',
        primary: true,
        to: { name: 'StockIndentForm', params: { name: 'new' } },
      })),
    },
    {
      key: 'expiring',
      label: 'Expiring soon',
      icon: 'clock',
      sub: 'Within 30 days',
      note: 'Use these batches first',
      empty: 'No batch expires in the next 30 days',
      cols: [{ label: 'Item' }, { label: 'Batch' }, { label: 'Qty', right: true }, { label: 'Expiry' }, { label: 'Days left' }],
      rows: d.expiring.map((r) => ({
        key: `${r.item}-${r.batch}`,
        name: r.item_name,
        // Under 14 days shows red so the most urgent stand out.
        cells: [r.item_name, r.batch, fmtQty(r.qty), fmtDate(r.expiry_date), { tag: r.days_left < 14 ? RED : ORANGE, text: `${r.days_left} days` }],
        action: 'View stock',
        to: lookup(r.item),
      })),
    },
    {
      key: 'expired',
      label: 'Expired',
      icon: 'triangle-alert',
      sub: 'Remove from shelf',
      note: 'Return to the store or adjust stock',
      empty: 'No expired stock in this store',
      cols: [{ label: 'Item' }, { label: 'Batch' }, { label: 'Qty', right: true }, { label: 'Expired on' }, { label: 'Status' }],
      rows: d.expired.map((r) => ({
        key: `${r.item}-${r.batch}`,
        name: r.item_name,
        cells: [r.item_name, r.batch, fmtQty(r.qty), fmtDate(r.expiry_date), { tag: RED, text: 'Expired' }],
        action: 'View stock',
        to: lookup(r.item),
      })),
    },
    {
      key: 'indents',
      label: 'Open indents',
      icon: 'clipboard-list',
      sub: 'Waiting for the store',
      note: 'Indents this store has raised',
      empty: 'No open indents',
      cols: [{ label: 'Indent' }, { label: 'Raised on' }, { label: 'Items', right: true }, { label: 'Required by' }, { label: 'Status' }],
      rows: d.indents.map((r) => ({
        key: r.name,
        name: r.name,
        cells: [r.name, fmtDate(r.request_date_time), fmtQty(r.items), fmtDate(r.required_by), { tag: r.status === 'Partially Issued' ? BLUE : AMBER, text: r.status }],
        action: 'Open',
        to: { name: 'StockIndentForm', params: { name: r.name } },
      })),
    },
  ]
})
const current = computed(() => cards.value.find((c) => c.key === view.value))
const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? current.value.rows.filter((r) => String(r.name).toLowerCase().includes(q)) : current.value.rows
})

async function load() {
  error.value = ''
  try {
    data.value = await api('metta.vue.stock.get_pharmacy_home', { warehouse: route.query.store || undefined })
  } catch (err) {
    data.value = { low: [], expiring: [], expired: [], indents: [] }
    error.value = errorText(err) || 'Could not load the pharmacy stock.'
  }
}

onMounted(async () => {
  try {
    stores.value = await api('metta.vue.stock.get_stores')
  } catch {
    stores.value = []
  }
  await load()
})
watch(() => route.query.store, (v, old) => v !== old && load())
</script>
