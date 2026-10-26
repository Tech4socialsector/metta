<template>
  <div class="flex flex-col" :class="compact ? 'gap-1' : 'gap-1.5'">
    <label :for="id" class="font-medium" :class="look.label">
      {{ label }}<span v-if="reqd" class="text-red-600"> *</span>
    </label>
    <select
      :id="id"
      :value="modelValue"
      :disabled="readonly"
      class="w-full px-3"
      :class="[look.box, look.height, compact && 'py-0', readonly ? look.locked : look.editable]"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option v-for="opt in options" :key="opt" :value="opt">{{ opt || '—' }}</option>
    </select>
    <p v-if="hint" class="text-xs text-gray-600">{{ hint }}</p>
  </div>
</template>

<script setup>
import { fieldLook } from '@/data/fieldLook'

const look = fieldLook()
const compact = look.compact

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  options: { type: Array, required: true },
  reqd: Boolean,
  readonly: Boolean,
  hint: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
</script>
