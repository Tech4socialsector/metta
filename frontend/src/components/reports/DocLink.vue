<template>
  <router-link v-if="name" :to="viewRoute(doctype, name)" class="font-mono text-brand-700 hover:underline" :target="newTab ? '_blank' : undefined">{{ label || name }}</router-link>
</template>

<script setup>
import { viewRoute } from '@/data/formMenu'

// A document number in a report opens that record (its Vue screen, or the
// generic form) - Desk's /app/<doctype>/<name> link.
defineProps({
  doctype: { type: String, required: true },
  name: { type: String, default: '' },
  label: { type: String, default: '' },
  newTab: Boolean,
})
</script>
