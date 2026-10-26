<template>
  <!-- All / Today / This week / This month / Date range - opens on All. -->
  <div class="flex flex-wrap items-center gap-2">
    <div role="radiogroup" aria-label="Period" class="flex rounded-md bg-gray-100 p-0.5">
      <button
        v-for="p in PERIOD_OPTIONS"
        :key="p.key"
        type="button"
        role="radio"
        :aria-checked="period === p.key"
        class="h-8 rounded px-3 text-sm font-medium"
        :class="period === p.key ? 'bg-white text-brand-800 shadow-sm' : 'text-gray-600 hover:text-gray-900'"
        @click="period = p.key"
      >
        {{ p.label }}
      </button>
    </div>
    <template v-if="period === 'range'">
      <label class="flex items-center gap-1.5 text-sm text-gray-600">From
        <input v-model="from" type="date" :max="to || undefined" class="ctl w-[150px]" aria-label="From date" />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-gray-600">To
        <input v-model="to" type="date" :min="from || undefined" class="ctl w-[150px]" aria-label="To date" />
      </label>
    </template>
  </div>
</template>

<script setup>
import { PERIOD_OPTIONS, usePeriod } from '@/data/period'

const { period, from, to } = usePeriod()
</script>
