<template>
  <!-- Desk's frappe.prompt: a few fields, one button. -->
  <AppDialog :model-value="modelValue" :title="title" @update:model-value="$emit('update:modelValue', $event)">
    <div class="flex flex-col gap-4">
      <FormField v-for="df in fields" :key="df.fieldname" :df="df" id-prefix="prompt" :model-value="values[df.fieldname]" :required="!!df.reqd" :error="tried && df.reqd && !values[df.fieldname] ? 'Required' : ''" @update:model-value="(v) => (values[df.fieldname] = v)" />
    </div>
    <template #footer>
      <button type="button" class="h-9 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium hover:bg-gray-50" @click="$emit('update:modelValue', false)">Cancel</button>
      <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" @click="done">{{ primaryLabel }}</button>
    </template>
  </AppDialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import FormField from '@/components/FormField.vue'

const props = defineProps({
  modelValue: Boolean,
  title: { type: String, required: true },
  // [{ fieldname, label, fieldtype, options, reqd }]
  fields: { type: Array, required: true },
  primaryLabel: { type: String, default: 'Submit' },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const values = reactive({})
const tried = ref(false)

// Each opening starts fresh, as a new frappe.prompt does (a Select on its
// first option).
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    tried.value = false
    for (const df of props.fields) values[df.fieldname] = df.fieldtype === 'Select' ? String(df.options || '').split('\n')[0] : null
  },
)

function done() {
  tried.value = true
  if (props.fields.some((df) => df.reqd && !values[df.fieldname])) return
  emit('update:modelValue', false)
  emit('submit', { ...values })
}
</script>
