<template>
  <!-- The title of a form section (Patient Registration, Today's OP Visit
  ...), as in the CHW app: a light tinted band, bold text and a round icon
  dot - green (main colour) and navy (accent) taking turns section by
  section through the same .hm-subhead rule as SubHeading. -->
  <div class="hm-subhead hm-band flex flex-wrap items-center gap-2.5 rounded-lg px-4 py-2.5">
    <span v-if="icon" class="hm-dot flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white">
      <LucideIcon :name="icon" class="h-4 w-4" />
    </span>
    <h2 class="text-[17px] font-bold">{{ title }}</h2>
    <slot />
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'

defineProps({
  title: { type: String, required: true },
  // Lucide icon name
  icon: { type: String, default: '' },
})
</script>
