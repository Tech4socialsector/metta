<template>
  <AppLayout title="New OP visit" subtitle="Returning patient - registration is not repeated, only today's visit is added" :back-to="{ name: 'Home' }">

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="patient">
      <SavedPanel v-if="saved" title="Visit created" :patient-name="patient.patient_name" :uhin="saved.patient_registration" :visit-name="saved.patient_visit">
        <router-link :to="{ name: 'Home' }" class="flex h-12 items-center rounded-lg border border-gray-300 bg-white px-6 font-semibold hover:bg-gray-50">Next patient</router-link>
      </SavedPanel>

      <!-- Same two sections as New registration. Left: who the patient is
      (registration happens once - edited on the patient record). Right:
      today's OP visit, saved by metta.api.create_op_visit. -->
      <form v-else class="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" aria-label="New OP visit" @submit.prevent="save">
        <section class="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
          <SectionTitle icon="users-round" title="Patient">
            <router-link :to="{ name: 'PatientView', params: { uhin: patient.name } }" class="ml-auto text-sm font-semibold text-white underline-offset-2 hover:underline">View patient</router-link>
          </SectionTitle>

          <SubHeading icon="user-round">Basic details</SubHeading>
          <dl class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <div v-for="f in facts" :key="f.label" class="flex min-w-0 flex-col gap-1">
              <dt class="text-sm font-medium text-gray-800">{{ f.label }}</dt>
              <dd class="flex h-11 items-center truncate rounded-lg border border-gray-200 bg-gray-50 px-3 text-[15px] text-gray-800">{{ f.value || '—' }}</dd>
            </div>
          </dl>

          <SubHeading icon="history">Past visits</SubHeading>
          <p v-if="!pastVisits.length" class="text-sm text-gray-600">No earlier visits.</p>
          <div v-else class="flex flex-col">
            <router-link v-for="v in pastVisits" :key="v.name" :to="{ name: 'VisitView', params: { name: v.name } }" class="flex items-center justify-between gap-3 border-b border-gray-100 px-1 py-2.5 text-sm last:border-0 hover:bg-gray-50">
              <span><b class="font-mono font-medium text-brand-700">{{ v.name }}</b> <span class="text-gray-600">· {{ v.department_name || '—' }}</span></span>
              <span class="text-gray-600">{{ v.date }}</span>
            </router-link>
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
          <SectionTitle icon="calendar-clock" title="Today's OP Visit">
            <span class="rounded-md bg-accent-500 px-2 py-0.5 text-xs font-bold text-white">OP</span>
          </SectionTitle>
          <OpVisitFields v-model:billing-category="billingCategory" v-model:company="company" :ov="ov" category-editable panel wide />

          <div v-if="ov.missing.value.length && triedSave" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><b>Missing required fields:</b> {{ ov.missing.value.join(', ') }}</div>
          <p v-if="saveError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ saveError }}</p>
          <div class="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <router-link :to="{ name: 'Home' }" class="flex h-11 items-center rounded-lg border border-gray-300 bg-white px-6 font-semibold hover:bg-gray-50">Cancel</router-link>
            <button type="button" data-save class="h-11 rounded-lg bg-brand-700 px-6 font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Create OP visit' }}</button>
          </div>
        </section>
      </form>
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import OpVisitFields from '@/components/OpVisitFields.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import SubHeading from '@/components/SubHeading.vue'
import SavedPanel from '@/components/SavedPanel.vue'
import { api, errorText } from '@/data/api'
import { useOpVisit } from '@/data/useOpVisit'

const props = defineProps({ uhin: { type: String, required: true } })

const patient = ref(null)
const pastVisits = ref([])
const loadError = ref('')
// The visit's own Billing Category / Company Name - in Desk these are
// fetched from the patient (uhin_id.*) and can then be changed per visit.
const billingCategory = ref('')
const company = ref('')

const ov = useOpVisit({
  getUhin: () => props.uhin,
  getBillingCategory: () => billingCategory.value,
  getCompany: () => company.value,
})

const saving = ref(false)
const triedSave = ref(false)
const saveError = ref('')
const saved = ref(null)

// The patient as Front Desk confirms them - read-only here, as Desk's
// fetch_from fields are on the visit.
const facts = computed(() => {
  const p = patient.value || {}
  return [
    { label: 'Full Name', value: p.patient_name },
    { label: 'UHIN', value: p.name },
    { label: 'Gender', value: p.sex },
    { label: 'Age', value: p.age != null && p.age !== '' ? `${p.age} yrs` : '' },
    { label: 'Phone', value: p.phone },
    { label: 'Blood Group', value: p.blood_group },
    { label: 'Billing Category', value: p.billing_category },
    { label: 'Company', value: p.corporate_customer },
    { label: 'Village', value: p.address },
  ]
})

// Patient Visit billing_category handler (fires on the fetch from the
// patient too, as in Desk).
watch(billingCategory, (category) => ov.applyCategory(category))

onMounted(async () => {
  try {
    patient.value = await call('frappe.client.get', { doctype: 'Patient Registration', name: props.uhin })
  } catch (err) {
    loadError.value = errorText(err) || `Patient ${props.uhin} could not be opened.`
    return
  }
  company.value = patient.value.corporate_customer || ''
  billingCategory.value = patient.value.billing_category || ''
  // uhin_id set -> suggest_registration_type (Revisit when they've been before)
  ov.suggestRegistrationType()
  try {
    pastVisits.value = await call('frappe.client.get_list', {
      doctype: 'Patient Visit',
      filters: { uhin_id: props.uhin },
      fields: ['name', 'date', 'department_name', 'registration_category'],
      order_by: 'creation desc',
      limit_page_length: 5,
    })
  } catch {
    pastVisits.value = []
  }
})

async function save() {
  triedSave.value = true
  saveError.value = ''
  if (ov.missing.value.length) return
  saving.value = true
  try {
    saved.value = await api('metta.api.create_op_visit', {
      uhin_id: props.uhin,
      visit: { ...ov.payload(), billing_category: billingCategory.value, company_name: company.value },
    })
  } catch (err) {
    saveError.value = errorText(err) || 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
