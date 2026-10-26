<template>
  <!-- Pathways' AdvancedFilter pattern (MIT, Tech4socialsector): edit rows
  in a draft, nothing changes until Apply. -->
  <div ref="root" class="relative">
    <div class="flex items-center">
      <button
        type="button"
        class="flex h-8 items-center gap-1.5 border px-2.5 text-sm font-medium"
        :class="modelValue.length ? 'rounded-l-md border-brand-200 bg-brand-50 text-brand-800' : 'rounded-md border-gray-300 bg-white text-gray-700 hover:bg-gray-50'"
        :aria-expanded="open"
        @click="toggle"
      >
        <LucideIcon name="filter" class="h-3.5 w-3.5" />
        Filter<span v-if="modelValue.length" class="rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white">{{ modelValue.length }}</span>
      </button>
      <button v-if="modelValue.length" type="button" class="flex h-8 w-8 items-center justify-center rounded-r-md border border-l-0 border-brand-200 bg-brand-50 text-brand-800" aria-label="Clear filters" title="Clear filters" @click="$emit('update:modelValue', [])">
        <LucideIcon name="x" class="h-3.5 w-3.5" />
      </button>
    </div>

    <div v-if="open" class="absolute right-0 top-10 z-40 w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 shadow-xl" @keydown.esc="open = false">
      <p v-if="!draft.length" class="px-1 pb-2 text-sm text-gray-500">No filters yet. Add one to narrow the list.</p>
      <div v-for="(c, i) in draft" :key="c.id" class="mb-2 grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] items-center gap-2">
        <select v-model="c.field" aria-label="Field" class="h-8 min-w-0 rounded border-gray-200 bg-gray-100 text-sm" @change="c.op = opsFor(c.field)[0].value">
          <option v-for="f in fields" :key="f.fieldname" :value="f.fieldname">{{ f.label }}</option>
        </select>
        <select v-model="c.op" aria-label="Condition" class="h-8 min-w-0 rounded border-gray-200 bg-gray-100 text-sm">
          <option v-for="op in opsFor(c.field)" :key="op.value" :value="op.value">{{ op.label }}</option>
        </select>
        <div class="flex min-w-0 gap-1">
          <template v-if="!['set', 'not set'].includes(c.op)">
            <select v-if="optionsFor(c.field)" v-model="c.value" aria-label="Value" class="h-8 min-w-0 flex-1 rounded border-gray-200 bg-gray-100 text-sm">
              <option v-for="o in optionsFor(c.field)" :key="o" :value="o">{{ o }}</option>
            </select>
            <input v-else v-model="c.value" :type="inputType(c.field)" aria-label="Value" class="h-8 min-w-0 flex-1 rounded border-gray-200 bg-gray-100 px-2 text-sm" />
            <input v-if="c.op === 'between'" v-model="c.value2" :type="inputType(c.field)" aria-label="To" class="h-8 min-w-0 flex-1 rounded border-gray-200 bg-gray-100 px-2 text-sm" />
          </template>
        </div>
        <button type="button" class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Remove filter" @click="draft.splice(i, 1)">
          <LucideIcon name="x" class="h-4 w-4" />
        </button>
      </div>
      <div class="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <button type="button" class="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-brand-700" @click="addRow">
          <LucideIcon name="plus" class="h-4 w-4" />Add a filter
        </button>
        <div class="flex gap-2">
          <button type="button" class="h-8 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium hover:bg-gray-50" @click="clearAll">Clear filters</button>
          <button type="button" class="h-8 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800" @click="apply">Apply filters</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  // the doctype's filterable fields (meta)
  fields: { type: Array, required: true },
  // applied conditions: [{ field, op, value, value2 }]
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const draft = ref([])
const root = ref(null)
let seq = 0

const TEXT_OPS = [
  { value: 'like', label: 'Contains' },
  { value: '=', label: 'Equals' },
  { value: '!=', label: 'Not equals' },
  { value: 'not like', label: 'Does not contain' },
  { value: 'set', label: 'Is set' },
  { value: 'not set', label: 'Is not set' },
]
const NUMBER_OPS = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: 'between', label: 'Between' },
]
const DATE_OPS = [
  { value: '=', label: 'On' },
  { value: '<', label: 'Before' },
  { value: '>', label: 'After' },
  { value: 'between', label: 'Between' },
  { value: 'set', label: 'Is set' },
  { value: 'not set', label: 'Is not set' },
]
const CHOICE_OPS = [
  { value: '=', label: 'Equals' },
  { value: '!=', label: 'Not equals' },
  { value: 'set', label: 'Is set' },
  { value: 'not set', label: 'Is not set' },
]

function fieldOf(name) {
  return props.fields.find((f) => f.fieldname === name) || {}
}
function opsFor(name) {
  const t = fieldOf(name).fieldtype
  if (['Int', 'Float', 'Currency', 'Percent'].includes(t)) return NUMBER_OPS
  if (['Date', 'Datetime'].includes(t)) return DATE_OPS
  if (['Select', 'Check'].includes(t)) return CHOICE_OPS
  return TEXT_OPS
}
function optionsFor(name) {
  const f = fieldOf(name)
  if (f.fieldtype === 'Check') return ['Yes', 'No']
  if (f.fieldtype === 'Select') return String(f.options || '').split('\n').filter(Boolean)
  return null
}
function inputType(name) {
  const t = fieldOf(name).fieldtype
  if (['Int', 'Float', 'Currency', 'Percent'].includes(t)) return 'number'
  if (['Date', 'Datetime'].includes(t)) return 'date'
  return 'text'
}

function toggle() {
  if (!open.value) draft.value = props.modelValue.map((c) => ({ ...c, id: ++seq }))
  if (!open.value && !draft.value.length) addRow()
  open.value = !open.value
}
function addRow() {
  const first = props.fields[0]?.fieldname || 'name'
  draft.value.push({ id: ++seq, field: first, op: opsFor(first)[0].value, value: '', value2: '' })
}
function clearAll() {
  draft.value = []
  emit('update:modelValue', [])
  open.value = false
}
function apply() {
  const done = draft.value.filter((c) => c.field && (['set', 'not set'].includes(c.op) || c.value !== ''))
  emit('update:modelValue', done.map(({ id, ...c }) => c))
  open.value = false
}

function onDocClick(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>
