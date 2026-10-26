<template>
  <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
    <component
      :is="c.click ? 'button' : 'div'"
      v-for="c in cards"
      :key="c.label"
      :type="c.click ? 'button' : undefined"
      class="flex flex-col gap-1 rounded-xl border bg-white px-4 py-3 text-left"
      :class="[TONES[c.tone] || 'border-gray-200', c.click && 'hover:bg-gray-50']"
      @click="c.click && c.click()"
    >
      <span class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ c.label }}</span>
      <span class="text-xl font-semibold tabular-nums">{{ c.value }}</span>
      <span v-if="c.sub" class="text-xs text-gray-600">{{ c.sub }}</span>
      <span v-if="c.click" class="text-xs font-semibold text-brand-700">{{ c.clickLabel || 'View list' }} →</span>
    </component>
  </div>
</template>

<script setup>
// [{ label, value, sub?, tone?: 'warn'|'bad'|'good', click?, clickLabel? }]
defineProps({ cards: { type: Array, required: true } })

// Desk highlights a card (pending / expired / payable) only when it's non-zero;
// pages pass the tone conditionally the same way.
const TONES = { warn: 'border-amber-300 bg-amber-50', bad: 'border-red-300 bg-red-50', good: 'border-green-300 bg-green-50' }
</script>
