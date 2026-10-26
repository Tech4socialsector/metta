<template>
  <AppLayout title="Visit" :subtitle="name" :back-to="{ name: 'VisitList' }">

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="doc">
      <section class="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div class="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="text-[22px] font-semibold">{{ doc.patient_name }}</h1>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="isIP ? 'bg-violet-50 text-violet-800' : 'bg-brand-50 text-brand-800'">{{ doc.registration_category }}</span>
            <span v-if="isIP" class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{{ doc.admission_status }}</span>
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
            <span><span class="text-gray-600">Visit</span> <b class="font-mono font-medium">{{ doc.name }}</b></span>
            <span>
              <span class="text-gray-600">UHIN</span>
              <router-link :to="{ name: 'PatientView', params: { uhin: doc.uhin_id } }" class="font-mono text-brand-700 hover:underline">{{ doc.uhin_id }}</router-link>
            </span>
            <span><span class="text-gray-600">Date</span> {{ doc.date }} {{ doc.time }}</span>
          </div>
        </div>
        <!-- Desk's "Admit Patient": only on today's OP visit, and only while
        it hasn't been admitted already (get_ip_id_for_op). -->
        <router-link v-if="canAdmit" :to="{ name: 'AdmitPatient', params: { name: doc.name } }" class="flex h-11 items-center rounded-lg bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">Admit Patient</router-link>
        <router-link v-if="admittedAs" :to="{ name: 'VisitView', params: { name: admittedAs } }" class="flex h-11 items-center rounded-lg border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-800">Admitted as {{ admittedAs }}</router-link>
        <router-link :to="{ name: 'WardVisitEdit', params: { name: doc.name } }" class="flex h-11 items-center rounded-lg border border-gray-300 bg-white px-5 font-semibold hover:bg-gray-50">Edit</router-link>
        <button type="button" class="h-11 rounded-lg border border-gray-300 bg-white px-5 font-semibold hover:bg-gray-50" :disabled="printing" @click="printReceipt">{{ printing ? 'Preparing…' : 'Print receipt' }}</button>
      </section>
      <p v-if="doc.registration_category === 'OP' && !canAdmit && !admittedAs && doc.date !== today" class="text-sm text-gray-600">
        Admit Patient is only available on the OP visit dated today. Create a new OP visit for today first.
      </p>
      <p v-if="printError" class="text-sm text-red-700">{{ printError }}</p>

      <!-- IP: the Desk form's Advance Summary button and low-advance
      indicator, shown directly. -->
      <section v-if="isIP && advance" class="flex flex-wrap gap-6 rounded-xl border bg-white p-5" :class="advance.is_low ? 'border-amber-300' : 'border-gray-200'">
        <div><div class="text-xs uppercase text-gray-600">Total collected</div><div class="text-lg font-semibold">{{ money(advance.total_collected) }}</div></div>
        <div><div class="text-xs uppercase text-gray-600">Adjusted against bills</div><div class="text-lg font-semibold">{{ money(advance.total_adjusted) }}</div></div>
        <div><div class="text-xs uppercase text-gray-600">Balance</div><div class="text-lg font-semibold">{{ money(advance.balance) }}</div></div>
        <p v-if="advance.is_low" class="basis-full font-semibold text-amber-900">Advance {{ Math.round(advance.percent_used) }}% used — ask the patient's relative to pay more advance.</p>
      </section>

      <RecordView doctype="Patient Visit" :doc="doc" />

      <section v-if="isIP" class="rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="arrow-left-right">Bed / Ward Transfer History</SubHeading>
        <p v-if="!transfers.length" class="text-sm text-gray-600">No ward/bed transfers recorded for this admission yet.</p>
        <ul class="flex flex-col gap-2">
          <li v-for="(t, i) in transfers" :key="i" class="text-sm">
            <b>{{ t.transferred_on }}</b> — {{ t.from_label }} → {{ t.to_label }}
            <div class="text-gray-600">By {{ t.transferred_by }}<template v-if="t.reason"> — {{ t.reason }}</template></div>
          </li>
        </ul>
      </section>
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import RecordView from '@/components/RecordView.vue'
import { api, errorText, VISIT } from '@/data/api'
import { todayStr } from '@/data/registrationRules'

const props = defineProps({ name: { type: String, required: true } })

const doc = ref(null)
const loadError = ref('')
const advance = ref(null)
const transfers = ref([])
const printing = ref(false)
const printError = ref('')

const isIP = computed(() => doc.value?.registration_category === 'IP')
const today = todayStr()
const admittedAs = ref('')
const admitChecked = ref(false)
const canAdmit = computed(() => admitChecked.value && !admittedAs.value && doc.value?.registration_category === 'OP' && doc.value?.date === today)

function money(v) {
  return `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

onMounted(async () => {
  try {
    doc.value = await call('frappe.client.get', { doctype: 'Patient Visit', name: props.name })
  } catch (err) {
    loadError.value = errorText(err) || `Visit ${props.name} could not be opened.`
    return
  }
  if (!isIP.value) {
    try {
      admittedAs.value = (await api('metta.sales.doctype.billing.billing.get_ip_id_for_op', { op_id: props.name })) || ''
    } catch {
      admittedAs.value = ''
    }
    admitChecked.value = true
    return
  }
  try {
    advance.value = await api('metta.sales.doctype.patient_advance.patient_advance.get_advance_balance', { patient_visit: props.name })
  } catch {
    advance.value = null
  }
  try {
    transfers.value = (await api(`${VISIT}.get_bed_transfer_history`, { patient_visit: props.name })) || []
  } catch {
    transfers.value = []
  }
})

// Receipt Preview -> Print Receipt (same print format as Desk)
async function printReceipt() {
  printing.value = true
  printError.value = ''
  try {
    const html = await api(`${VISIT}.get_receipt_html`, { registration: props.name })
    const w = window.open('', '_blank')
    w.document.open()
    w.document.write(`<html><head><title>${props.name}</title></head><body>${html}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  } catch (err) {
    printError.value = errorText(err)
  } finally {
    printing.value = false
  }
}
</script>
