<template>
  <!-- A consultation's lab tests for the doctor: status while pending, the
  verified values once Reported (the server holds back unverified ones). -->
  <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>
  <p v-else-if="tests === null" class="text-sm text-gray-500">Loading…</p>
  <div v-else class="flex flex-col gap-4">
    <div v-for="t in tests" :key="t.name" class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="font-semibold text-gray-900">{{ t.item_name || t.name }}</span>
        <StatusBadge :status="t.status" />
        <span v-if="t.reported_on" class="text-xs text-gray-500">{{ String(t.reported_on).slice(0, 16) }}</span>
        <!-- Same Lab Report print format and button look as the Lab Test screen; one per test since each test prints on its own. -->
        <button v-if="t.status === 'Reported'" type="button" class="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50" @click="print(t.name)">
          <LucideIcon name="printer" class="h-4 w-4" /> Print
        </button>
      </div>
      <div v-if="t.rows.length" class="overflow-x-auto rounded-lg border border-gray-200">
        <table class="w-full min-w-[520px] text-sm">
          <thead class="bg-brand-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-700">
            <tr><th class="px-3 py-2">Parameter</th><th class="px-3 py-2">Result</th><th class="px-3 py-2">Normal Range</th><th class="px-3 py-2">Flag</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in t.rows" :key="r.parameter" class="border-t border-gray-100">
              <td class="px-3 py-1.5">{{ r.parameter }}</td>
              <td class="px-3 py-1.5"><span class="rounded-md border border-transparent px-2 py-0.5 font-semibold" :style="FLAG_BG[r.flag]">{{ r.result_value || '—' }}</span> <span class="text-gray-500">{{ r.unit }}</span></td>
              <td class="px-3 py-1.5 tabular-nums text-gray-600">{{ r.normal_range }}</td>
              <td class="px-3 py-1.5">
                <span v-if="r.flag" class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="['ring-1', FLAG_CLASS[r.flag]]">{{ FLAG_ARROW[r.flag] ? `${FLAG_ARROW[r.flag]} ` : '' }}{{ r.flag }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="t.result" class="whitespace-pre-line text-sm text-gray-800">{{ t.result }}</p>
      <a v-if="t.result_attachment" :href="t.result_attachment" target="_blank" class="text-sm font-semibold text-brand-700 hover:underline">Open attachment</a>
      <p v-if="t.remarks && t.status === 'Reported'" class="text-sm text-gray-600">Remarks: {{ t.remarks }}</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import StatusBadge from '@/components/StatusBadge.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { api, errorText, DC } from '@/data/api'
import { printLabReport, FLAG_CLASS, FLAG_ARROW, FLAG_BG } from '@/data/lab/labRules'

const props = defineProps({ consultation: { type: String, required: true } })
const emit = defineEmits(['loaded'])
const tests = ref(null)
const error = ref('')

async function print(name) {
  try {
    await printLabReport(name)
  } catch (err) {
    error.value = errorText(err) || 'Could not print the lab report.'
  }
}

async function load() {
  error.value = ''
  tests.value = null
  try {
    tests.value = (await api(`${DC}.get_consultation_lab_reports`, { consultation: props.consultation })) || []
    emit('loaded', tests.value.length)
  } catch (err) {
    error.value = errorText(err) || 'Could not load the lab reports.'
  }
}

watch(() => props.consultation, load)
onMounted(load)
</script>
