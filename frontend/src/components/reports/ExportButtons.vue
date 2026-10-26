<template>
  <div class="flex items-center gap-2">
    <button type="button" :class="btn" :disabled="!ready" :title="ready ? '' : 'Generate the report first'" @click="excel">Excel</button>
    <button type="button" :class="btn" :disabled="!ready" :title="ready ? '' : 'Generate the report first'" @click="pdfOpen = true">PDF / Print</button>
  </div>

  <!-- Same options Desk's "PDF Export Options" dialog asks for. -->
  <AppDialog v-model="pdfOpen" title="PDF Export Options">
    <div class="flex flex-col gap-4">
      <SelectField id="pdf-page-size" v-model="pageSize" label="Page Size" :options="['A4', 'Letter', 'Legal']" reqd />
      <SelectField id="pdf-orientation" v-model="orientation" label="Orientation" :options="['Portrait', 'Landscape']" reqd />
    </div>
    <template #footer>
      <button type="button" class="h-9 rounded-md border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-50" @click="pdfOpen = false">Cancel</button>
      <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" @click="pdf">Download</button>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import SelectField from '@/components/SelectField.vue'
import { hasRows, exportExcel, exportPdf } from '@/data/reports/export'

// getData() builds the export payload from what's on screen right now
// ({ title, subtitle, columns, rows } or { title, subtitle, sections }),
// read fresh on every click like Desk's get_export_data().
const props = defineProps({ getData: { type: Function, required: true } })

const btn = 'h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
const ready = computed(() => hasRows(props.getData()))
const pdfOpen = ref(false)
const pageSize = ref('A4')
const orientation = ref('Portrait')

function excel() {
  const data = props.getData()
  if (hasRows(data)) exportExcel(data)
}
function pdf() {
  const data = props.getData()
  if (hasRows(data)) exportPdf(data, { page_size: pageSize.value, orientation: orientation.value })
  pdfOpen.value = false
}
</script>
