<template>
  <AppLayout title="New registration" subtitle="First visit only — a returning patient is searched, not registered again" :back-to="{ name: 'Home' }">

    <!-- After a successful save: same next steps Desk offers (Receipt
    Preview / Print Receipt), plus opening both new records in Desk. -->
    <SavedPanel v-if="saved" title="Patient registered" :patient-name="reg.patient_name" :uhin="saved.patient_registration" :visit-name="saved.patient_visit">
      <!-- Back to the Front Desk search: the next patient may be new
      (+ New registration) or already registered (search -> OP visit). -->
      <router-link :to="{ name: 'Home' }" class="flex h-12 items-center rounded-lg border border-gray-300 bg-white px-6 font-semibold hover:bg-gray-50">Next patient</router-link>
    </SavedPanel>

    <template v-else>
      <!-- Phone-number warnings, across the top so neither section is
      pushed down. check_duplicate_phone: a warning, never a block. -->
      <section v-if="duplicates.length" class="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <b>Possible Duplicate Patient</b> - this phone number is already registered:
        <router-link v-for="d in duplicates" :key="d.name" :to="{ name: 'NewVisit', params: { uhin: d.name } }" class="rounded-lg border border-amber-300 bg-white px-2.5 py-1 hover:bg-amber-100">
          <b>{{ d.patient_name || d.name }}</b> ({{ d.uid || d.name }}) <span class="font-semibold text-brand-700">· New OP visit</span>
        </router-link>
        <span>Please confirm this isn't the same person before continuing.</span>
      </section>
      <section v-if="chwLinked" class="rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-brand-900">
        Will link to <b>{{ chwLinked.family_member }}</b>'s Community Health record on save.
        <button type="button" class="ml-1 font-semibold underline" @click="chwLinked = null">Undo</button>
      </section>

      <!-- Two sections: everything about the patient (asked once), and
      today's OP visit with its fee and Save. -->
      <form class="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-label="Patient registration" @submit.prevent="save">
        <section class="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
          <SectionTitle icon="users-round" title="Patient Registration" />

          <!-- Patient Registration · Desk's "Patient Demographics", split into
          sections of three equal columns; fields are written row by row. -->
          <FormSection title="Basic details" icon="user-round">
            <TextField id="first_name" v-model="reg.first_name" label="First Name" reqd />
            <TextField id="last_name" v-model="reg.last_name" label="Last Name" />
            <TextField id="patient_name" :model-value="reg.patient_name" label="Full Name" readonly />
            <SelectField id="sex" v-model="reg.sex" label="Gender" :options="OPTIONS.sex" reqd />
            <TextField id="dob" v-model="reg.dob" type="date" label="Date of Birth" />
            <TextField id="age" v-model="reg.age" type="number" inputmode="numeric" label="Age" :readonly="!!reg.dob" />
            <SelectField id="blood_group" v-model="reg.blood_group" label="Blood Group" :options="OPTIONS.blood_group" />
            <SelectField id="marital_status" v-model="reg.marital_status" label="Marital Status" :options="OPTIONS.marital_status" />
            <TextField id="phone" v-model="reg.phone" type="tel" inputmode="numeric" maxlength="10" label="Phone" @change="onPhoneChange" />
          </FormSection>

          <FormSection title="Contact & emergency" icon="phone">
            <TextField id="email" v-model="reg.email" type="email" label="Email" />
            <TextField id="emergency_contact_name" v-model="reg.emergency_contact_name" label="Emergency Contact Name" />
            <TextField id="emergency_phone_number" v-model="reg.emergency_phone_number" type="tel" inputmode="numeric" maxlength="10" label="Emergency Phone Number" />
            <SelectField id="relationship_to_the_patient" v-model="reg.relationship_to_the_patient" label="Relationship to the Patient" :options="OPTIONS.relationship_to_the_patient" />
            <TextField v-if="reg.relationship_to_the_patient === 'Other'" id="relationship_other" v-model="reg.relationship_other" label="Specify Relationship" reqd />
          </FormSection>

          <FormSection title="Address" icon="map-pin">
            <TextField id="pin_code" v-model="reg.pin_code" inputmode="numeric" maxlength="6" label="Pin Code" :hint="pinHint" />
            <TextField id="state" v-model="reg.state" label="State" />
            <TextField id="district" v-model="reg.district" label="District" />
            <!-- Desk's Village is an Autocomplete with ignore_validation:
            Pin Code villages are suggestions, typing any name is allowed. -->
            <TextField id="address" v-model="reg.address" label="Village" list="village-options" />
          </FormSection>
          <datalist id="village-options">
            <option v-for="v in villages" :key="v" :value="v"></option>
          </datalist>

          <!-- Patient Registration · "Billing Category". The always-shown
          fields fill the first row; company / dependent fields follow. -->
          <FormSection title="Billing category" icon="wallet">
            <LinkField id="billing_category" v-model="reg.billing_category" doctype="Category Price Adjustment" label="Billing Category" />
            <TextField id="reg_charity_percent" :model-value="String(reg.charity_percent ?? 0)" :label="regCharityLabel" readonly />
            <SelectField id="default_currency" v-model="reg.default_currency" label="Billing Currency" :options="OPTIONS.default_currency" />
            <LinkField v-if="showCompany" id="corporate_customer" v-model="reg.corporate_customer" doctype="Corporate Customer" label="Company Name" />
            <TextField v-if="reg.corporate_customer" id="staff_id" v-model="reg.staff_id" label="Company Staff Code" />
            <TextField v-if="reg.corporate_customer" id="gst_number" :model-value="reg.gst_number" label="GSTIN Number" readonly />
            <SelectField v-if="reg.billing_category === 'Staff Dependent'" id="dependent_relationship" v-model="reg.dependent_relationship" label="Relationship to Staff" :options="OPTIONS.dependent_relationship" />
          </FormSection>
          <p v-if="agedOutNote" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{{ agedOutNote }}</p>
        </section>

        <section class="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
          <SectionTitle icon="calendar-clock" title="Today's OP Visit">
            <span class="rounded-md bg-accent-500 px-2 py-0.5 text-xs font-bold text-white">OP</span>
          </SectionTitle>
          <OpVisitFields :ov="ov" :billing-category="reg.billing_category" :company="reg.corporate_customer" panel />

          <div v-if="missing.length && triedSave" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><b>Missing required fields:</b> {{ missing.join(', ') }}</div>
          <p v-if="saveError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ saveError }}</p>
          <div class="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <router-link :to="{ name: 'Home' }" class="flex h-10 items-center rounded-md border border-gray-300 bg-white px-5 text-sm font-semibold hover:bg-gray-50">Cancel</router-link>
            <button type="button" class="h-10 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save registration' }}</button>
          </div>
        </section>
      </form>
    </template>

    <!-- show_chw_match_dialog -->
    <AppDialog v-model="chwDialog" title="Found in Community Health Records">
      <p class="mb-3 text-sm text-gray-700">This phone number is already known to Community Health (CHW). Is this the same person?</p>
      <button v-for="m in chwMatches" :key="m.name" type="button" class="mb-2 flex w-full flex-col rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50" @click="applyChwMatch(m)">
        <span class="font-semibold">{{ m.family_member }}</span>
        <span class="text-xs text-gray-600">{{ [m.age != null ? `Age ${m.age}` : '', m.village, m.relationship].filter(Boolean).join(' · ') }}</span>
      </button>
      <template #footer>
        <button type="button" class="h-10 rounded-lg bg-brand-700 px-4 font-semibold text-white" @click="chwDialog = false">None of these - new person</button>
      </template>
    </AppDialog>
  </AppLayout>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import FormSection from '@/components/FormSection.vue'
