<template>
  <!-- Who the test is for and who ordered it - read-only, from
  metta.vue.lab.get_test_context, as the shared patient bar. Visit and
  consultation link only where the user could open the record anyway. -->
  <PatientBar :name="patientName" :age="c.age" :gender="c.sex" :uhin="c.uhin_id" :visit="c.can_read_visit ? c.visit : ''" :doctor="c.doctor">
    <span v-if="c.visit && !c.can_read_visit" class="text-gray-600">Visit <b class="font-mono font-semibold text-gray-900">{{ c.visit }}</b></span>
    <span v-if="c.consultation" class="text-gray-600">
      Consultation
      <router-link v-if="c.can_read_consultation" :to="{ name: 'ConsultationForm', params: { name: c.consultation } }" class="font-semibold text-brand-700 hover:underline">{{ consultationLabel }}</router-link>
      <b v-else class="font-semibold text-gray-900">{{ consultationLabel }}</b>
    </span>
  </PatientBar>
</template>

<script setup>
import { computed } from 'vue'
import PatientBar from '@/components/PatientBar.vue'
import { formatValue } from '@/data/meta'

const props = defineProps({
  // null while there's no consultation yet (or it can't be read)
  ctx: { type: Object, default: null },
  patientName: { type: String, default: '' },
})

const c = computed(() => props.ctx || {})
const consultationLabel = computed(() => (c.value.consultation_datetime ? formatValue({ fieldtype: 'Datetime' }, c.value.consultation_datetime) : c.value.consultation))
</script>
