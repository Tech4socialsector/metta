<template>
  <section class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
    <h2 class="text-[17px] font-semibold">Summary</h2>
    <dl class="flex flex-col gap-2">
      <div class="flex justify-between"><dt class="text-gray-700">Fee</dt><dd>{{ money(ov.visit.fee_amount) }}</dd></div>
      <div class="flex justify-between">
        <dt class="text-gray-700">{{ ov.labels.value.amount }}</dt>
        <dd>{{ ov.totals.value.adjustmentType === 'Increase' ? '+' : '−' }}{{ money(ov.totals.value.discount_amount) }}</dd>
      </div>
      <div class="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold"><dt>Net Amount</dt><dd>{{ money(ov.totals.value.net_amount) }}</dd></div>
    </dl>
    <div v-if="missing.length && triedSave" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      <p class="font-semibold">Missing required fields:</p>
      <ul class="list-disc pl-5">
        <li v-for="m in missing" :key="m">{{ m }}</li>
      </ul>
    </div>
    <p v-if="saveError" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ saveError }}</p>
    <button type="button" class="h-12 rounded-lg bg-brand-700 font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="saving" @click="$emit('save')">
      {{ saving ? 'Saving…' : saveLabel }}
    </button>
    <router-link :to="{ name: 'Home' }" class="flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-white font-semibold hover:bg-gray-50">Cancel</router-link>
  </section>
</template>

<script setup>
import { flt } from '@/data/registrationRules'

defineProps({
  ov: { type: Object, required: true },
  missing: { type: Array, default: () => [] },
  triedSave: Boolean,
  saveError: { type: String, default: '' },
  saving: Boolean,
  saveLabel: { type: String, default: 'Save' },
})
defineEmits(['save'])

function money(v) {
  return `₹${flt(v).toFixed(2)}`
}
</script>
