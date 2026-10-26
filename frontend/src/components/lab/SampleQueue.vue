<template>
  <!-- Paid tests waiting for their sample, one card per patient. One click
  takes every ticked test: one tube (one Sample ID) per sample type. -->
  <div class="flex flex-col gap-3">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ error }}</p>
    <p v-if="done" class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{{ done }}</p>
    <p v-if="groups === null" class="text-sm text-gray-500">Loading…</p>
    <p v-else-if="!groups.length" class="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-gray-600">No paid tests waiting for a sample.</p>

    <section v-for="g in groups" :key="g.patient_visit" class="rounded-xl border border-gray-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <div>
          <p class="font-semibold text-gray-900">{{ g.patient_name }}</p>
          <p class="font-mono text-xs text-gray-500">{{ g.patient_visit }}</p>
        </div>
        <button type="button" class="h-9 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy === g.patient_visit || !picked(g).length" @click="collect(g)">
          {{ busy === g.patient_visit ? 'Saving…' : `Collect ${picked(g).length} sample${picked(g).length === 1 ? '' : 's'}` }}
        </button>
      </div>
      <ul>
        <li v-for="t in g.tests" :key="t.name" class="flex items-center gap-3 border-b border-gray-100 px-5 py-2.5 text-sm last:border-0">
          <input :id="`pick-${t.name}`" v-model="ticked[t.name]" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-brand-700" />
          <label :for="`pick-${t.name}`" class="min-w-0 flex-1 cursor-pointer">
            <span class="font-medium text-gray-900">{{ t.item_name }}</span>
            <span v-if="t.sample_type" class="text-gray-600"> · {{ t.sample_type }}</span>
          </label>
          <!-- What to draw it in, from Lab Sample Type -->
          <span v-if="t.container || t.tube_colour || t.volume" class="text-right text-gray-600">{{ [t.container, t.tube_colour, t.volume].filter(Boolean).join(' · ') }}</span>
          <span v-else-if="!t.sample_type" class="text-gray-500">{{ t.test_type }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { call } from 'frappe-ui'
import { errorText } from '@/data/api'

const API = 'metta.metta.doctype.diagnostic_test.diagnostic_test'
const emit = defineEmits(['collected'])
const groups = ref(null)
const ticked = reactive({})
const busy = ref('')
const error = ref('')
const done = ref('')

const picked = (g) => g.tests.filter((t) => ticked[t.name]).map((t) => t.name)

async function load() {
  try {
    groups.value = (await call(`${API}.get_collection_queue`)) || []
    for (const g of groups.value) for (const t of g.tests) if (!(t.name in ticked)) ticked[t.name] = true
  } catch (err) {
    error.value = errorText(err) || 'Could not load the tests waiting for a sample.'
    groups.value = []
  }
}

async function collect(g) {
  error.value = ''
  done.value = ''
  busy.value = g.patient_visit
  try {
    const samples = (await call(`${API}.collect_samples`, { tests: picked(g) })) || []
    // The Sample ID is what goes on the tube, so it is shown straight away.
    done.value = samples.length
      ? `${g.patient_name}: write ${samples.map((s) => `${s.sample} on the ${s.sample_type} tube`).join(', ')}.`
      : `${g.patient_name}: marked collected.`
    emit('collected')
    await load()
  } catch (err) {
    error.value = errorText(err) || 'Could not collect the samples.'
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>
