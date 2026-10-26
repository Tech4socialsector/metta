<template>
  <AppLayout title="Edit patient" :back-to="{ name: 'PatientView', params: { uhin } }">
    <!-- Option C: saved state + UHIN under the title, one Save at the top. -->
    <template v-if="reg" #meta>
      <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="dirty ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'">{{ dirty ? 'Unsaved changes' : 'Saved' }}</span>
        <span class="font-mono">{{ uhin }}</span>
      </div>
    </template>
    <template v-if="reg && canWrite && dirty" #actions>
      <button type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" @click="load">Discard</button>
      <button type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save changes' }}</button>
    </template>

    <p v-if="loadError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-if="reg" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <PatientBar :name="reg.patient_name" :age="reg.age" :gender="reg.sex" :uhin="reg.name" />
      <SectionJump :sections="SECTIONS" />

      <p v-if="!canWrite" class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">You can view this patient but not change them.</p>

      <!-- One red block under the patient bar, seen after Save at the top. -->
      <div v-if="saveError || (tried && missing.length)" class="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <div>
          <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
          <p v-else><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
        </div>
        <button v-if="saveError && staleDoc" type="button" class="h-8 shrink-0 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="load">Reload latest</button>
      </div>
      <p v-if="savedNote" class="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{{ savedNote }}</p>

      <!-- check_duplicate_phone: a warning, never a block -->
      <section v-if="duplicates.length" class="flex flex-col gap-2 rounded-xl border border-amber-300 bg-white p-4">
        <h2 class="font-semibold text-amber-900">Possible Duplicate Patient</h2>
        <p class="text-sm text-gray-700">A patient with this phone number is already registered:</p>
        <ul class="list-disc pl-5 text-sm">
          <li v-for="d in duplicates" :key="d.name">
            <router-link :to="{ name: 'PatientView', params: { uhin: d.name } }" class="text-brand-700 hover:underline">{{ d.patient_name || d.name }}</router-link> ({{ d.uid || d.name }})
          </li>
        </ul>
        <p class="text-sm text-gray-700">Please confirm this isn't the same person before continuing.</p>
      </section>

      <!-- Patient Demographics -->
      <section id="sec-details" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="user-round">Patient details</SubHeading>
        <div :class="GRID">
          <TextField id="first_name" v-model="reg.first_name" label="First Name" reqd :readonly="!canWrite" />
          <TextField id="last_name" v-model="reg.last_name" label="Last Name" :readonly="!canWrite" />
          <TextField id="patient_name" :model-value="reg.patient_name" label="Full Name" readonly />
          <SelectField id="sex" v-model="reg.sex" label="Gender" :options="OPTIONS.sex" reqd :readonly="!canWrite" />
          <TextField id="dob" v-model="reg.dob" type="date" label="Date of Birth" :readonly="!canWrite" />
          <TextField id="age" v-model="reg.age" type="number" inputmode="numeric" label="Age" :readonly="!canWrite || !!reg.dob" />
          <SelectField id="blood_group" v-model="reg.blood_group" label="Blood Group" :options="OPTIONS.blood_group" :readonly="!canWrite" />
          <SelectField id="marital_status" v-model="reg.marital_status" label="Marital Status" :options="OPTIONS.marital_status" :readonly="!canWrite" />
          <TextField id="phone" v-model="reg.phone" type="tel" inputmode="numeric" maxlength="10" label="Phone" :readonly="!canWrite" @change="checkDuplicatePhone" />
          <TextField id="email" v-model="reg.email" type="email" label="Email" :readonly="!canWrite" />
        </div>
      </section>

      <section id="sec-address" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="map-pin">Address</SubHeading>
        <div :class="GRID">
          <TextField id="pin_code" v-model="reg.pin_code" inputmode="numeric" maxlength="6" label="Pin Code" :hint="pinHint" :readonly="!canWrite" />
          <TextField id="state" v-model="reg.state" label="State" :readonly="!canWrite" />
          <TextField id="district" v-model="reg.district" label="District" :readonly="!canWrite" />
          <!-- Village: Pin Code villages are suggestions; any name may be typed. -->
          <TextField id="address" v-model="reg.address" label="Village" list="village-options" :readonly="!canWrite" />
        </div>
        <!-- outside the grid, so it doesn't count as a field in row-fit -->
        <datalist id="village-options">
          <option v-for="v in villages" :key="v" :value="v"></option>
        </datalist>
      </section>

      <section id="sec-emergency" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="phone">Emergency contact</SubHeading>
        <div :class="GRID">
          <TextField id="emergency_contact_name" v-model="reg.emergency_contact_name" label="Emergency Contact Name" :readonly="!canWrite" />
          <TextField id="emergency_phone_number" v-model="reg.emergency_phone_number" type="tel" inputmode="numeric" maxlength="10" label="Emergency Phone Number" :readonly="!canWrite" />
          <SelectField id="relationship_to_the_patient" v-model="reg.relationship_to_the_patient" label="Relationship to the Patient" :options="OPTIONS.relationship_to_the_patient" :readonly="!canWrite" />
          <TextField v-if="reg.relationship_to_the_patient === 'Other'" id="relationship_other" v-model="reg.relationship_other" label="Specify Relationship" reqd :readonly="!canWrite" />
        </div>
      </section>

      <!-- Billing Category -->
      <section id="sec-billing" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="wallet">Billing category</SubHeading>
        <div :class="GRID">
          <LinkField id="billing_category" v-model="reg.billing_category" doctype="Category Price Adjustment" label="Billing Category" :readonly="!canWrite" />
          <LinkField v-if="showCompany" id="corporate_customer" v-model="reg.corporate_customer" doctype="Corporate Customer" label="Company Name" :readonly="!canWrite" />
          <TextField v-if="reg.corporate_customer" id="staff_id" v-model="reg.staff_id" label="Company Staff Code" :readonly="!canWrite" />
          <TextField v-if="reg.corporate_customer" id="gst_number" :model-value="reg.gst_number || ''" label="GSTIN Number" readonly />
          <SelectField v-if="reg.billing_category === 'Staff Dependent'" id="dependent_relationship" v-model="reg.dependent_relationship" label="Relationship to Staff" :options="OPTIONS.dependent_relationship" :readonly="!canWrite" />
          <TextField id="charity_percent" :model-value="String(reg.charity_percent ?? 0)" :label="charityLabel" readonly />
          <SelectField id="default_currency" v-model="reg.default_currency" label="Billing Currency" :options="OPTIONS.default_currency" :readonly="!canWrite" />
        </div>
        <p v-if="agedOutNote" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{{ agedOutNote }}</p>
      </section>

      <RecordActivity :doc="reg" />
    </form>
    <p v-else-if="!loadError" class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { api, getValue, errorText, REG, VISIT } from '@/data/api'
