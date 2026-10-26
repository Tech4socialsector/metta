<template>
  <!-- A sub-heading inside a form section (Basic details, Address ...):
  brand-colour capitals and icon, thin line under it. In the compact
  look it sits on a light brand band instead of the line. Anything in the
  "end" slot (a link, Show/Hide, Refresh) sits at the right. -->
  <div class="flex items-center gap-2" :class="compact ? 'rounded-md bg-brand-100 px-3 py-1.5' : 'border-b border-brand-200 pb-1'">
    <h3 class="flex flex-1 items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide text-brand-800">
      <LucideIcon v-if="icon" :name="icon" class="h-4 w-4 text-brand-700" />
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
