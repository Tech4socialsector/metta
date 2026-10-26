<template>
  <!-- The title of a form section (Patient Registration, Today's OP Visit
  ...): brand-colour text and a full thin border, accent icon - the look
  agreed on New registration, shared so every screen matches. In the
  compact look it becomes a solid brand band with white text. -->
  <div
    class="flex flex-wrap items-center gap-2.5 rounded-lg px-4"
    :class="compact ? 'bg-brand-600 py-2.5 text-white' : 'border border-brand-200 bg-brand-50 py-2'"
  >
    <LucideIcon v-if="icon" :name="icon" class="h-5 w-5" :class="compact ? 'text-white' : 'text-accent-500'" />
    <h2 class="text-[17px] font-semibold" :class="compact ? 'text-white' : 'text-brand-700'">{{ title }}</h2>
    <slot />
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { fieldLook } from '@/data/fieldLook'

const { compact } = fieldLook()

defineProps({
  title: { type: String, required: true },
  // Lucide icon name
  icon: { type: String, default: '' },
})
</script>
