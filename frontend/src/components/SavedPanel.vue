<template>
  <!-- Kept deliberately simple: what was saved, and the two things the
  counter does next. -->
  <section class="mx-auto flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-800">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </div>
    <div class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold text-gray-900">{{ title }}</h1>
      <p class="text-lg text-gray-800">{{ patientName }}</p>
      <p class="text-gray-700">
        UHIN <b class="font-mono text-gray-900">{{ uhin }}</b> · OP <b class="font-mono text-gray-900">{{ visitName }}</b>
      </p>
    </div>
    <div class="flex flex-wrap justify-center gap-3">
      <button type="button" class="h-12 rounded-lg bg-brand-700 px-6 font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="printing" @click="printReceipt">
        {{ printing ? 'Preparing…' : 'Print receipt' }}
      </button>
      <slot />
    </div>
    <p v-if="printError" class="text-sm text-red-700">{{ printError }}</p>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { api, errorText, VISIT } from '@/data/api'

const props = defineProps({
  title: { type: String, required: true },
  patientName: { type: String, default: '' },
  uhin: { type: String, required: true },
  visitName: { type: String, required: true },
})

const printing = ref(false)
const printError = ref('')

// Same receipt print format as Desk's Print Receipt.
async function printReceipt() {
  printing.value = true
  printError.value = ''
  try {
    const html = await api(`${VISIT}.get_receipt_html`, { registration: props.visitName })
    const w = window.open('', '_blank')
    w.document.open()
    w.document.write(`<html><head><title>${props.visitName}</title></head><body>${html}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  } catch (err) {
    printError.value = errorText(err)
  } finally {
    printing.value = false
  }
}
</script>
