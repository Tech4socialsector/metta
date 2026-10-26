<template>
  <div class="flex flex-wrap items-center gap-2">
    <button
      v-for="k in ranges"
      :key="k"
      type="button"
      class="h-8 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      @click="$emit('pick', QUICK_RANGES[k].range())"
    >
      {{ QUICK_RANGES[k].label }}
    </button>
  </div>
</template>

<script setup>
import { QUICK_RANGES } from '@/data/reports/format'

// Emits [from, to]; the page sets its dates and runs Generate, like Desk.
defineProps({ ranges: { type: Array, required: true } })
defineEmits(['pick'])
</script>