import { OPTIONS, FIXED_BILLING_CATEGORIES, cleanPhone, fullName, ageFromDob, dependentAgedOut, flt } from '@/data/registrationRules'
import { useUnsavedGuard } from '@/data/ward/rules'

const props = defineProps({ uhin: { type: String, required: true } })

// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'
const SECTIONS = [
  { id: 'sec-details', label: 'Patient details' },
  { id: 'sec-address', label: 'Address' },
  { id: 'sec-emergency', label: 'Emergency contact' },
  { id: 'sec-billing', label: 'Billing category' },
]

const reg = ref(null)
const snapshot = ref('')
const perms = ref({})
const loadError = ref('')
const villages = ref([])
const pinHint = ref('')
const duplicates = ref([])
const charityLabel = ref('Charity Percent')
const agedOutNote = ref('')

const saving = ref(false)
const tried = ref(false)
const saveError = ref('')
const staleDoc = ref(false)
const savedNote = ref('')

// Rules react to what the user changes, never to the record being loaded.
let ready = false

const canWrite = computed(() => !!perms.value.write)
const dirty = computed(() => !!reg.value && JSON.stringify(reg.value) !== snapshot.value)
// depends_on for Company Name
const showCompany = computed(() => !!reg.value?.billing_category && !FIXED_BILLING_CATEGORIES.includes(reg.value.billing_category))

// reqd + mandatory_depends_on
const missing = computed(() => {
  const r = reg.value
  if (!r) return []
  const m = []
  if (!r.first_name) m.push('First Name')
  if (!r.sex) m.push('Gender')
  if (r.relationship_to_the_patient === 'Other' && !r.relationship_other) m.push('Specify Relationship')
  return m
})

async function load() {
  ready = false
  loadError.value = ''
  saveError.value = ''
  staleDoc.value = false
  tried.value = false
  duplicates.value = []
  agedOutNote.value = ''
  try {
    const [d, p] = await Promise.all([
      call('frappe.client.get', { doctype: 'Patient Registration', name: props.uhin }),
      call('metta.api.get_doc_permissions', { doctype: 'Patient Registration', name: props.uhin }),
    ])
    setDoc(d)
    perms.value = p || {}
  } catch (err) {
    loadError.value = errorText(err) || `Patient ${props.uhin} could not be opened.`
    return
  }
  // refresh(): the Charity / TDS label for the saved category.
  updateCharityLabel(reg.value.billing_category)
  await nextTick()
  ready = true
}

function setDoc(d) {
  reg.value = d
  snapshot.value = JSON.stringify(d)
}

// update_charity_percent_label: TDS Percent for an active Increase category.
async function updateCharityLabel(category) {
  if (!category) {
    charityLabel.value = 'Charity Percent'
    return
  }
  try {
    const a = (await api(`${REG}.get_category_adjustment`, { billing_category: category })) || {}
    charityLabel.value = a.charity_status === 'Active' && a.adjustment_type === 'Increase' ? 'TDS Percent' : 'Charity Percent'
  } catch {
    charityLabel.value = 'Charity Percent'
  }
}

// first_name / last_name -> update_patient_name_preview
watch(() => [reg.value?.first_name, reg.value?.last_name], () => {
  if (ready) reg.value.patient_name = fullName(reg.value.first_name, reg.value.last_name)
})

