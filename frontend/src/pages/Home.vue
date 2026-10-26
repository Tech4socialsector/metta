<template>
  <AppLayout title="Front Desk" :subtitle="todayLabel">
    <template #actions>
      <!-- The rest of Desk's Front Desk workspace. -->
      <router-link :to="{ name: 'WardAppointmentList' }" class="flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">Appointments</router-link>
      <router-link :to="{ name: 'WardDischargeSummaryList' }" class="flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">Discharge Summaries</router-link>
      <router-link :to="{ name: 'Register' }" class="flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">+ New registration</router-link>
    </template>

    <PatientSearch />

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>

    <!-- Same figures as the Desk Front Desk Dashboard
    (patient_visit.get_front_desk_dashboard_stats). -->
    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      <div v-for="s in tiles" :key="s.label" class="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-4">
        <span class="text-sm text-gray-600">{{ s.label }}</span>
        <span class="text-2xl font-semibold">{{ s.value }}</span>
      </div>
    </div>

    <section class="rounded-xl border border-gray-200 bg-white">
      <div class="px-5 pb-3 pt-4">
        <SubHeading icon="users-round">
          Today's patients
          <template #end>
            <button type="button" class="h-8 rounded-lg border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-50" @click="load">Refresh</button>
          </template>
        </SubHeading>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] border-collapse">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wide text-gray-600">
              <th class="px-5 py-3 font-semibold">Visit</th>
              <th class="px-3 py-3 font-semibold">Patient</th>
              <th class="px-3 py-3 font-semibold">Type</th>
              <th class="px-3 py-3 font-semibold">Nurse</th>
              <th class="px-3 py-3 font-semibold">Doctor</th>
              <th class="px-5 py-3 text-right font-semibold">Net amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!loading && !flow.length">
              <td colspan="6" class="px-5 py-6 text-center text-gray-600">No visits yet today.</td>
            </tr>
            <tr v-for="v in flow" :key="v.name" class="border-t border-gray-100 hover:bg-gray-50">
              <td class="px-5 py-3 font-mono text-sm">
                <router-link :to="{ name: 'VisitView', params: { name: v.name } }" class="text-brand-700 hover:underline">{{ v.name }}</router-link>
              </td>
              <td class="px-3 py-3 font-semibold">{{ v.patient_name }}</td>
              <td class="px-3 py-3">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="v.registration_category === 'IP' ? 'bg-violet-50 text-violet-800' : 'bg-brand-50 text-brand-800'">{{ v.registration_category }}</span>
              </td>
              <td class="px-3 py-3"><StatusPill :done="v.nurse_done" done-text="Done" pending-text="Pending" /></td>
              <td class="px-3 py-3"><StatusPill :done="v.doctor_seen" done-text="Seen" pending-text="Waiting" /></td>
              <td class="px-5 py-3 text-right">₹{{ Number(v.net_amount || 0).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AppLayout>
</template>

<script setup>
import { computed, h, onMounted, ref } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import SubHeading from '@/components/SubHeading.vue'
import PatientSearch from '@/components/PatientSearch.vue'
import { api, errorText, VISIT } from '@/data/api'

const stats = ref(null)
const loading = ref(false)
const error = ref('')

const flow = computed(() => stats.value?.patient_flow || [])
const tiles = computed(() => [
  { label: 'Registrations today', value: stats.value?.registrations_today ?? '–' },
  { label: 'OP visits today', value: stats.value?.op_visits_today ?? '–' },
  { label: 'IP admissions today', value: stats.value?.ip_admissions_today ?? '–' },
  { label: 'Collected today', value: stats.value ? `₹${Number(stats.value.collected_today || 0).toFixed(2)}` : '–' },
])
const todayLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())

async function load() {
  loading.value = true
  error.value = ''
  try {
    stats.value = await api(`${VISIT}.get_front_desk_dashboard_stats`)
  } catch (err) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Done / pending pill, coloured by lightness as well as hue.
const StatusPill = (props) =>
  h(
    'span',
    {
      class: `rounded-full px-2.5 py-0.5 text-xs font-semibold ${props.done ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`,
    },
    props.done ? props.doneText : props.pendingText,
  )
StatusPill.props = ['done', 'doneText', 'pendingText']
</script>
