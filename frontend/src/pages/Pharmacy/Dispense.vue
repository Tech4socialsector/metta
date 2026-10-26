<template>
  <AppLayout title="Dispense medicines">
    <!-- Read-only on purpose: Desk deducts stock when Billing Staff submit
    the bill, so the pharmacist only finds the bill and gives what's on it. -->
    <section class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
      <SubHeading icon="search">Find bill</SubHeading>
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="search">
        <div class="flex flex-1 flex-col gap-1.5">
          <label for="dispense-q" class="ctl-label">Bill No / UHIN / OP ID / IP ID</label>
          <input
            id="dispense-q"
            ref="input"
            v-model="query"
            type="text"
            autocomplete="off"
            class="ctl"
          />
        </div>
        <button type="submit" class="h-11 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy || !query.trim()">Search</button>
      </form>
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>
      <p v-if="searched && !busy && !results.length" class="py-6 text-center text-gray-600">No bill found for “{{ searched }}”</p>

      <!-- Several bills matched (a UHIN or visit with more than one bill):
      the pharmacist picks the receipt they were handed. -->
      <ul v-if="results.length > 1" class="divide-y divide-gray-100 rounded-lg border border-gray-200">
        <li v-for="r in results" :key="r.name">
          <button
            type="button"
            class="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-gray-50"
            :class="bill && bill.name === r.name ? 'bg-brand-50' : ''"
            @click="open(r.name)"
          >
            <span class="font-semibold text-brand-800">{{ r.name }}</span>
            <span class="flex-1">{{ r.customer_name || '—' }}</span>
            <span class="text-sm text-gray-600">{{ r.bill_type }}</span>
            <span class="text-sm text-gray-600 tabular-nums">{{ dt(r.sale_datetime) }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="bill" class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
      <SubHeading icon="receipt-text">Bill {{ bill.name }}</SubHeading>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="f in summary" :key="f.label" class="flex flex-col gap-0.5">
          <dt class="text-sm text-gray-600">{{ f.label }}</dt>
          <dd class="font-medium">{{ f.value || '—' }}</dd>
        </div>
      </dl>

      <SubHeading icon="pill">Pharmacy Items</SubHeading>
      <p v-if="!bill.pharmacy_items.length" class="py-4 text-center text-gray-600">This bill has no pharmacy items.</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-[16px]">
          <thead>
            <tr class="border-b border-gray-200 text-left text-sm text-gray-600">
              <th class="px-3 py-2 font-medium">#</th>
              <th class="px-3 py-2 font-medium">Item Name</th>
              <th class="px-3 py-2 font-medium">Item</th>
              <th class="px-3 py-2 font-medium">Batch</th>
              <th class="px-3 py-2 font-medium">Expiry</th>
              <th class="px-3 py-2 text-right font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in bill.pharmacy_items" :key="row.idx" class="border-b border-gray-100">
              <td class="px-3 py-3 text-gray-600">{{ row.idx }}</td>
              <td class="px-3 py-3 font-semibold">{{ row.item_name }}</td>
              <td class="px-3 py-3 text-gray-700">{{ row.item }}</td>
              <td class="px-3 py-3">{{ row.batch_no || '—' }}</td>
              <td class="px-3 py-3 tabular-nums" :class="isExpired(row.expiry_date) ? 'font-semibold text-red-700' : ''">{{ d(row.expiry_date) }}</td>
              <td class="px-3 py-3 text-right text-lg font-bold tabular-nums">{{ row.qty }} <span class="text-sm font-normal text-gray-600">{{ row.uom }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AppLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import { api, errorText } from '@/data/api'
import { formatValue } from '@/data/meta'
import { money } from '@/data/billing/rules'

const PHARMACY = 'metta.vue.pharmacy'

const input = ref(null)
const query = ref('')
const searched = ref('')
const results = ref([])
const bill = ref(null)
const busy = ref(false)
const error = ref('')

const d = (v) => formatValue({ fieldtype: 'Date' }, v)
const dt = (v) => formatValue({ fieldtype: 'Datetime' }, v)
const today = new Date().toISOString().slice(0, 10)
const isExpired = (v) => !!v && v < today

// Billing has no payment-status field in Desk, so the receipt's own
// payment mode and amount collected stand in for it.
const summary = computed(() => {
  const b = bill.value
  return [
    { label: 'Patient Name', value: b.customer_name },
    { label: 'UHIN', value: b.uhin_id },
    { label: b.registration_category === 'IP' ? 'IP ID' : 'OP ID', value: b.registration_category === 'IP' ? b.ip_id : b.op_id },
    { label: 'Bill Date', value: dt(b.sale_datetime) },
    { label: 'Payment Mode', value: b.payment_mode },
    { label: 'Amount Collected', value: money(b.amount_collected) },
  ]
})

async function search() {
  const q = query.value.trim()
  if (!q || busy.value) return
  busy.value = true
  error.value = ''
  bill.value = null
  try {
    results.value = (await api(`${PHARMACY}.search_bills`, { query: q })) || []
    searched.value = q
    // A scanned bill number matches exactly one bill - open it straight
    // away so the pharmacist doesn't need a second click.
    if (results.value.length === 1) await open(results.value[0].name)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
  // Back in the box, text selected, ready for the next receipt's scan.
  await nextTick()
  input.value?.select()
}

async function open(name) {
  error.value = ''
  try {
    bill.value = await api(`${PHARMACY}.get_bill`, { name })
  } catch (e) {
    error.value = errorText(e)
  }
}

onMounted(() => input.value?.focus())
</script>