// dob -> update_age_preview (no DOB keeps the typed age) + aged-out check
watch(() => reg.value?.dob, (dob) => {
  if (!ready) return
  if (dob) reg.value.age = ageFromDob(dob)
  checkDependentAgedOut()
})
// age / dependent_relationship -> check_dependent_aged_out_preview
watch(() => [reg.value?.age, reg.value?.dependent_relationship], () => {
  if (ready) checkDependentAgedOut()
})

function checkDependentAgedOut() {
  if (reg.value.billing_category !== 'Staff Dependent') return
  if (dependentAgedOut(reg.value.dependent_relationship, reg.value.age)) {
    agedOutNote.value = 'A Staff Dependent son or daughter aged 21 or over is billed as General.'
    reg.value.billing_category = 'General'
  }
}

// phone / emergency_phone_number: digits only, first 10
watch(() => reg.value?.phone, (v) => {
  if (!ready || !v) return
  const digits = cleanPhone(v)
  if (digits !== v) reg.value.phone = digits
})
watch(() => reg.value?.emergency_phone_number, (v) => {
  if (!ready || !v) return
  const digits = cleanPhone(v)
  if (digits !== v) reg.value.emergency_phone_number = digits
})

// check_duplicate_phone - this patient itself excluded. (The CHW match is
// only for a brand-new registration, as in Desk.)
async function checkDuplicatePhone() {
  duplicates.value = []
  if (!reg.value.phone) return
  try {
    duplicates.value = (await api(`${REG}.find_possible_duplicates`, { phone: reg.value.phone, exclude: props.uhin })) || []
  } catch {
    duplicates.value = []
  }
}

// pin_code -> get_location_by_pincode (6 digits only)
watch(() => reg.value?.pin_code, async (v) => {
  if (!ready) return
  const pincode = String(v || '')
  if (!/^\d{6}$/.test(pincode)) {
    pinHint.value = ''
    return
  }
  pinHint.value = 'Looking up…'
  try {
    const data = await api(`${REG}.get_location_by_pincode`, { pincode })
    if (!data) return
    reg.value.state = data.state || ''
    reg.value.district = data.district || ''
    villages.value = data.villages || []
    if (villages.value.length === 1) reg.value.address = villages.value[0]
    else if (villages.value.length > 1) reg.value.address = ''
    pinHint.value = ''
  } catch (err) {
    pinHint.value = errorText(err)
  }
})

// relationship_to_the_patient: stale "Other" text is cleared
watch(() => reg.value?.relationship_to_the_patient, (v) => {
  if (ready && v !== 'Other' && reg.value.relationship_other) reg.value.relationship_other = ''
})

// corporate_customer: picking fills Billing Category + GSTIN (fetch_from);
// clearing clears Staff Code and any company-driven category.
watch(() => reg.value?.corporate_customer, async (company) => {
  if (!ready) return
  const r = reg.value
  if (!company) {
    if (r.staff_id) r.staff_id = ''
    r.gst_number = ''
    if (r.billing_category && !FIXED_BILLING_CATEGORIES.includes(r.billing_category)) r.billing_category = ''
    return
  }
  try {
    const cc = await getValue('Corporate Customer', company, ['billing_category', 'gst_number'])
    if (r.corporate_customer !== company) return
    r.gst_number = cc?.gst_number || ''
    if (cc?.billing_category) r.billing_category = cc.billing_category
  } catch {
    // The server re-fetches on save.
  }
})

// billing_category: fixed category clears Company; leaving Staff Dependent
// clears Relationship to Staff; label; charity % preview (the server
// re-reads it from the category on save, and General is always 0).
watch(() => reg.value?.billing_category, async (category) => {
  if (!ready) return
  const r = reg.value
  if (category !== 'General') agedOutNote.value = ''
  if (FIXED_BILLING_CATEGORIES.includes(category) && r.corporate_customer) r.corporate_customer = ''
  if (category !== 'Staff Dependent' && r.dependent_relationship) r.dependent_relationship = ''
  updateCharityLabel(category)
  if (!category || category === 'General') {
    r.charity_percent = 0
    return
  }
  try {
    const a = await api(`${VISIT}.get_category_adjustment`, { billing_category: category })
    if (r.billing_category === category) r.charity_percent = flt(a?.charity_percent)
  } catch {
    // The server sets it on save.
  }
})

async function save() {
  if (!canWrite.value || !dirty.value || saving.value) return
  tried.value = true
  saveError.value = ''
  savedNote.value = ''
  if (missing.value.length) return
  saving.value = true
  try {
    const r = reg.value
    const payload = { ...r, pin_code: r.pin_code ? parseInt(r.pin_code, 10) : null, age: r.age === '' || r.age === null ? null : parseInt(r.age, 10) }
    ready = false
    setDoc(await call('frappe.client.save', { doc: payload }))
    tried.value = false
    savedNote.value = 'Saved.'
    await nextTick()
    ready = true
  } catch (err) {
    ready = true
    staleDoc.value = err?.exc_type === 'TimestampMismatchError'
    saveError.value = errorText(err) || 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}

useUnsavedGuard(() => canWrite.value && dirty.value, save)
onMounted(load)
</script>
