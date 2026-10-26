<template>
  <div ref="root" class="relative flex flex-col" :class="compact ? 'gap-1' : 'gap-1.5'">
    <label :for="id" class="font-medium" :class="look.label">
      {{ label }}<span v-if="reqd" class="text-red-600"> *</span>
    </label>
    <div class="relative">
      <input
        :id="id"
        ref="input"
        :value="open ? query : modelValue"
        :readonly="readonly"
        :tabindex="readonly ? -1 : undefined"
        :placeholder="readonly ? '' : `Search ${doctype}…`"
        autocomplete="off"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="`${id}-list`"
        class="w-full px-3 pr-9"
        :class="[look.box, look.height, readonly ? look.locked : look.editable]"
        @focus="onFocus"
        @input="onInput($event.target.value)"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="pick(results[active])"
        @keydown.escape="open = false"
        @blur="onBlur"
      />
      <button
        v-if="modelValue && !readonly"
        type="button"
        class="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
        :class="compact ? 'h-6 w-6' : 'h-8 w-8'"
        :aria-label="`Clear ${label}`"
        @mousedown.prevent="clear"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
    <ul
      v-if="open"
      :id="`${id}-list`"
      role="listbox"
      class="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
      @mousedown.prevent
    >
      <li v-if="loading && !results.length" class="px-3 py-2 text-sm text-gray-500">Searching…</li>
      <li v-else-if="!results.length" class="px-3 py-2 text-sm text-gray-500">No {{ doctype }} found</li>
      <li
        v-for="(r, i) in results"
        :key="r.value"
        role="option"
        :aria-selected="i === active"
        class="cursor-pointer rounded-md px-3 py-2"
        :class="i === active ? 'bg-brand-50' : 'hover:bg-gray-50'"
        @click="pick(r)"
      >
        <div class="text-sm font-medium text-gray-900">{{ r.label || r.value }}</div>
        <div v-if="r.description" class="text-xs text-gray-600">{{ r.description }}</div>
      </li>
    </ul>
    <p v-if="hint" class="text-xs text-gray-600">{{ hint }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { call, debounce } from 'frappe-ui'
import { fieldLook } from '@/data/fieldLook'

const look = fieldLook()
const compact = look.compact

// Desk's Link control: searches the linked doctype through Frappe's own
// search_link (same results, same permission rules, same filters as
// set_query), and only ever stores a value picked from the list.
const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  doctype: { type: String, required: true },
  modelValue: { type: String, default: '' },
  filters: { type: Object, default: null },
  reqd: Boolean,
  readonly: Boolean,
  hint: { type: String, default: '' },
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
const searchDebounced = debounce(search, 250)

function onFocus() {
  if (props.readonly) return
  open.value = true
  query.value = ''
  search('')
}
function onInput(value) {
  query.value = value
  open.value = true
  searchDebounced(value)
}
function move(step) {
  if (!results.value.length) return
  active.value = (active.value + step + results.value.length) % results.value.length
}
function pick(r) {
  if (!r) return
  emit('update:modelValue', r.value)
  open.value = false
}
function clear() {
  emit('update:modelValue', '')
}
function onBlur() {
  open.value = false
}
</script>
