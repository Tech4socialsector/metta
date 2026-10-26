<template>
  <AppLayout title="Patient" :subtitle="uhin" :back-to="{ name: 'PatientList' }">

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <template v-if="patient">
      <section aria-label="Patient" class="flex flex-wrap items-center gap-5 rounded-xl border border-gray-200 bg-white p-5">
        <div class="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-brand-50 text-xl font-bold text-brand-800">{{ initial }}</div>
        <div class="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
          <div class="flex flex-wrap items-baseline gap-2.5">
            <h1 class="text-[22px] font-semibold">{{ patient.patient_name }}</h1>
            <span class="text-gray-700">{{ [patient.age != null && patient.age !== '' ? `${patient.age} yrs` : '', patient.sex, patient.marital_status].filter(Boolean).join(' · ') }}</span>
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
            <span><span class="text-gray-600">UHIN</span> <b class="font-mono font-medium">{{ patient.name }}</b></span>
            <span v-if="patient.phone"><span class="text-gray-600">Phone</span> {{ patient.phone }}</span>
            <span v-if="patient.blood_group"><span class="text-gray-600">Blood group</span> {{ patient.blood_group }}</span>
            <span><span class="text-gray-600">Category</span> {{ patient.billing_category || '—' }}</span>
          </div>
        </div>
        <router-link :to="{ name: 'WardPatientEdit', params: { uhin: patient.name } }" class="flex h-11 items-center rounded-lg border border-gray-300 bg-white px-5 font-semibold hover:bg-gray-50">Edit</router-link>
        <router-link :to="{ name: 'NewVisit', params: { uhin: patient.name } }" class="flex h-11 items-center rounded-lg bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">New OP visit</router-link>
      </section>

      <div role="tablist" aria-label="Patient record" class="flex gap-1 border-b border-gray-200">
        <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" class="-mb-px h-11 border-b-[3px] px-4 font-medium" :class="tab === t.id ? 'border-brand-700 font-semibold text-brand-800' : 'border-transparent text-gray-600 hover:text-gray-900'" @click="tab = t.id">
          {{ t.label }}<span v-if="t.count != null" class="ml-1.5 rounded-full bg-gray-100 px-2 text-xs text-gray-700">{{ t.count }}</span>
        </button>
      </div>

      <RecordView v-if="tab === 'details'" doctype="Patient Registration" :doc="patient" />

      <section v-else class="rounded-xl border border-gray-200 bg-white">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] border-collapse">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-gray-600">
                <th class="px-5 py-3 font-semibold">Visit</th>
                <th class="px-3 py-3 font-semibold">Type</th>
                <th class="px-3 py-3 font-semibold">Date</th>
                <th class="px-3 py-3 font-semibold">Department · Doctor</th>
                <th class="px-5 py-3 text-right font-semibold">Net amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!visits.length">
                <td colspan="5" class="px-5 py-6 text-center text-gray-600">No visits yet.</td>
              </tr>
              <tr v-for="v in visits" :key="v.name" class="border-t border-gray-100 hover:bg-gray-50">
                <td class="px-5 py-3 font-mono text-sm"><router-link :to="{ name: 'VisitView', params: { name: v.name } }" class="text-brand-700 hover:underline">{{ v.name }}</router-link></td>
                <td class="px-3 py-3">
                  {{ v.registration_category }}<span v-if="v.registration_category === 'IP'" class="text-gray-600"> · {{ v.admission_status }}</span>
                </td>
                <td class="px-3 py-3">{{ v.date || '—' }}</td>
                <td class="px-3 py-3">{{ [v.department_name, v.doctor_name].filter(Boolean).join(' · ') || '—' }}</td>
                <td class="px-5 py-3 text-right">₹{{ Number(v.net_amount || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import RecordView from '@/components/RecordView.vue'
import { errorText } from '@/data/api'

const props = defineProps({ uhin: { type: String, required: true } })

const patient = ref(null)
const visits = ref([])
const loadError = ref('')
const tab = ref('visits')

const initial = computed(() => (patient.value?.patient_name || '?').trim().charAt(0).toUpperCase())
const tabs = computed(() => [
  { id: 'visits', label: 'Visits', count: visits.value.length },
  { id: 'details', label: 'Registration details', count: null },
])

onMounted(async () => {
  try {
    patient.value = await call('frappe.client.get', { doctype: 'Patient Registration', name: props.uhin })
  } catch (err) {
    loadError.value = errorText(err) || `Patient ${props.uhin} could not be opened.`
    return
  }
  try {
    visits.value = await call('frappe.client.get_list', {
      doctype: 'Patient Visit',
      filters: { uhin_id: props.uhin },
      fields: ['name', 'registration_category', 'admission_status', 'date', 'department_name', 'doctor_name', 'net_amount'],
      order_by: 'creation desc',
      limit_page_length: 0,
    })
  } catch {
    visits.value = []
  }
})
</script>
