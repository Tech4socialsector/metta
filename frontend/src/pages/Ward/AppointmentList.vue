<template>
  <AppLayout title="Appointments" subtitle="Booked visits; Check In turns one into today's OP visit">
    <template #actions>
      <router-link v-if="canCreate" :to="{ name: 'WardAppointmentForm', params: { name: 'new' } }" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">+ New appointment</router-link>
    </template>
    <DataList doctype="Appointment" :tabs="tabs" :row-route="(r) => ({ name: 'WardAppointmentForm', params: { name: r.name } })" :auto-refresh="60" />
  </AppLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { todayStr } from '@/data/registrationRules'

// Today first: the counter works through today's bookings.
const tabs = [
  { label: 'Today', filters: [['appointment_date', '=', todayStr()]] },
  { label: 'Scheduled', filters: [['status', '=', 'Scheduled']] },
  { label: 'All', filters: [] },
]

const canCreate = ref(false)
onMounted(async () => {
  try {
    canCreate.value = !!(await call('metta.api.get_doc_permissions', { doctype: 'Appointment' }))?.create
  } catch {
    canCreate.value = false
  }
})
</script>
