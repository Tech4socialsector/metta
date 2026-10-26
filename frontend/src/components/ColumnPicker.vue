<template>
  <!-- Pathways' column chooser pattern (MIT, Tech4socialsector): tick the
  columns to show and move them up or down. -->
  <div ref="root" class="relative">
    <button type="button" class="flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50" :aria-expanded="open" @click="open = !open">
      <LucideIcon name="columns" class="h-3.5 w-3.5" /> Columns
    </button>
    <div v-if="open" class="absolute right-0 top-10 z-40 flex max-h-[70vh] w-72 flex-col rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
      <p class="px-2 pb-1 text-xs font-semibold uppercase text-gray-500">Shown</p>
      <div v-for="(n, i) in modelValue" :key="n" class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
        <input type="checkbox" checked class="rounded border-gray-300 text-brand-700" :disabled="modelValue.length === 1" :aria-label="`Hide ${labelOf(n)}`" @change="hide(n)" />
        <span class="flex-1 truncate">{{ labelOf(n) }}</span>
        <button type="button" class="rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" :disabled="i === 0" :aria-label="`Move ${labelOf(n)} up`" @click="move(i, -1)"><LucideIcon name="chevron-up" class="h-3.5 w-3.5" /></button>
        <button type="button" class="rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" :disabled="i === modelValue.length - 1" :aria-label="`Move ${labelOf(n)} down`" @click="move(i, 1)"><LucideIcon name="chevron-down" class="h-3.5 w-3.5" /></button>
      </div>
      <p class="mt-2 px-2 pb-1 text-xs font-semibold uppercase text-gray-500">More fields</p>
      <input v-model="find" type="search" placeholder="Find a field" aria-label="Find a field" class="mx-1 mb-1 h-8 rounded-md border-gray-300 text-sm" />
      <div class="min-h-0 flex-1 overflow-y-auto">
        <label v-for="f in hiddenFields" :key="f.fieldname" class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
          <input type="checkbox" class="rounded border-gray-300 text-brand-700" @change="show(f.fieldname)" />
          <span class="truncate">{{ f.label }}</span>
        </label>
      </div>
      <button type="button" class="mt-2 border-t border-gray-100 px-2 pt-2 text-left text-sm font-semibold text-brand-700 hover:underline" @click="$emit('update:modelValue', null)">Reset to default</button>
    </div>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  fields: { type: Array, required: true },
  defaults: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const find = ref('')
const root = ref(null)

function labelOf(n) {
  return props.fields.find((f) => f.fieldname === n)?.label || n
}
const hiddenFields = computed(() => {
  const q = find.value.trim().toLowerCase()
  return props.fields.filter((f) => !props.modelValue.includes(f.fieldname) && (!q || f.label.toLowerCase().includes(q)))
})
function hide(n) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== n))
}
function show(n) {
  emit('update:modelValue', [...props.modelValue, n])
}
function move(i, step) {
  const next = [...props.modelValue]
  const [x] = next.splice(i, 1)
  next.splice(i + step, 0, x)
  emit('update:modelValue', next)
}

function onDocClick(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>
