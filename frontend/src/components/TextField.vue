<template>
  <div class="flex flex-col" :class="compact ? 'gap-1' : 'gap-1.5'">
    <label :for="id" class="font-medium" :class="look.label">
      {{ label }}<span v-if="reqd" class="text-red-600"> *</span>
    </label>
    <textarea
      v-if="type === 'textarea'"
      :id="id"
      :value="modelValue"
      :readonly="readonly"
      :placeholder="placeholder"
      rows="2"
      class="w-full px-3 py-2"
      :class="[look.box, readonly ? look.locked : look.editable]"
      @input="$emit('update:modelValue', $event.target.value)"
      @change="$emit('change', $event.target.value)"
    ></textarea>
    <!-- Unit / status sit inside the box on the right (Bahmni-style), so the
    label stays short and a reading carries its own meaning. -->
    <div v-else class="relative">
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :readonly="readonly"
      :tabindex="readonly ? -1 : undefined"
      :placeholder="placeholder"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :list="list"
      autocomplete="off"
      class="w-full px-3"
      :class="[look.box, look.height, readonly ? look.locked : look.editable, (unit || $slots.end) && 'pr-28']"
      @input="$emit('update:modelValue', $event.target.value)"
      @change="$emit('change', $event.target.value)"
    />
    <span v-if="unit || $slots.end" class="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2 text-sm text-gray-500">
      <span v-if="unit">{{ unit }}</span>
      <slot name="end" />
    </span>
    </div>
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
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  reqd: Boolean,
  readonly: Boolean,
  placeholder: { type: String, default: '' },
  inputmode: { type: String, default: undefined },
  maxlength: { type: [String, Number], default: undefined },
  list: { type: String, default: undefined },
  hint: { type: String, default: '' },
  // shown inside the box, e.g. °F, mmHg, kg
  unit: { type: String, default: '' },
})
defineEmits(['update:modelValue', 'change'])
</script>
