<template>
  <!-- Desk's "dialog with a Print button" (Discharge Bill's Print Bill). -->
  <Teleport to="body">
    <div v-if="html" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" @click.self="emit('close')">
      <div role="dialog" aria-modal="true" :aria-label="title" class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 class="text-lg font-semibold text-gray-900">{{ title }}</h2>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- server-rendered Print Format -->
        <div class="overflow-y-auto px-5 py-4" v-html="html" />
        <div class="flex justify-end border-t border-gray-200 px-5 py-3">
          <button type="button" class="h-9 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800" @click="print">Print</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  html: { type: String, default: '' },
  title: { type: String, required: true },
  docName: { type: String, default: '' },
})
const emit = defineEmits(['close'])

function print() {
  const w = window.open('', '_blank')
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  w.document.write(`<html><head><title>${esc(props.docName)}</title></head><body>${props.html}</body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
</script>
