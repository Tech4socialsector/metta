<template>
  <!-- Quick filter: tick one or more values (Pathways' MultiSelectFilter
  pattern, MIT, Tech4socialsector). -->
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm"
      :class="modelValue.length ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="max-w-[12rem] truncate">{{ modelValue.length === 1 ? modelValue[0] : label }}</span>
      <span v-if="modelValue.length > 1" class="rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white">{{ modelValue.length }}</span>
      <LucideIcon name="chevron-down" class="h-3.5 w-3.5" />
    </button>
    <div v-if="open" class="absolute left-0 top-9 z-30 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
      <label v-for="o in options" :key="o" class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
        <input type="checkbox" class="rounded border-gray-300 text-brand-700 focus:ring-brand-700" :checked="modelValue.includes(o)" @change="toggle(o, $event.target.checked)" />
        <span class="truncate">{{ o }}</span>
      </label>
      <div class="mt-1 flex justify-between border-t border-gray-100 px-2 pt-1.5 text-xs font-semibold">
        <button type="button" class="text-brand-700 hover:underline" @click="$emit('update:modelValue', [...options])">Select all</button>
        <button type="button" class="text-gray-600 hover:underline" @click="$emit('update:modelValue', [])">Clear</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, required: true },
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const root = ref(null)

function toggle(o, on) {
  const next = props.modelValue.filter((v) => v !== o)
  if (on) next.push(o)
  emit('update:modelValue', next)
}

function onDocClick(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>
