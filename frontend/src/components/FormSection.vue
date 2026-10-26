<template>
  <!-- One form section the way Desk lays it out: a heading, then fields in
  fixed, equal columns. Every box keeps its column's width, so fields line
  up from row to row; a field that needs the whole row gets .span-row.
  Rows fill left to right in the order the fields are written. -->
  <section class="flex flex-col gap-3">
    <SubHeading v-if="title" :icon="icon">
      {{ title }}
      <template v-if="$slots.end" #end><slot name="end" /></template>
    </SubHeading>
    <div class="grid grid-cols-1 gap-x-5 gap-y-3" :class="COLS[cols]">
      <slot />
    </div>
  </section>
</template>

<script setup>
import SubHeading from '@/components/SubHeading.vue'

defineProps({
  title: { type: String, default: '' },
  // Lucide icon name
  icon: { type: String, default: '' },
  // columns on a wide screen (1-4); fewer on narrow screens
  cols: { type: Number, default: 3 },
})

// Written out in full so Tailwind keeps these classes in the build.
const COLS = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 xl:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
}
</script>

<style scoped>
.grid > :deep(.span-row) {
  grid-column: 1 / -1;
}
</style>