import AppDialog from '@/components/AppDialog.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import OpVisitFields from '@/components/OpVisitFields.vue'
import SavedPanel from '@/components/SavedPanel.vue'
import { api, getValue, errorText, REG } from '@/data/api'
import { useOpVisit } from '@/data/useOpVisit'
import { OPTIONS, FIXED_BILLING_CATEGORIES, CHW_GENDER_TO_SEX, cleanPhone, fullName, ageFromDob, dependentAgedOut, flt } from '@/data/registrationRules'

function blankRegistration() {
  return {
    first_name: '',
    last_name: '',
    patient_name: '',
    blood_group: '',
    dob: '',
    age: '',
    sex: '',
    marital_status: '',
    phone: '',
    email: '',
    emergency_contact_name: '',
    emergency_phone_number: '',
    relationship_to_the_patient: '',
    relationship_other: '',
    pin_code: '',
    state: '',
    district: '',
    address: '',
    billing_category: '',
    corporate_customer: '',
    staff_id: '',
    dependent_relationship: '',
    gst_number: '',
    charity_percent: 0,
    default_currency: 'INR',
  }
}

const reg = reactive(blankRegistration())

// A brand-new patient has no UHIN yet, so the visit is always "New Reg".
const ov = useOpVisit({
  getUhin: () => '',
  getBillingCategory: () => reg.billing_category,
  getCompany: () => reg.corporate_customer,
})
ov.suggestRegistrationType()

