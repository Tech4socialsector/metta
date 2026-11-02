<template>
  <!-- One vital reading: icon + label, a larger number box with its unit
  inside (Frappe field look, fieldLook.js), and one line under it - the
  error (red, blocks Save), else an out-of-normal note (amber, just a
  warning), else the normal range. The patient's last reading sits at the
  right of that line so a change stands out. Two boxes (BP) go in the
  default slot instead of v-model. -->
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="flex items-center gap-1.5 text-[13px] font-medium text-gray-700">
      <LucideIcon :name="icon" class="h-4 w-4 text-gray-500" />
      {{ label }}<span v-if="reqd" class="text-red-600">*</span>
    </label>
    <slot :box-class="boxClass">
      <div class="relative">
        <input
          :id="id"
          :value="modelValue"
          :readonly="readonly"
          :tabindex="readonly ? -1 : undefined"
          :inputmode="inputmode"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="`${id}-note`"
          autocomplete="off"
          :class="[boxClass, 'w-full pl-3 pr-20']"
          @input="$emit('update:modelValue', $event.target.value)"
        />
        <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500">{{ unit }}</span>
      </div>
    </slot>
    <div :id="`${id}-note`" class="flex min-h-[18px] items-start justify-between gap-2 text-xs">
      <span v-if="error" class="font-medium text-red-700">{{ error }}</span>
      <span v-else-if="warning" class="font-medium text-amber-800">{{ warning }}</span>
      <span v-else class="text-gray-500">{{ normal }}</span>
      <span v-if="last" class="shrink-0 text-gray-500">Last: {{ last }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { fieldLook } from '@/data/fieldLook'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  icon: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
  unit: { type: String, default: '' },
  inputmode: { type: String, default: 'decimal' },
  reqd: Boolean,
  readonly: Boolean,
  error: { type: String, default: '' },
  warning: { type: String, default: '' },
  normal: { type: String, default: '' },
  last: { type: String, default: '' },
})
defineEmits(['update:modelValue'])

const look = fieldLook()
// Taller than other fields (h-10, larger digits): these are numbers read
// at a glance, often on a tablet at the bedside.
const boxClass = computed(() => [
  look.box,
  'h-10 text-lg font-semibold tabular-nums',
  props.readonly ? look.locked : props.error ? look.invalid : props.warning ? 'border-amber-400 bg-amber-50/60 focus:ring-2 focus:ring-amber-100' : look.editable,
])
</script>
