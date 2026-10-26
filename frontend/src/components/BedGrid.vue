<template>
  <div class="flex flex-col gap-2">
    <p v-if="loading" class="text-sm text-gray-600">Loading beds…</p>
    <!-- Desk's message for a ward/room whose beds aren't listed yet. -->
    <p v-else-if="!beds.length" class="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
      Individual beds are not listed for this {{ kind }} yet — add them under Beds on the {{ kind === 'room' ? 'Room Master' : 'Ward Master' }} record to see bed-wise status here.
    </p>
    <template v-else>
      <p class="text-sm text-gray-700">
        <b class="text-green-800">{{ freeCount }} available</b>, <b class="text-accent-800">{{ beds.length - freeCount }} occupied</b> — pick a free bed
      </p>
      <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="`Beds in this ${kind}`">
        <button
          v-for="b in beds"
          :key="b.bed_no"
          type="button"
          role="radio"
          :aria-checked="modelValue === b.bed_no"
          :disabled="b.status !== 'Available'"
          :title="b.status === 'Available' ? (modelValue === b.bed_no ? 'Selected (not saved yet)' : 'Available') : 'Occupied'"
          class="flex h-16 w-16 flex-col items-center justify-center rounded-lg text-sm font-bold"
          :class="tileClass(b)"
          @click="$emit('update:modelValue', b.bed_no)"
        >
          <span class="text-[10px] font-semibold uppercase tracking-wide">{{ b.status === 'Available' ? (modelValue === b.bed_no ? 'Chosen' : 'Free') : 'Taken' }}</span>
          {{ b.bed_no }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  beds: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  kind: { type: String, default: 'ward' },
  loading: Boolean,
})
defineEmits(['update:modelValue'])

const freeCount = computed(() => props.beds.filter((b) => b.status === 'Available').length)

// Same meaning as Desk's tiles: free = green and clickable, taken = faded
// and blocked; the picked one is marked until the admission is saved.
function tileClass(b) {
  if (b.status !== 'Available') return 'cursor-not-allowed bg-accent-100 text-accent-900 opacity-60'
  if (props.modelValue === b.bed_no) return 'bg-brand-700 text-white ring-4 ring-amber-300'
  return 'bg-green-700 text-white hover:bg-green-800'
}
</script>