const villages = ref([])
const pinHint = ref('')
const duplicates = ref([])
const chwMatches = ref([])
const chwDialog = ref(false)
const chwLinked = ref(null)
const regCharityLabel = ref('Charity Percent')
const agedOutNote = ref('')

const saving = ref(false)
const triedSave = ref(false)
const saveError = ref('')
const saved = ref(null)

const showCompany = computed(() => !!reg.billing_category && !FIXED_BILLING_CATEGORIES.includes(reg.billing_category))

// first_name / last_name -> update_patient_name_preview
watch(() => [reg.first_name, reg.last_name], () => {
  reg.patient_name = fullName(reg.first_name, reg.last_name)
})

// dob -> update_age_preview + check_dependent_aged_out_preview
watch(() => reg.dob, () => {
  if (reg.dob) reg.age = ageFromDob(reg.dob)
  checkDependentAgedOut()
})
// age / dependent_relationship -> check_dependent_aged_out_preview
watch(() => [reg.age, reg.dependent_relationship], checkDependentAgedOut)

function checkDependentAgedOut() {
  if (reg.billing_category !== 'Staff Dependent') return
  if (dependentAgedOut(reg.dependent_relationship, reg.age)) {
    agedOutNote.value = 'A Staff Dependent son or daughter aged 21 or over is billed as General.'
    reg.billing_category = 'General'
  }
}

// phone / emergency_phone_number: digits only, first 10
watch(() => reg.phone, (v) => {
  const digits = cleanPhone(v)
  if (digits !== v) reg.phone = digits
})
watch(() => reg.emergency_phone_number, (v) => {
  const digits = cleanPhone(v)
  if (digits !== v) reg.emergency_phone_number = digits
})

async function onPhoneChange() {
  duplicates.value = []
  if (!reg.phone) return
  // check_duplicate_phone
  try {
    duplicates.value = (await api(`${REG}.find_possible_duplicates`, { phone: reg.phone })) || []
  } catch {
    duplicates.value = []
  }
  // check_chw_field_match (always a new registration here)
  try {
    const matches = (await api(`${REG}.find_chw_field_matches`, { phone: reg.phone })) || []
    if (matches.length) {
      chwMatches.value = matches
      chwDialog.value = true
    }
  } catch {
    // CHW lookup is a convenience - a failure never blocks registering.
  }
}

// apply_chw_match: fill only what Front Desk hasn't typed already.
function applyChwMatch(match) {
  const fillIfEmpty = (field, value) => {
    if (!reg[field] && value) reg[field] = value
  }
  fillIfEmpty('first_name', match.family_member)
  fillIfEmpty('sex', CHW_GENDER_TO_SEX[match.gender] || 'Others')
  fillIfEmpty('dob', match.date_of_birth)
  fillIfEmpty('address', match.village)
  chwLinked.value = match
  chwDialog.value = false
}

