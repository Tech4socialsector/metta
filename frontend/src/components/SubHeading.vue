<template>
  <!-- A sub-heading inside a form section (Basic details, Address ...).
  Same as the CHW app's section bands: a light tinted band with a round
  icon dot, green (main colour) and navy (accent) taking turns section by
  section - the turn-taking is the .hm-subhead rule in index.css. Without
  the compact look it is a plain line instead of a band. Anything in the
  "end" slot (a link, Show/Hide, Refresh) sits at the right. -->
  <div class="hm-subhead flex items-center gap-2" :class="compact ? 'hm-band rounded-md px-3 py-1.5' : 'border-b pb-1'">
    <h3 class="flex flex-1 items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide">
      <span v-if="icon" class="hm-dot flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white">
        <LucideIcon :name="icon" class="h-3.5 w-3.5" />
      </span>
      <slot />
    </h3>
    <slot name="end" />
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { fieldLook } from '@/data/fieldLook'

const { compact } = fieldLook()

defineProps({
  // Lucide icon name
  icon: { type: String, default: '' },
})
</script>
