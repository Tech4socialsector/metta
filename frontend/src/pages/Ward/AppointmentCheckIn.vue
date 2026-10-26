<template>
  <AppLayout title="Check In" :subtitle="`Appointment ${name}`" :back-to="{ name: 'WardAppointmentForm', params: { name } }">
    <p v-if="loadError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="patient && defaults">
      <section aria-label="Patient" class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-gray-200 bg-white p-5">
        <h1 class="text-[22px] font-semibold">{{ patient.patient_name }}</h1>
        <span class="text-gray-700">{{ [patient.age != null && patient.age !== '' ? `${patient.age} yrs` : '', patient.sex].filter(Boolean).join(' · ') }}</span>
        <span class="text-sm text-gray-700">UHIN <b class="font-mono font-medium">{{ patient.name }}</b></span>
        <span v-if="patient.phone" class="text-sm text-gray-700">Phone {{ patient.phone }}</span>
        <span class="text-sm text-gray-700">Booked with {{ defaults.doctor_name }}</span>
      </section>

      <SavedPanel v-if="saved" title="Checked in" :patient-name="patient.patient_name" :uhin="saved.patient_registration" :visit-name="saved.patient_visit">
        <router-link :to="{ name: 'WardAppointmentList' }" class="flex h-12 items-center rounded-lg border border-gray-300 bg-white px-6 font-semibold hover:bg-gray-50">Back to appointments</router-link>
      </SavedPanel>

      <div v-else class="flex flex-wrap items-start gap-5">
        <form class="flex min-w-0 flex-[999_1_600px] flex-col gap-5" aria-label="New OP visit" @submit.prevent="save">
          <OpVisitFields v-model:billing-category="billingCategory" v-model:company="company" :ov="ov" title="New OP visit" category-editable />
        </form>
        <div class="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <VisitSummary :ov="ov" :missing="ov.missing.value" :tried-save="triedSave" :save-error="saveError" :saving="saving" save-label="Check in" @save="save" />
        </div>
      </div>
    </template>
  </AppLayout>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import OpVisitFields from '@/components/OpVisitFields.vue'
import VisitSummary from '@/components/VisitSummary.vue'
import SavedPanel from '@/components/SavedPanel.vue'
import { api, errorText } from '@/data/api'
import { useOpVisit } from '@/data/useOpVisit'

const props = defineProps({ name: { type: String, required: true } })

const defaults = ref(null)
const patient = ref(null)
const loadError = ref('')
const billingCategory = ref('')
const company = ref('')

const ov = useOpVisit({
  getUhin: () => defaults.value?.uhin_id || '',
  getBillingCategory: () => billingCategory.value,
  getCompany: () => company.value,
})

const saving = ref(false)
const triedSave = ref(false)
const saveError = ref('')
const saved = ref(null)

// Patient Visit billing_category handler (fires on the fetch from the patient too).
watch(billingCategory, (category) => ov.applyCategory(category))

onMounted(async () => {
  try {
    // Desk's Check In button: refuses anything but a Scheduled appointment.
    defaults.value = await api('metta.metta.doctype.appointment.appointment.get_visit_defaults', { appointment: props.name })
    patient.value = await call('frappe.client.get', { doctype: 'Patient Registration', name: defaults.value.uhin_id })
  } catch (err) {
    loadError.value = errorText(err) || `Appointment ${props.name} could not be checked in.`
    return
  }
  company.value = patient.value.corporate_customer || ''
  billingCategory.value = patient.value.billing_category || ''
  // The new visit starts with the booked doctor, as Desk's new form does.
  ov.visit.doctor_name = defaults.value.doctor_name || ''
  // uhin_id set -> suggest_registration_type (Revisit when they've been before)
  ov.suggestRegistrationType()
})

// Saved through metta.vue.ward.check_in_appointment, which links the visit
// to this appointment; the visit's own after_insert marks it Checked-in.
async function save() {
  triedSave.value = true
  saveError.value = ''
  if (ov.missing.value.length) return
  saving.value = true
  try {
    saved.value = await api('metta.vue.ward.check_in_appointment', {
      appointment: props.name,
      visit: { ...ov.payload(), billing_category: billingCategory.value, company_name: company.value },
    })
  } catch (err) {
    saveError.value = errorText(err) || 'Could not check in. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