// pin_code -> get_location_by_pincode (State, District, Village suggestions)
watch(() => reg.pin_code, async (v) => {
  const pincode = String(v || '')
  if (!/^\d{6}$/.test(pincode)) {
    pinHint.value = ''
    return
  }
  pinHint.value = 'Looking up…'
  try {
    const data = await api(`${REG}.get_location_by_pincode`, { pincode })
    if (!data) return
    reg.state = data.state || ''
    reg.district = data.district || ''
    villages.value = data.villages || []
    if (villages.value.length === 1) reg.address = villages.value[0]
    else if (villages.value.length > 1) reg.address = ''
    pinHint.value = ''
  } catch (err) {
    pinHint.value = errorText(err)
  }
})

// relationship_to_the_patient: stale "Other" text is cleared
watch(() => reg.relationship_to_the_patient, (v) => {
  if (v !== 'Other' && reg.relationship_other) reg.relationship_other = ''
})

// corporate_customer: picking fills Billing Category + GSTIN (fetch_from);
// clearing clears Staff Code and any company-driven category.
watch(() => reg.corporate_customer, async (company) => {
  if (!company) {
    if (reg.staff_id) reg.staff_id = ''
    reg.gst_number = ''
    if (reg.billing_category && !FIXED_BILLING_CATEGORIES.includes(reg.billing_category)) reg.billing_category = ''
    return
  }
  try {
    const cc = await getValue('Corporate Customer', company, ['billing_category', 'gst_number'])
    reg.gst_number = cc?.gst_number || ''
    if (cc?.billing_category) reg.billing_category = cc.billing_category
  } catch {
    // Leave the category as picked; the server re-checks on save.
  }
})

// billing_category: Patient Registration's handler, then Patient Visit's
// (on a first visit the visit's category is the patient's own).
watch(() => reg.billing_category, async (category) => {
  if (category !== 'General') agedOutNote.value = ''
  if (FIXED_BILLING_CATEGORIES.includes(category) && reg.corporate_customer) reg.corporate_customer = ''
  if (category !== 'Staff Dependent' && reg.dependent_relationship) reg.dependent_relationship = ''

  if (!category) {
    regCharityLabel.value = 'Charity Percent'
  } else {
    try {
      const adj = (await api(`${REG}.get_category_adjustment`, { billing_category: category })) || {}
      regCharityLabel.value = adj.charity_status === 'Active' && adj.adjustment_type === 'Increase' ? 'TDS Percent' : 'Charity Percent'
    } catch {
      regCharityLabel.value = 'Charity Percent'
    }
  }

  const adj = await ov.applyCategory(category)
  // validate_charity_percent: General is always 0 at registration, every
  // other category shows its own fixed rate.
  reg.charity_percent = !category || category === 'General' ? 0 : flt(adj?.charity_percent)
})

// Desk's mandatory checks (reqd + mandatory_depends_on); the server's own
// validate() still runs on top of these.
const missing = computed(() => {
  const m = []
  if (!reg.first_name) m.push('First Name')
  if (!reg.sex) m.push('Gender')
  if (reg.relationship_to_the_patient === 'Other' && !reg.relationship_other) m.push('Specify Relationship')
  return m.concat(ov.missing.value)
})

async function save() {
  triedSave.value = true
  saveError.value = ''
  if (missing.value.length) return
  saving.value = true
  try {
    const registration = { ...reg, pin_code: reg.pin_code ? parseInt(reg.pin_code, 10) : null, age: reg.age === '' ? null : reg.age }
    saved.value = await api('metta.api.register_patient', {
      registration,
      visit: ov.payload(),
      chw_family_member: chwLinked.value?.name || null,
    })
  } catch (err) {
    saveError.value = errorText(err) || 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
