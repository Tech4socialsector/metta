<template>
  <div class="border-b border-gray-200 bg-white px-6 py-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-3">
        <BackButton v-if="showBack" :fallback="backFallback" class="mt-0.5" />
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-accent-900">{{ title }}</h1>
          <p v-if="subtitle" class="mt-0.5 text-sm text-gray-500">{{ subtitle }}</p>
          <slot name="meta" />
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
// Pattern from the Pathways app (MIT, Tech4socialsector): title, short
// subtitle, actions on the right, and Back on pages below a section.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BackButton from '@/components/BackButton.vue'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  backTo: { type: [String, Object], default: '' },
})

const route = useRoute()
const router = useRouter()

// List pages are reached from the sidebar; only pages below them get Back.
const showBack = computed(() => route.path.split('/').filter(Boolean).length > 1)

const backFallback = computed(() => {
  if (props.backTo) return props.backTo
  const parts = route.path.split('/').filter(Boolean)
  if (parts.length > 1) {
    const parent = `/${parts.slice(0, -1).join('/')}`
    if (router.resolve(parent).matched.length) return parent
  }
  return '/home'
})
</script>
