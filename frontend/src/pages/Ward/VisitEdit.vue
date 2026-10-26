<template>
  <AppLayout title="Edit visit" :back-to="{ name: 'VisitView', params: { name } }">
    <!-- Option C: OP/IP + admission status + id under the title, one Save at the top. -->
    <template v-if="doc" #meta>
      <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="isIP ? 'bg-violet-50 text-violet-800' : 'bg-brand-50 text-brand-800'">{{ doc.registration_category }}</span>
        <StatusBadge v-if="isIP" :status="original.admission_status" />
        <span class="font-mono">{{ name }}</span>
        <span v-if="canWrite && dirty">· Unsaved changes</span>
      </div>
    </template>
    <template #actions>
      <button v-if="doc" type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60" :disabled="printing" @click="printReceipt">{{ printing ? 'Preparing…' : 'Print receipt' }}</button>
      <button v-if="summaryButton" type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" @click="openDischargeSummary">Discharge Summary</button>
      <!-- Discard / Save only while there is something to save. -->
      <template v-if="doc && canWrite && dirty">
        <button type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" @click="load">Discard</button>
        <button type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save changes' }}</button>
      </template>
    </template>

    <p v-if="loadError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-if="doc" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <PatientBar :name="doc.patient_name" :age="doc.age" :gender="doc.sex" :uhin="doc.uhin_id" :doctor="doc.doctor_name" />
      <SectionJump :sections="sections" />

      <!-- Desk's dashboard indicators -->
      <p v-if="billingIndicator" class="rounded-lg px-3 py-2 text-sm font-semibold" :class="billingIndicator.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'">{{ billingIndicator.text }}</p>
      <p v-if="advance?.is_low" class="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        Advance {{ Math.round(advance.percent_used) }}% used — only {{ money(advance.balance) }} remaining. Ask the patient's relative to pay more advance.
      </p>
      <p v-if="!canWrite" class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">You can view this visit but not change it.</p>

      <!-- One red block under the patient bar, seen after Save at the top. -->
      <div v-if="saveError || (tried && problems.length)" class="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <div>
          <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
          <template v-else>
            <p class="font-semibold">Please fix these before saving:</p>
            <ul class="list-disc pl-5"><li v-for="p in problems" :key="p">{{ p }}</li></ul>
          </template>
        </div>
        <button v-if="saveError && staleDoc" type="button" class="h-8 shrink-0 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="load">Reload latest</button>
      </div>
      <p v-if="savedNote" class="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{{ savedNote }}</p>

      <!-- IP Details -->
      <section v-if="isIP" id="sec-ip" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="bed-double">
          IP Details
          <template #end>
            <router-link v-if="$router.hasRoute('WardBoard')" :to="{ name: 'WardBoard' }" class="text-sm font-semibold text-brand-700 hover:underline">All wards and beds</router-link>
          </template>
        </SubHeading>
        <BedChooser :key="bedKey" :doc="doc" :original="original" :readonly="!canWrite" />
        <div :class="GRID">
          <!-- refresh(): only a Doctor (or System Manager) may change this -->
          <SelectField id="admission_status" v-model="doc.admission_status" label="Admission Status" :options="VISIT_OPTIONS.admission_status" :readonly="!canWrite || !canChangeStatus" />
          <TextField id="admission_date" v-model="doc.admission_date" type="date" label="Admission Date" :readonly="!canWrite" />
          <TextField id="expected_discharge_date" v-model="doc.expected_discharge_date" type="date" label="Expected Discharge Date" :readonly="!canWrite" />
          <TextField v-if="doc.admission_status === 'Discharged'" id="discharge_date" v-model="doc.discharge_date" type="date" label="Discharge Date" :readonly="!canWrite" />
        </div>
        <div v-if="doc.converted_from_registration" class="text-sm text-gray-700">
          Converted From OP Registration
          <router-link :to="{ name: 'VisitView', params: { name: doc.converted_from_registration } }" class="font-mono text-brand-700 hover:underline">{{ doc.converted_from_registration }}</router-link>
        </div>

        <div class="flex flex-col gap-2 pt-1">
          <SubHeading icon="arrow-left-right">Bed / Ward Transfer History</SubHeading>
          <p v-if="!transfers.length" class="text-sm text-gray-600">No ward/bed transfers recorded for this admission yet.</p>
          <ul class="flex flex-col gap-2">
            <li v-for="t in transfers" :key="t.name" class="text-sm">
              <router-link :to="{ name: 'DocForm', params: { doctype: 'Bed Transfer', name: t.name } }" class="hover:underline">
                <b>{{ formatValue({ fieldtype: 'Datetime' }, t.transferred_on) }}</b> — {{ t.from_label }} → {{ t.to_label }}
              </router-link>
              <div class="text-gray-600">By {{ t.transferred_by || '' }}<template v-if="t.reason"> — {{ t.reason }}</template></div>
            </li>
          </ul>
        </div>
      </section>

      <!-- MLC (Medico-Legal Case) Details -->
      <section v-if="isIP" id="sec-mlc" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="scale">MLC Details</SubHeading>
        <label class="flex min-h-9 items-center gap-3 font-semibold">
          <input v-model="mlc" type="checkbox" class="h-5 w-5" :disabled="!canWrite" />
          Is MLC Case <span class="font-normal text-gray-600">(Medico-Legal Case)</span>
        </label>
        <div v-if="mlc" :class="GRID">
          <TextField id="mlc_no" v-model="doc.mlc_no" label="MLC No" reqd :readonly="!canWrite" />
          <SelectField id="mlc_type" v-model="doc.mlc_type" label="Type of Case" :options="VISIT_OPTIONS.mlc_type" :readonly="!canWrite" />
          <SelectField id="brought_by" v-model="doc.brought_by" label="Brought By" :options="VISIT_OPTIONS.brought_by" :readonly="!canWrite" />
          <TextField id="police_station" v-model="doc.police_station" label="Police Station Informed" :readonly="!canWrite" />
          <TextField id="police_intimation_datetime" v-model="policeTime" type="datetime-local" label="Police Intimation Date/Time" :readonly="!canWrite" />
        </div>
      </section>

      <!-- Visit + Consultation Details -->
      <section id="sec-visit" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="stethoscope">Visit</SubHeading>
        <div :class="GRID">
          <TextField id="date" v-model="doc.date" type="date" label="Date" :readonly="!canWrite" />
          <TextField id="time" v-model="doc.time" label="Time" placeholder="09:25:11 PM" :readonly="!canWrite" />
          <LinkField v-if="!isIP" id="registration_type" v-model="doc.registration_type" doctype="Registration type Master" label="Registration Type" :readonly="!canWrite" />
          <LinkField id="department_name" v-model="doc.department_name" doctype="Department" label="Department Name" :readonly="!canWrite" />
          <LinkField id="doctor_name" v-model="doc.doctor_name" doctype="Doctor Master" label="Doctor name" :filters="doc.department_name ? { department: doc.department_name } : null" :readonly="!canWrite" />
        </div>
        <p v-if="doc.appointment" class="text-sm text-gray-700">
          Appointment <router-link :to="{ name: 'WardAppointmentForm', params: { name: doc.appointment } }" class="font-mono text-brand-700 hover:underline">{{ doc.appointment }}</router-link>
        </p>
      </section>

      <!-- OP: "Billing Category" (registration fee) -->
      <section v-if="!isIP" id="sec-fee" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="indian-rupee">Registration fee</SubHeading>
        <div :class="GRID">
          <TextField id="fee_amount" :model-value="money(doc.fee_amount)" label="Fee Amount" readonly />
          <LinkField id="billing_category" v-model="doc.billing_category" doctype="Category Price Adjustment" label="Billing Category" :readonly="!canWrite" />
          <LinkField v-if="showCompany" id="company_name" v-model="doc.company_name" doctype="Corporate Customer" label="Company Name" :readonly="!canWrite" />
          <TextField id="adjustment_type" :model-value="doc.adjustment_type || ''" label="Adjustment Type" readonly />
          <SelectField id="default_currency" v-model="doc.default_currency" label="Billing Currency" :options="OPTIONS.default_currency" :readonly="!canWrite" />
          <TextField id="charity_percent" :model-value="doc.charity_percent ?? ''" :label="labels.percent" inputmode="decimal" :readonly="!canWrite || doc.billing_category !== 'General'" @update:model-value="onCharityPercent" />
          <TextField v-if="doc.billing_category === 'General'" id="charity_amount" :model-value="doc.charity_amount ?? ''" :label="labels.amount" inputmode="decimal" :readonly="!canWrite" @update:model-value="onCharityAmount" />
          <TextField id="discount_amount" :model-value="money(totals.discount_amount)" label="Discount Amount" readonly />
          <TextField id="net_amount" :model-value="money(totals.net_amount)" label="Net Amount" readonly />
          <template v-if="totals.net_amount > 0">
            <SelectField id="payment_mode" v-model="doc.payment_mode" label="Payment Mode" :options="OPTIONS.payment_mode" :readonly="!canWrite" />
            <LinkField v-if="doc.payment_mode === 'Credit - Corporate'" id="corporate_customer" v-model="doc.corporate_customer" doctype="Corporate Customer" label="Corporate Customer" reqd :readonly="!canWrite" />
          </template>
          <TextField v-if="doc.collected_by" id="collected_by" :model-value="doc.collected_by" label="Collected By" readonly />
        </div>
      </section>

      <!-- IP: Advance Summary + Advance Tracking -->
      <section v-if="isIP" id="sec-advance" class="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="wallet">Advance</SubHeading>
        <div v-if="advance" class="flex flex-wrap gap-6">
          <div><div class="text-xs uppercase text-gray-600">Total Collected</div><div class="text-lg font-semibold">{{ money(advance.total_collected) }}</div></div>
          <div><div class="text-xs uppercase text-gray-600">Total Adjusted Against Bills</div><div class="text-lg font-semibold">{{ money(advance.total_adjusted) }}</div></div>
          <div><div class="text-xs uppercase text-gray-600">Balance</div><div class="text-lg font-semibold">{{ money(advance.balance) }}</div></div>
        </div>
        <div v-if="(doc.advance_tracking || []).length" class="overflow-x-auto rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th class="px-3 py-2">Date & Time</th><th class="px-3 py-2">Type</th><th class="px-3 py-2 text-right">Amount</th><th class="px-3 py-2 text-right">Available Amount</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in doc.advance_tracking" :key="r.name" class="border-b border-gray-100 last:border-0">
                <td class="px-3 py-2">{{ formatValue({ fieldtype: 'Datetime' }, r.entry_date) }}</td>
                <td class="px-3 py-2">{{ r.type }}</td>
                <td class="px-3 py-2 text-right">{{ money(r.amount) }}</td>
                <td class="px-3 py-2 text-right">{{ money(r.available_amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-sm text-gray-600">No advance collected yet.</p>
      </section>

      <!-- Patient Demographics (fetched from the patient; editable on the visit, as in Desk) -->
      <section id="sec-patient" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <button type="button" class="block w-full text-left" :aria-expanded="showPatient" @click="showPatient = !showPatient">
          <SubHeading icon="user-round">
            Patient details on this visit
            <template #end><span class="text-sm text-brand-700">{{ showPatient ? 'Hide' : 'Show' }}</span></template>
          </SubHeading>
        </button>
        <template v-if="showPatient">
          <div :class="GRID">
            <LinkField id="uhin_id" v-model="doc.uhin_id" doctype="Patient Registration" label="UHIN ID" reqd :readonly="!canWrite" />
            <TextField id="first_name" v-model="doc.first_name" label="First Name" reqd :readonly="!canWrite" />
            <TextField id="last_name" v-model="doc.last_name" label="Last Name" :readonly="!canWrite" />
            <TextField id="patient_name" :model-value="doc.patient_name" label="Full Name" readonly />
            <SelectField id="sex" v-model="doc.sex" label="Gender" :options="OPTIONS.sex" reqd :readonly="!canWrite" />
            <TextField id="dob" v-model="doc.dob" type="date" label="Date of birth" :readonly="!canWrite" />
            <TextField id="age" :model-value="doc.age || ''" label="Age" readonly />
            <SelectField id="blood_group" v-model="doc.blood_group" label="Blood Group" :options="OPTIONS.blood_group" :readonly="!canWrite" />
            <SelectField id="marital_status" v-model="doc.marital_status" label="Marital Status" :options="OPTIONS.marital_status" :readonly="!canWrite" />
            <TextField id="phone" v-model="doc.phone" type="tel" inputmode="numeric" maxlength="10" label="Phone" :readonly="!canWrite" />
          </div>
          <TextField id="address" v-model="doc.address" type="textarea" label="Address" :readonly="!canWrite" />
        </template>
      </section>

      <RecordActivity :doc="doc" />
    </form>
    <p v-else-if="!loadError" class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import BedChooser from '@/components/ward/BedChooser.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { api, getValue, errorText, VISIT } from '@/data/api'
import { hasRole } from '@/data/session'
import { formatValue } from '@/data/meta'
import { OPTIONS, FIXED_BILLING_CATEGORIES, cleanPhone, isAfterHours, flt, billingTotals } from '@/data/registrationRules'
import { VISIT_OPTIONS, VISIT_FROM_PATIENT, money, toDatetimeInput, fromDatetimeInput, useUnsavedGuard } from '@/data/ward/rules'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'

const doc = ref(null)
const original = ref({})
const snapshot = ref('')
const perms = ref({})
const loadError = ref('')
const adj = ref(null)
const advance = ref(null)
const billing = ref(null)
const summaryName = ref('')
const transfers = ref([])
const bedKey = ref(0)
const showPatient = ref(false)

const saving = ref(false)
const tried = ref(false)
const saveError = ref('')
const staleDoc = ref(false)
const savedNote = ref('')
const printing = ref(false)

// Rules react to what the user changes, never to the record being loaded.
let ready = false

const isIP = computed(() => doc.value?.registration_category === 'IP')
const canWrite = computed(() => !!perms.value.write)
// refresh(): Admission Status is read-only unless Doctor / System Manager.
const canChangeStatus = computed(() => hasRole('Doctor'))
const dirty = computed(() => !!doc.value && JSON.stringify(doc.value) !== snapshot.value)
// Section chips: IP and OP visits show different sections.
const sections = computed(() =>
  isIP.value
    ? [
        { id: 'sec-ip', label: 'IP Details' },
        { id: 'sec-mlc', label: 'MLC' },
        { id: 'sec-visit', label: 'Visit' },
        { id: 'sec-advance', label: 'Advance' },
        { id: 'sec-patient', label: 'Patient details' },
      ]
    : [
        { id: 'sec-visit', label: 'Visit' },
        { id: 'sec-fee', label: 'Registration fee' },
        { id: 'sec-patient', label: 'Patient details' },
      ],
)
const showCompany = computed(() => !!doc.value?.billing_category && !FIXED_BILLING_CATEGORIES.includes(doc.value.billing_category))

// calculate_billing_totals + update_charity_field_labels
const totals = computed(() => (doc.value ? billingTotals(doc.value, adj.value) : { discount_amount: 0, net_amount: 0 }))
const labels = computed(() => (totals.value.adjustmentType === 'Increase' ? { percent: 'TDS %', amount: 'TDS Amount' } : { percent: 'Charity %', amount: 'Charity Amount' }))

const mlc = computed({
  get: () => !!doc.value?.is_mlc_case,
  set: (v) => (doc.value.is_mlc_case = v ? 1 : 0),
})
const policeTime = computed({
  get: () => toDatetimeInput(doc.value?.police_intimation_datetime),
  set: (v) => (doc.value.police_intimation_datetime = fromDatetimeInput(v)),
})

// Desk's mandatory fields (reqd + mandatory_depends_on) and the server's
// own refusals that can be seen before saving, with the server's words.
const problems = computed(() => {
  const d = doc.value
  if (!d) return []
  const out = []
  if (!d.uhin_id) out.push('UHIN ID')
  if (!d.first_name) out.push('First Name')
  if (!d.sex) out.push('Gender')
  if (!isIP.value && totals.value.net_amount > 0 && d.payment_mode === 'Credit - Corporate' && !d.corporate_customer) out.push('Corporate Customer')
  if (isIP.value && d.is_mlc_case && !d.mlc_no) out.push('MLC No is required when this is marked as an MLC (Medico-Legal Case).')
  if (isIP.value && d.admission_status === 'Discharged' && d.discharge_date && d.admission_date && d.discharge_date < d.admission_date) {
    out.push(`Discharge Date cannot be before Admission Date (${d.admission_date}).`)
  }
  return out
})

// Billing indicator, shown on a saved Discharged admission (Desk refresh()).
const billingIndicator = computed(() => {
  const s = billing.value
  if (!s) return null
  if (!s.discharge_bill) return { ok: false, text: 'Billing: Discharge Bill not yet generated' }
  if (!s.completed) return { ok: false, text: `Billing: ${money(s.balance_due)} still due on ${s.discharge_bill}` }
  return { ok: true, text: 'Billing: Completed' }
})
const summaryButton = computed(() => isIP.value && original.value.admission_status === 'Discharged' && !!billing.value?.completed)

async function load() {
  ready = false
  loadError.value = ''
  saveError.value = ''
  staleDoc.value = false
  tried.value = false
  try {
    const [d, p] = await Promise.all([
      call('frappe.client.get', { doctype: 'Patient Visit', name: props.name }),
      call('metta.api.get_doc_permissions', { doctype: 'Patient Visit', name: props.name }),
    ])
    setDoc(d)
    perms.value = p || {}
  } catch (err) {
    loadError.value = errorText(err) || `Visit ${props.name} could not be opened.`
    return
  }
  // refresh(): an existing visit's category adjustment, without changing
  // its saved percent, so the Discount preview is right straight away.
  if (doc.value.billing_category) {
    try {
      adj.value = (await api(`${VISIT}.get_category_adjustment`, { billing_category: doc.value.billing_category })) || null
    } catch {
      adj.value = null
    }
  }
  await nextTick()
  ready = true
  loadSideInfo()
}

function setDoc(d) {
  doc.value = d
  original.value = JSON.parse(JSON.stringify(d))
  snapshot.value = JSON.stringify(d)
  bedKey.value++
}

// The IP extras Desk shows on refresh(): transfer history, advance
// (fetched eagerly for the low-advance warning) and billing status.
async function loadSideInfo() {
  if (!isIP.value) return
  api(`${VISIT}.get_bed_transfer_history`, { patient_visit: props.name })
    .then((rows) => (transfers.value = rows || []))
    .catch(() => (transfers.value = []))
  api('metta.sales.doctype.patient_advance.patient_advance.get_advance_balance', { patient_visit: props.name })
    .then((r) => (advance.value = r || null))
    .catch(() => (advance.value = null))
  billing.value = null
  summaryName.value = ''
  if (original.value.admission_status !== 'Discharged') return
  try {
    billing.value = (await api('metta.sales.doctype.discharge_bill.discharge_bill.get_billing_status', { ip_id: props.name })) || { completed: false, discharge_bill: null, balance_due: 0 }
  } catch {
    // No read access to Discharge Bill: no indicator, as Desk's call fails too.
    billing.value = null
    return
  }
  if (!billing.value.completed) return
  try {
    const rows = await call('frappe.client.get_list', { doctype: 'Discharge Summary', filters: { patient_visit: props.name }, fields: ['name'], limit_page_length: 1 })
    summaryName.value = rows?.[0]?.name || ''
  } catch {
    summaryName.value = ''
  }
}

// Discharge Summary button: an existing summary opens; otherwise the same
// get_discharge_defaults check as Desk, then a new prefilled summary.
async function openDischargeSummary() {
  saveError.value = ''
  if (summaryName.value) {
    router.push({ name: 'WardDischargeSummaryForm', params: { name: summaryName.value } })
    return
  }
  try {
    const defaults = await api(`${VISIT}.get_discharge_defaults`, { patient_visit: props.name })
    router.push({ name: 'WardDischargeSummaryForm', params: { name: 'new' }, query: defaults })
  } catch (err) {
    saveError.value = errorText(err)
  }
}

// phone: digits only, first 10
watch(() => doc.value?.phone, (v) => {
  if (!ready || !v) return
  const digits = cleanPhone(v)
  if (digits !== v) doc.value.phone = digits
})

// uhin_id picked: Desk's fetch_from (uhin_id.*) refills the patient fields;
// charity_percent only when empty (fetch_if_empty).
watch(() => doc.value?.uhin_id, async (uhin) => {
  if (!ready || !uhin) return
  try {
    const reg = await getValue('Patient Registration', uhin, [...Object.values(VISIT_FROM_PATIENT), 'charity_percent'])
    if (!reg || doc.value.uhin_id !== uhin) return
    for (const [visitField, regField] of Object.entries(VISIT_FROM_PATIENT)) doc.value[visitField] = reg[regField] ?? ''
    if (!doc.value.charity_percent) doc.value.charity_percent = reg.charity_percent ?? 0
  } catch {
    // The server re-fetches on save.
  }
})

// department_name: a deliberate pick re-suggests Registration Type even on a
// saved OP visit (suggest_registration_type(frm, true)), clears the doctor,
// and fills in a lone doctor.
watch(() => doc.value?.department_name, async (dept) => {
  if (!ready) return
  suggestRegistrationType()
  if (doc.value.doctor_name) doc.value.doctor_name = ''
  if (!dept) return
  try {
    const doctors = (await api(`${VISIT}.get_doctors_by_department`, { department: dept })) || []
    if (doctors.length === 1 && doc.value.department_name === dept) doc.value.doctor_name = doctors[0]
  } catch {
    // Doctor stays blank.
  }
})

async function suggestRegistrationType() {
  const d = doc.value
  if (!d.uhin_id || isIP.value) return
  const alreadyEmergency = (d.registration_type || '').startsWith('Emergency')
  const isEmergency = alreadyEmergency || d.department_name === 'Emergency' || isAfterHours(d.date, d.time)
  try {
    const revisit = await api(`${VISIT}.has_prior_visit_of_type`, { uhin_id: d.uhin_id, emergency: isEmergency ? 1 : 0 })
    d.registration_type = `${isEmergency ? 'Emergency' : 'General'} ${revisit ? 'Revisit' : 'New Reg'}`
  } catch {
    // Left as it was.
  }
}

// registration_type -> fee_amount (fetch_from registration_type.fee_amount)
watch(() => doc.value?.registration_type, async (type) => {
  if (!ready) return
  if (!type) {
    doc.value.fee_amount = 0
    return
  }
  try {
    const r = await getValue('Registration type Master', type, 'fee_amount')
    if (doc.value.registration_type === type) doc.value.fee_amount = flt(r?.fee_amount)
  } catch {
    // The server re-fetches on save.
  }
})

// billing_category: Patient Visit's handler
watch(() => doc.value?.billing_category, async (category) => {
  if (!ready) return
  const d = doc.value
  if (category !== 'General' && d.charity_amount) d.charity_amount = 0
  if (!category) {
    adj.value = null
    d.charity_percent = 0
    d.adjustment_type = ''
    return
  }
  try {
    const a = (await api(`${VISIT}.get_category_adjustment`, { billing_category: category })) || null
    if (d.billing_category !== category) return
    adj.value = a
    d.charity_percent = flt(a?.charity_percent)
    d.adjustment_type = a?.adjustment_type || ''
    if (category === 'General') d.charity_amount = (flt(d.fee_amount) * flt(d.charity_percent)) / 100
    // Company patients normally go on their employer's credit account - not
    // for IP, where Payment Mode / Corporate Customer are hidden.
    if (d.company_name && !d.payment_mode && !isIP.value) d.payment_mode = 'Credit - Corporate'
  } catch {
    adj.value = null
  }
})

// sync_charity_amount_from_percent / sync_charity_percent_from_amount (General only)
function onCharityPercent(v) {
  doc.value.charity_percent = v
  if (doc.value.billing_category === 'General') doc.value.charity_amount = (flt(doc.value.fee_amount) * flt(v)) / 100
}
function onCharityAmount(v) {
  doc.value.charity_amount = v
  if (doc.value.billing_category === 'General' && flt(doc.value.fee_amount)) doc.value.charity_percent = (flt(v) / flt(doc.value.fee_amount)) * 100
}

// A hidden Payment Mode / Corporate Customer is cleared, never left to block
// the save as a hidden mandatory field.
watch(() => totals.value.net_amount, (net) => {
  if (ready && net <= 0 && doc.value.payment_mode) doc.value.payment_mode = ''
})
watch(() => doc.value?.payment_mode, (mode) => {
  if (ready && mode !== 'Credit - Corporate' && doc.value.corporate_customer) doc.value.corporate_customer = ''
})

// validate_discharge: back to Admitted never keeps a stale discharge date.
watch(() => doc.value?.admission_status, (status) => {
  if (ready && status !== 'Discharged') doc.value.discharge_date = null
})

// MLC unticked: its hidden fields don't stay filled.
watch(() => doc.value?.is_mlc_case, (on) => {
  if (!ready || on) return
  Object.assign(doc.value, { mlc_no: '', mlc_type: '', brought_by: '', police_station: '', police_intimation_datetime: null })
})

async function save() {
  if (!canWrite.value || !dirty.value || saving.value) return
  tried.value = true
  saveError.value = ''
  savedNote.value = ''
  if (problems.value.length) {
    if (!doc.value.first_name || !doc.value.sex || !doc.value.uhin_id) showPatient.value = true
    return
  }
  saving.value = true
  try {
    const payload = {
      ...doc.value,
      charity_percent: doc.value.charity_percent === null || doc.value.charity_percent === undefined ? '' : String(doc.value.charity_percent),
      discount_amount: totals.value.discount_amount,
      net_amount: totals.value.net_amount,
      expected_discharge_date: doc.value.expected_discharge_date || null,
      discharge_date: doc.value.admission_status === 'Discharged' ? doc.value.discharge_date || null : null,
    }
    ready = false
    setDoc(await call('frappe.client.save', { doc: payload }))
    tried.value = false
    savedNote.value = 'Saved.'
    await nextTick()
    ready = true
    loadSideInfo()
  } catch (err) {
    ready = true
    staleDoc.value = err?.exc_type === 'TimestampMismatchError'
    saveError.value = errorText(err) || 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}

// Receipt Preview -> Print Receipt (same print format as Desk)
async function printReceipt() {
  printing.value = true
  saveError.value = ''
  try {
    const html = await api(`${VISIT}.get_receipt_html`, { registration: props.name })
    const w = window.open('', '_blank')
    w.document.open()
    w.document.write(`<html><head><title>${props.name}</title></head><body>${html}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  } catch (err) {
    saveError.value = errorText(err)
  } finally {
    printing.value = false
  }
}

useUnsavedGuard(() => canWrite.value && dirty.value, save)
onMounted(load)
</script>
