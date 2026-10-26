<template>
  <div class="relative flex min-w-0 flex-col gap-1.5">
    <label v-if="label" :for="id" class="ctl-label">{{ label }}<span v-if="reqd" class="text-red-600"> *</span></label>
    <!-- Read-only and filled: the value opens its record, as Desk's link. -->
    <router-link
      v-if="readonly && modelValue"
      :id="id"
      :to="viewRoute(doctype, modelValue)"
      class="ctl-ro flex items-center truncate font-medium text-brand-700 hover:underline"
    >{{ modelValue }}</router-link>
    <div v-else class="relative">
      <input
        :id="id"
        :value="open ? query : modelValue"
        :readonly="readonly"
        :tabindex="readonly ? -1 : undefined"
        :placeholder="readonly ? '' : placeholder || `Search ${doctype}…`"
        :aria-label="label ? undefined : ariaLabel || doctype"
        autocomplete="off"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="`${id}-list`"
        class="pr-8"
        :class="readonly ? 'ctl-ro' : error ? 'ctl border-red-400' : 'ctl'"
        @focus="onFocus"
        @input="onInput($event.target.value)"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="pick(results[active])"
        @keydown.escape="open = false"
        @blur="open = false"
      />
      <button v-if="modelValue && !readonly" type="button" class="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-gray-500 hover:bg-gray-100" :aria-label="`Clear ${label || ariaLabel || doctype}`" @mousedown.prevent="emit('update:modelValue', '')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
    <ul v-if="open" :id="`${id}-list`" role="listbox" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 min-w-[14rem] overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg" @mousedown.prevent>
      <li v-if="loading && !results.length" class="px-3 py-2 text-sm text-gray-500">Searching…</li>
      <li v-else-if="!results.length" class="px-3 py-2 text-sm text-gray-500">No {{ doctype }} found</li>
      <li v-for="(r, i) in results" :key="r.value" role="option" :aria-selected="i === active" class="cursor-pointer rounded-md px-3 py-1.5" :class="i === active ? 'bg-brand-50' : 'hover:bg-gray-50'" @click="pick(r)">
        <div class="text-sm font-medium text-gray-900">{{ r.value }}</div>
        <div v-if="r.description || (r.label && r.label !== r.value)" class="text-xs text-gray-600">{{ r.description || r.label }}</div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { call, debounce } from 'frappe-ui'
import { viewRoute } from '@/data/formMenu'

// Desk's Link control with set_query support: Frappe's own search_link, with
// the custom `query` method and/or `filters` the Desk script sets. Shows the
// ID once picked (Billing/Discharge Bill override Patient Visit's title).
const props = defineProps({
  id: { type: String, required: true },
  doctype: { type: String, required: true },
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  query: { type: String, default: '' },
  filters: { type: Object, default: null },
  reqd: Boolean,
  readonly: Boolean,
  compact: Boolean,
  error: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const query = ref('')
const results = ref([])
const active = ref(0)
const loading = ref(false)

async function search(txt) {
  loading.value = true
  try {
    results.value = await call('frappe.desk.search.search_link', {
      doctype: props.doctype,
      txt: txt || '',
      query: props.query || undefined,
      filters: props.filters || undefined,
      page_length: 20,
    })
    active.value = 0
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}
const searchSoon = debounce(search, 250)

function onFocus() {
  if (props.readonly) return
  open.value = true
  query.value = ''
  search('')
}
function onInput(v) {
  query.value = v
  open.value = true
  searchSoon(v)
}
function move(step) {
  if (!results.value.length) return
  active.value = (active.value + step + results.value.length) % results.value.length
}
function pick(r) {
  if (!r) return
  open.value = false
  if (r.value !== props.modelValue) emit('update:modelValue', r.value)
}
</script>
