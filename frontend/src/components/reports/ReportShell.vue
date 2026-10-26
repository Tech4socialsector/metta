<template>
  <!-- Every report page: header with Export, filter bar, then the results. -->
  <AppLayout :title="title" :subtitle="subtitle" :back-to="{ name: 'ReportsHome' }">
    <template #actions><slot name="actions" /></template>

    <p v-if="denied" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">You don't have access to this report.</p>
    <template v-else>
      <section v-if="$slots.filters" class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <slot name="filters" />
      </section>

      <p v-if="error" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>
      <p v-if="loading" class="text-sm text-gray-600" aria-live="polite">Loading…</p>

      <slot />
    </template>
  </AppLayout>
</template>

<script setup>
import { computed } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import { session, hasRole } from '@/data/session'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  // Roles from the Desk page's own .json; System Manager always passes.
  // Empty = System Manager only. null = no check.
  roles: { type: Array, default: null },
  loading: Boolean,
  error: { type: String, default: '' },
})

// Roles arrive a moment after the page loads - don't flash "no access"
// before they're known. The server still checks every call regardless.
const denied = computed(() => props.roles !== null && session.roles.length > 0 && !hasRole(...props.roles))
</script>
