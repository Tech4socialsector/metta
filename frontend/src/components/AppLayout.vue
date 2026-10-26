<template>
  <!-- Top bar across the page, sidebar on the left, the page on the right:
  the Pathways app's frame (MIT, Tech4socialsector). A page that passes a
  title gets the standard page header with its actions. -->
  <div class="flex h-screen flex-col overflow-hidden bg-gray-50 text-[14px] text-gray-900">
    <TopBar />
    <div class="flex min-h-0 flex-1">
      <AppSidebar />
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader v-if="title" :title="title" :subtitle="subtitle" :back-to="backTo">
          <template v-if="$slots.meta" #meta><slot name="meta" /></template>
          <template #actions><slot name="actions" /></template>
        </PageHeader>
        <!-- relative + overflow-hidden on the frame: absolutely placed bits
        (a required label's screen-reader text) stay inside this scroll box
        instead of scrolling the whole page sideways and up under the bar. -->
        <!-- fill: the page itself doesn't scroll - a list inside it takes the
        remaining height and scrolls on its own (cards above stay put). -->
        <main class="relative flex min-h-0 min-w-0 flex-1 flex-col gap-5 p-6 [overflow-x:clip]" :class="fill ? 'overflow-y-hidden' : 'overflow-y-auto'">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import PageHeader from '@/components/PageHeader.vue'

defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  backTo: { type: [String, Object], default: '' },
  // Page of fixed bits (cards, filters) above one list that scrolls by itself.
  fill: Boolean,
})

// Ctrl+S / Cmd+S presses the page's own Save button, so the shortcut runs
// exactly what a click does (same checks, same messages). Only a visible,
// enabled button saying "Save..." (or marked data-save) counts - never
// Submit/Cancel, which can't be undone.
function onKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
  e.preventDefault()
  const buttons = [...document.querySelectorAll('[data-save], button')]
  const save = buttons.find((b) => !b.disabled && b.offsetParent !== null && (b.hasAttribute('data-save') || /^save\b/i.test(b.textContent.trim())))
  save?.click()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
