<template>
  <!-- render_patient_history (doctor_consultation.js): every earlier
  consultation of this patient, with medicines, tests and results. -->
  <div class="flex flex-col gap-3">
    <p v-if="!visit" class="text-sm text-gray-600">Pick a Visit to see this patient's history.</p>
    <p v-else-if="loading" class="text-sm text-gray-600">Loading…</p>
    <p v-else-if="!entries.length" class="text-sm text-gray-600">No earlier visits on record for this patient.</p>
    <article v-for="e in entries" :key="e.name" class="rounded-lg border border-gray-200 px-4 py-3 text-sm">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <span class="font-semibold text-gray-900">{{ when(e.consultation_datetime) }}</span>
        <span class="text-gray-600">{{ e.doctor }}</span>
      </div>
      <p v-if="e.diagnosis" class="mt-1.5"><span class="font-medium text-gray-700">Diagnosis:</span> {{ e.diagnosis }}</p>
      <p v-if="e.clinical_notes" class="mt-1"><span class="font-medium text-gray-700">Clinical Notes:</span> {{ e.clinical_notes }}</p>
      <p v-if="e.prescribed_items?.length" class="mt-1">
        <span class="font-medium text-gray-700">Prescribed:</span>
        {{ e.prescribed_items.map((p) => `${p.item_name}${p.dosage || p.duration ? ` (${[p.dosage, p.duration ? `${p.duration} days` : ''].filter(Boolean).join(', ')})` : ''}`).join(', ') }}
      </p>
      <p v-if="e.suggested_tests?.length" class="mt-1">
        <span class="font-medium text-gray-700">Tests Suggested:</span>
        {{ e.suggested_tests.map((t) => `${t.item_name} (${t.test_type})`).join(', ') }}
      </p>
      <p v-if="e.diagnostic_tests?.length" class="mt-1">
        <span class="font-medium text-gray-700">Test Results:</span>
        {{ e.diagnostic_tests.map((t) => (t.status === 'Reported' ? `${t.item_name}: ${t.result || '—'}` : `${t.item_name} (${t.status})`)).join(', ') }}
      </p>
    </article>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { api, DC } from '@/data/api'

const props = defineProps({
  visit: { type: String, default: '' },
  // the consultation being written, left out of its own history
  exclude: { type: String, default: '' },
})

const entries = ref([])
const loading = ref(false)

const fmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
function when(v) {
  if (!v) return ''
  return fmt.format(new Date(String(v).replace(' ', 'T')))
}

watch(
  () => [props.visit, props.exclude],
  async () => {
    entries.value = []
    if (!props.visit) return
    loading.value = true
    try {
      entries.value = (await api(`${DC}.get_patient_history`, { patient_consultation: props.visit, exclude: props.exclude || undefined })) || []
    } catch {
      entries.value = []
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
</script>
