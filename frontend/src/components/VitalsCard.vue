<template>
  <!-- The nurse's latest vitals for this visit (Desk shows them in the
  "Patient Vitals" popup), or the "not recorded yet" warning. -->
  <section class="rounded-xl border bg-white p-5" :class="vitals ? 'border-gray-200' : 'border-amber-200'">
    <SubHeading icon="heart-pulse" class="mb-3">
      Patient vitals
      <template #end>
        <router-link v-if="vitals?.name" :to="{ name: 'NurseForm', params: { name: vitals.name } }" class="text-sm font-semibold text-brand-700 hover:underline">Open</router-link>
      </template>
    </SubHeading>
    <p v-if="loading" class="text-sm text-gray-600">Loading…</p>
    <p v-else-if="!vitals" class="text-sm text-amber-900">Vitals not recorded yet by the nurse for this patient - you can still proceed.</p>
    <dl v-else class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
      <div v-for="r in rows" :key="r[0]">
        <dt class="text-xs text-gray-500">{{ r[0] }}</dt>
        <dd class="font-medium text-gray-900">{{ r[1] || '—' }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup>
import SubHeading from '@/components/SubHeading.vue'
import { computed, ref, watch } from 'vue'
import { api, DC } from '@/data/api'

const props = defineProps({ visit: { type: String, default: '' } })

const vitals = ref(null)
const loading = ref(false)

const withStatus = (v, s) => (v ? `${v}${s ? ` (${s})` : ''}` : '')
// Same rows, same order as Desk's popup.
const rows = computed(() => {
  const v = vitals.value || {}
  return [
    ['Temperature (F)', v.temperature],
    ['Blood Pressure (mmHg)', v.blood_pressure_mmhg],
    ['Pulse (b/m)', v.pulse],
    ['Respiration (b/m)', v.respiration],
    ['Saturation (SpO2)', v.saturation],
    ['Height (cm)', v.height],
    ['Weight (Kg)', v.weight],
    ['BMI', withStatus(v.bmi, v.bmi_category)],
    ['Random Blood Glucose', withStatus(v.rbg_level, v.blood_sugar_status)],
    ['Hemoglobin (g/dL)', withStatus(v.hemoglobin_level, v.anemia_status)],
    ['PICCLE', v.piccle],
    ["Nurse's Provisional Diagnosis", v.primary_diagnosis],
  ]
})

watch(
  () => props.visit,
  async (visit) => {
    vitals.value = null
    if (!visit) return
    loading.value = true
    try {
      vitals.value = await api(`${DC}.get_latest_vitals`, { patient_consultation: visit })
    } catch {
      vitals.value = null
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
</script>
