<template>
  <ReportShell title="Lab Test Register" :roles="meta.roles" :loading="loading" :error="error">
    <template #actions>
      <div class="flex items-center gap-2">
        <button type="button" :class="EXP_BTN" :disabled="!rows || !rows.length" @click="exportAs('Excel')">Excel</button>
        <button type="button" :class="EXP_BTN" :disabled="!rows || !rows.length" @click="exportAs('CSV')">CSV</button>
      </div>
    </template>

    <template #filters>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <TextField id="ltr-from" v-model="f.from_date" label="From Date" type="date" />
        <TextField id="ltr-to" v-model="f.to_date" label="To Date" type="date" />
        <SelectField id="ltr-status" v-model="f.status" label="Status" :options="['', 'Ordered', 'Sample Collected', 'Result Entered', 'Reported', 'Cancelled']" />
        <SelectField id="ltr-type" v-model="f.test_type" label="Type" :options="['', 'Lab Test', 'X-Ray', 'Scan', 'Other']" />
        <label class="flex h-11 items-center gap-2 text-sm"><input v-model="f.late_only" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-brand-700" /> Late only</label>
        <div><button type="button" :class="GEN_BTN" @click="generate">Generate</button></div>
      </div>
    </template>

    <ReportTable v-if="rows" :columns="columns" :rows="rows" empty="Nothing to show" />
  </ReportShell>
</template>

<script setup>
import { reactive, ref } from 'vue'
import ReportShell from '@/components/reports/ReportShell.vue'
import ReportTable from '@/components/reports/ReportTable.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import { useRunner } from '@/data/reports/useRunner'
import { reportByRoute, GEN_BTN } from '@/data/reports/catalog'
import { todayStr } from '@/data/reports/format'
import { exportQueryReport } from '@/data/reports/export'
import { QUERY_REPORT_RUN, queryReportArgs, normaliseColumns, normaliseRows } from '@/data/reports/queryReport'

// Desk script report: metta/laboratory/report/lab_test_register.
const REPORT = 'Lab Test Register'
const meta = reportByRoute('ReportsLabTestRegister')
const EXP_BTN = 'h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

const { loading, error, run } = useRunner()
// lab_test_register.js: month start to today.
const f = reactive({ from_date: `${todayStr().slice(0, 8)}01`, to_date: todayStr(), status: '', test_type: '', late_only: false })
const columns = ref([])
const rows = ref(null)

// Check filters go to the server as 1/0, like Desk's.
const args = () => ({ ...f, late_only: f.late_only ? 1 : 0 })

async function generate() {
  const r = await run(QUERY_REPORT_RUN, queryReportArgs(REPORT, args()))
  if (!r) return
  columns.value = normaliseColumns(r.columns)
  rows.value = normaliseRows(r.result, columns.value)
}
generate()

function exportAs(format) {
  exportQueryReport(REPORT, args(), format)
}
</script>
