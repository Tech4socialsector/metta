<template>
  <!-- One card on a section / Masters / Reports page (style A, picked
  2026-10-26): icon tile, name and an optional one-line hint; the whole card
  opens the list or page. "+ New" is a light text link in the corner, laid
  over the card (a link can't sit inside another link), so the page stays
  calm instead of a wall of solid buttons. -->
  <div class="group relative flex items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-[0_4px_14px_rgb(var(--brand-700)/0.12)] motion-reduce:transition-none">
    <component :is="to ? 'router-link' : 'a'" v-bind="to ? { to } : { href }" class="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" :aria-label="label" />
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" :class="tone">
      <LucideIcon :name="icon" class="h-[22px] w-[22px]" />
    </span>
    <span class="min-w-0 flex-1">
      <!-- Black text on the cards (user, 2026-10-26). -->
      <span class="block text-[15.5px] font-bold leading-snug text-gray-900">{{ label }}</span>
      <span v-if="hint" class="mt-0.5 line-clamp-2 block text-[12.5px] text-gray-700">{{ hint }}</span>
    </span>
    <router-link v-if="create" :to="create" class="relative z-10 self-start whitespace-nowrap rounded-md px-2 py-0.5 text-[12.5px] font-semibold text-brand-700 hover:bg-brand-50" :aria-label="`New ${label}`">+ New</router-link>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'

defineProps({
  label: { type: String, required: true },
  icon: { type: String, default: 'file-text' },
  // Classes for the icon tile, e.g. 'bg-brand-50 text-brand-700'
  tone: { type: String, default: 'bg-brand-50 text-brand-700' },
  hint: { type: String, default: '' },
  // Where the card goes: a router location, or a plain href (Desk pages)
  to: { type: [Object, String], default: null },
  href: { type: String, default: '' },
  // Router location of "+ New" (only when this user may create one)
  create: { type: [Object, String], default: null },
})
</script>
