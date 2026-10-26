<template>
  <button
    type="button"
    class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
    aria-label="Go back"
    @click="goBack"
  >
    <LucideIcon name="arrow-left" class="h-4 w-4" />
    <span>Back</span>
  </button>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
// Pattern from the Pathways app (MIT, Tech4socialsector).
import { useRouter } from 'vue-router'

const props = defineProps({
  // Where to go when the page was opened directly (link, bookmark, new tab).
  fallback: { type: [String, Object], default: '/home' },
})

const router = useRouter()

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push(props.fallback)
}
</script>
