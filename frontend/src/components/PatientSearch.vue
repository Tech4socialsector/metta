<template>
  <!-- Front Desk's patient search: UHIN, phone or name. -->
  <div class="relative w-full max-w-xl">
    <LucideIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
    <label for="patient-search" class="sr-only">Search patient</label>
    <input
      id="patient-search"
      ref="input"
      v-model="txt"
      type="search"
      autocomplete="off"
      placeholder="Returning patient? Search by UHIN, phone or name"
      class="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-[15px] placeholder:text-gray-500 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      @input="searchDebounced"
      @focus="open = true"
      @blur="open = false"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="go(results[active])"
      @keydown.escape="open = false"
    />
    <div v-if="open && txt.trim().length >= 2" class="absolute left-0 top-12 z-40 w-full overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-gray-900 shadow-lg" @mousedown.prevent>
      <div v-if="loading && !results.length" class="px-3 py-2 text-sm text-gray-500">Searching…</div>
      <div v-else-if="!results.length" class="px-3 py-2 text-sm text-gray-600">
        No patient found.
        <router-link :to="{ name: 'Register' }" class="font-semibold text-brand-700 underline" @click="open = false">Register new patient</router-link>
      </div>
      <!-- Picking a registered patient starts their new OP visit. -->
      <button
        v-for="(p, i) in results"
        :key="p.name"
        type="button"
        class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
        :class="i === active ? 'bg-brand-50' : 'hover:bg-gray-50'"
        @mouseenter="active = i"
        @click="go(p)"
      >
        <LucideIcon name="user" class="h-4 w-4 shrink-0 text-brand-700" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ p.patient_name || p.name }} <span class="font-normal text-gray-500">· {{ [p.age, p.sex].filter((x) => x !== null && x !== '').join(' ') }}</span></span>
          <span class="block truncate text-xs text-gray-500">{{ [p.name, p.phone, p.billing_category].filter(Boolean).join(' · ') }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { debounce } from 'frappe-ui'
import { api } from '@/data/api'

const router = useRouter()
const txt = ref('')
const results = ref([])
const active = ref(0)
const loading = ref(false)
const open = ref(false)
const input = ref(null)

async function search() {
  if (txt.value.trim().length < 2) {
    results.value = []
    return
  }
  loading.value = true
  try {
    results.value = await api('metta.api.search_patients', { txt: txt.value })
    active.value = 0
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}
const searchDebounced = debounce(search, 250)

function move(step) {
  if (results.value.length) active.value = (active.value + step + results.value.length) % results.value.length
}
function go(p) {
  if (!p) return
  open.value = false
  txt.value = ''
  router.push({ name: 'NewVisit', params: { uhin: p.name } })
}

// "/" jumps to the search box from anywhere, unless already typing.
function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase()
  if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag)) {
    e.preventDefault()
    input.value?.focus()
  }
}
// The cursor starts in the box: most Front Desk work begins with a search.
onMounted(() => {
  window.addEventListener('keydown', onKey)
  input.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
