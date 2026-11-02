<template>
  <!-- Billing's waiting-to-pay view (approved 2026-11-02): today's doctor's
  orders not paid yet, as tabs - medicines, lab tests, and all bills. Shown
  under the Billing card of the Billing section and on /billing. -->
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div role="tablist" aria-label="Billing lists" class="flex shrink-0 flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        role="tab"
        :aria-selected="view === t.key"
        class="flex items-center gap-2 rounded-lg px-4 py-2 text-[14px] font-bold"
        :class="view === t.key ? 'bg-brand-700 text-white' : 'text-gray-700 hover:bg-gray-50'"
        @click="view = t.key"
      >
        <LucideIcon :name="t.icon" class="h-4 w-4" />{{ t.label }}
        <span v-if="t.rows" class="rounded-full px-2 text-[12.5px] tabular-nums" :class="view === t.key ? 'bg-white/20' : 'bg-gray-100 text-gray-700'">{{ data ? t.rows.length : '…' }}</span>
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>

    <DataList v-if="view === 'all'" fill doctype="Billing" :tabs="TABS" :row-route="(r) => ({ name: 'BillingForm', params: { name: r.name } })" :auto-refresh="60" />

    <section v-else class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div class="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3">
        <div class="relative w-full sm:w-72">
          <LucideIcon name="search" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input v-model="search" type="search" placeholder="Search patient or UHIN" aria-label="Search patient or UHIN" class="ctl pl-8" />
        </div>
        <span class="ml-auto text-sm text-gray-600">{{ current.note }}</span>
      </div>
      <div v-if="!data" class="px-4 py-10 text-center text-sm text-gray-500">Loading…</div>
      <div v-else-if="!shown.length" class="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span class="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><LucideIcon name="circle-check" class="h-5 w-5" /></span>
        <p class="text-sm font-medium text-gray-800">{{ search ? 'No patients match' : current.empty }}</p>
      </div>
      <div v-else class="min-h-0 flex-1 overflow-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 border-b border-brand-100 bg-brand-50 text-left text-xs uppercase text-brand-800">
            <tr>
              <th v-for="h in current.cols" :key="h" class="whitespace-nowrap px-4 py-2.5 font-medium">{{ h }}</th>
              <th class="w-32 px-4 py-2.5"><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.consultation" class="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td class="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{{ r.patient_name }}</td>
              <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600">{{ r.uhin }}</td>
              <td class="whitespace-nowrap px-4 py-2.5 text-gray-600">{{ from(r) }}</td>
              <td class="px-4 py-2.5 text-gray-800">
                {{ view === 'lab' ? r.tests.join(', ') : plural(r.medicines, 'medicine') }}
                <span v-if="also(r)" class="ml-2 whitespace-nowrap text-xs text-gray-500">{{ also(r) }}</span>
              </td>
              <!-- 20 minutes or more shows red, so the longest wait stands out. -->
              <td class="whitespace-nowrap px-4 py-2.5 tabular-nums" :class="r.waiting_min >= 20 ? 'font-semibold text-red-700' : 'text-gray-600'">{{ waited(r.waiting_min) }}</td>
              <td class="whitespace-nowrap px-4 py-2.5">
                <span class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="r.draft ? 'bg-brand-50 text-brand-800' : 'bg-accent-50 text-accent-700'">{{ r.draft ? 'Draft bill' : current.unpaid }}</span>
              </td>
              <td class="whitespace-nowrap px-4 py-2 text-right">
                <router-link :to="billRoute(r)" class="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-semibold" :class="r.draft ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50' : 'bg-brand-700 text-white hover:bg-brand-800'">{{ r.draft ? 'Open draft' : 'Bill' }}</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataList from '@/components/DataList.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { api, errorText } from '@/data/api'

const route = useRoute()
const router = useRouter()

const data = ref(null)
const error = ref('')
const search = ref('')

// Drafts first: those are the bills still waiting to be submitted.
const TABS = [
  { label: 'Draft', filters: [['docstatus', '=', 0]] },
  { label: 'Submitted', filters: [['docstatus', '=', 1]] },
  { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
  { label: 'All', filters: [] },
]

// The picked tab lives in the URL (its own key, beside the section page's
// `list`), so Back from a bill returns to the same tab.
const view = computed({
  get: () => (['med', 'lab', 'all'].includes(route.query.queue) ? route.query.queue : 'med'),
  set: (v) => router.replace({ query: { ...route.query, queue: v } }),
})

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const waited = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`)
const from = (r) => [r.doctor, r.is_ip ? `IP${r.bed ? ` ${r.bed}` : ''}` : 'OP'].filter(Boolean).join(' · ')
// One bill clears both lists, so each row says what else the patient is waiting to pay for.
const also = (r) => {
  if (view.value === 'lab') return r.medicines ? `+ ${plural(r.medicines, 'medicine')}` : ''
  return r.tests.length ? `+ ${plural(r.tests.length, 'lab test')}` : ''
}
// A draft opens as it is; otherwise a new bill filled from the consultation.
const billRoute = (r) =>
  r.draft
    ? { name: 'BillingForm', params: { name: r.draft } }
    : { name: 'BillingForm', params: { name: 'new' }, query: { doctor_consultation: r.consultation } }

const COLS = ['Patient', 'UHIN', 'From']
const tabs = computed(() => {
  const d = data.value || { medicines: [], lab: [] }
  return [
    {
      key: 'med',
      label: 'Medicines to bill',
      icon: 'pill',
      note: 'Today · oldest first · pharmacy hands over only after payment',
      empty: 'No medicines waiting to be billed today',
      unpaid: 'Not billed',
      cols: [...COLS, 'Medicines', 'Waiting', 'Status'],
      rows: d.medicines,
    },
    {
      key: 'lab',
      label: 'Lab tests to pay',
      icon: 'flask-conical',
      note: 'Today · oldest first · OP and IP both pay before the sample',
      empty: 'No lab tests waiting for payment today',
      unpaid: 'Not paid',
      cols: [...COLS, 'Tests', 'Waiting', 'Status'],
      rows: d.lab,
    },
    { key: 'all', label: 'All bills', icon: 'receipt-text' },
  ]
})
const current = computed(() => tabs.value.find((t) => t.key === view.value && t.rows) || tabs.value[0])
const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return current.value.rows
  return current.value.rows.filter((r) => `${r.patient_name} ${r.uhin}`.toLowerCase().includes(q))
})

async function load() {
  try {
    data.value = await api('metta.vue.billing.get_billing_queue')
    error.value = ''
  } catch (err) {
    data.value = data.value || { medicines: [], lab: [] }
    error.value = errorText(err) || 'Could not load the billing queue.'
  }
}

// Same 60-second refresh as the bill list, so new orders appear without a reload.
let timer
onMounted(() => {
  load()
  timer = setInterval(load, 60000)
})
onUnmounted(() => clearInterval(timer))
</script>
