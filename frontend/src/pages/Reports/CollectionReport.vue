<template>
  <ReportShell title="Collection Report" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions>
      <div class="flex items-center gap-2">
        <button type="button" :class="EXP_BTN" :disabled="!rows || !rows.length" @click="exportAs('Excel')">Excel</button>
        <button type="button" :class="EXP_BTN" :disabled="!rows || !rows.length" @click="exportAs('CSV')">CSV</button>
      </div>
    </template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="cr-from" v-model="f.from_date" label="From Date" type="date" />
        <TextField id="cr-to" v-model="f.to_date" label="To Date" type="date" />
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
    </template>

    <ReportTable v-if="rows" :columns="columns" :rows="body" :total="total" empty="Nothing to show" />
  </ReportShell>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import TextField from '@/components/TextField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { todayStr } from '@/data/reports/format'
import { exportQueryReport } from '@/data/reports/export'
import { QUERY_REPORT_RUN, queryReportArgs, normaliseColumns, normaliseRows } from '@/data/reports/queryReport'

// Desk script report: metta/sales/report/collection_report (run through
// frappe.desk.query_report.run, so figures are Desk's own).
const REPORT = 'Collection Report'
const meta = reportByRoute('ReportsCollectionReport')
const EXP_BTN = 'h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

const { loading, error, run } = useRunner()
// collection_report.js: both dates default to today, neither is mandatory.
const f = reactive({ from_date: todayStr(), to_date: todayStr() })
const columns = ref([])
const rows = ref(null)

async function generate() {
  const r = await run(QUERY_REPORT_RUN, queryReportArgs(REPORT, f))
  if (!r) return
  columns.value = normaliseColumns(r.columns)
  rows.value = normaliseRows(r.result, columns.value)
}
// Desk's query report runs as soon as it opens.
generate()

// get_data() appends its own "Total" row (add_total_row is off) - shown as
// the highlighted last row.
const hasTotal = computed(() => rows.value?.length && rows.value[rows.value.length - 1].user_name === 'Total')
const body = computed(() => (hasTotal.value ? rows.value.slice(0, -1) : rows.value || []))
const total = computed(() => (hasTotal.value ? rows.value[rows.value.length - 1] : null))

function exportAs(format) {
  exportQueryReport(REPORT, f, format)
}
</script>
