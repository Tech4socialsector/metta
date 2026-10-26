<template>
  <!-- List view in the style of the Pathways app's DataTable (MIT,
  Tech4socialsector), reading the doctype's own Desk settings, with paging
  done on the server so large lists stay fast. With fill, the list takes the
  page's remaining height and only its rows scroll (heading row pinned). -->
  <div class="flex flex-col gap-4" :class="fill && 'min-h-0 flex-1'">
    <!-- Status tabs with counts (optional) -->
    <div v-if="tabs.length" role="tablist" class="flex gap-1 border-b border-gray-200">
      <button
        v-for="(t, i) in tabs"
        :key="t.label"
        type="button"
        role="tab"
        :aria-selected="tab === i"
        class="relative flex h-10 items-center gap-2 px-3 text-sm font-medium"
        :class="tab === i ? 'text-brand-800' : 'text-gray-600 hover:text-gray-900'"
        @click="tab = i"
      >
        {{ t.label }}
        <span class="rounded-full px-1.5 text-xs" :class="tab === i ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-700'">{{ tabCounts[i] ?? '…' }}</span>
        <span v-if="tab === i" class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-700" />
      </button>
    </div>

    <!-- Toolbar: search, quick filters | Filter, Columns -->
    <div class="flex flex-wrap items-start gap-2">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div class="relative w-full sm:w-64">
          <LucideIcon name="search" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input v-model="search" type="search" :placeholder="`Search ${doctype}`" :aria-label="`Search ${doctype}`" class="h-8 w-full rounded-md border border-gray-300 bg-white pl-8 pr-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
        </div>
        <MultiSelectFilter v-for="df in quickFilters" :key="df.fieldname" v-model="quick[df.fieldname]" :label="df.label" :options="choiceOptions(df)" />
        <button v-if="isFiltered" type="button" class="h-8 rounded-md px-2.5 text-sm text-gray-600 hover:bg-gray-100" @click="clearAll">Clear</button>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <FilterBuilder v-model="conditions" :fields="filterFields" />
        <ColumnPicker :model-value="columnNames" :fields="pickableFields" :defaults="defaultColumnNames" @update:model-value="setColumns" />
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white hover:bg-gray-50" aria-label="Refresh" title="Refresh" @click="reload">
          <LucideIcon name="refresh-cw" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Bulk bar when rows are ticked -->
    <div v-if="selected.size" class="flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
      <span class="font-semibold">{{ selected.size }} selected</span>
      <button v-if="canExport" type="button" class="font-semibold underline" @click="exportExcel">Export Excel</button>
      <button type="button" class="font-semibold underline" @click="exportCsv">Export CSV</button>
      <button v-if="canDelete" type="button" class="font-semibold text-red-700 underline" @click="confirmDelete = true">Delete</button>
      <button type="button" class="ml-auto text-brand-800 hover:underline" @click="selected.clear()">Clear</button>
    </div>
    <p v-if="deleteNote" class="rounded-lg px-3 py-2 text-sm" :class="deleteNote.failed.length ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'" role="status">
      <span v-if="deleteNote.done">{{ deleteNote.done }} deleted.</span>
      <span v-for="f in deleteNote.failed" :key="f.name" class="block">{{ f.name }} not deleted: {{ f.reason }}</span>
    </p>

    <AppDialog v-model="confirmDelete" :title="`Delete ${selected.size} ${selected.size === 1 ? 'record' : 'records'}?`">
      <p class="text-sm text-gray-700">This can't be undone. Records already used elsewhere (for example a patient with visits or bills) are kept, and you'll see why.</p>
      <template #footer>
        <button type="button" class="h-9 rounded-lg border border-gray-300 px-4 text-sm font-semibold hover:bg-gray-50" @click="confirmDelete = false">Cancel</button>
        <button type="button" class="h-9 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60" :disabled="deleting" @click="deleteSelected">{{ deleting ? 'Deleting…' : 'Delete' }}</button>
      </template>
    </AppDialog>

    <p v-if="error" class="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      {{ error }} <button type="button" class="font-semibold underline" @click="reload">Retry</button>
    </p>

    <section class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm" :class="fill && 'flex min-h-0 flex-1 flex-col'">
      <!-- Loading skeleton -->
      <div v-if="loading && !rows.length" class="divide-y divide-gray-100" aria-busy="true">
        <div v-for="i in 6" :key="i" class="flex items-center gap-6 px-4 py-3.5">
          <div class="h-4 w-48 animate-pulse rounded bg-gray-100" />
          <div class="h-4 w-24 animate-pulse rounded bg-gray-100" />
          <div class="h-4 w-32 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
      <!-- Empty state -->
      <div v-else-if="!rows.length" class="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700"><LucideIcon name="inbox" class="h-5 w-5" /></span>
        <p class="text-base font-medium text-gray-900">{{ isFiltered ? 'No records match' : `No ${doctype} yet` }}</p>
        <button v-if="isFiltered" type="button" class="h-8 rounded-md border border-gray-300 px-3 text-sm font-medium hover:bg-gray-50" @click="clearAll">Clear filters</button>
      </div>
      <div v-else class="overflow-x-auto" :class="[loading && 'opacity-60', fill && 'min-h-[200px] flex-1 overflow-y-auto']">
        <!-- Fits the screen: columns share the width (table-fixed), long headings
        wrap, long values are cut with … (full text on hover). Only a very
        narrow screen (min 720px) scrolls inside this box. -->
        <table class="w-full min-w-[720px] table-fixed text-sm">
          <thead class="sticky top-0 z-10 border-b border-brand-100 bg-brand-50 text-left text-xs uppercase text-brand-800">
            <tr>
              <th class="w-10 px-4 py-2" @click.stop>
                <input type="checkbox" class="rounded border-gray-300 text-brand-700 focus:ring-brand-700" :checked="allOnPage" :indeterminate.prop="someOnPage && !allOnPage" aria-label="Select all rows on this page" @change="togglePage($event.target.checked)" />
              </th>
              <th v-for="(c, i) in shownColumns" :key="c.fieldname" class="cursor-pointer select-none break-words px-4 py-2 align-bottom font-medium leading-tight hover:text-brand-900" :class="[isNumeric(c) && 'text-right', i === 0 && 'w-[22%]']" @click="toggleSort(c.fieldname)">
                {{ c.label }}<span v-if="sortField === c.fieldname" class="ml-0.5">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="w-24 cursor-pointer select-none whitespace-nowrap px-4 py-2 text-right align-bottom font-medium hover:text-brand-900" @click="toggleSort('modified')">
                Updated<span v-if="sortField === 'modified'" class="ml-0.5">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.name" class="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50" :class="selected.has(r.name) && 'bg-brand-50/60'" @click="router.push(rowRoute(r))">
              <td class="w-10 px-4 py-2.5" @click.stop>
                <input type="checkbox" class="rounded border-gray-300 text-brand-700 focus:ring-brand-700" :checked="selected.has(r.name)" :aria-label="`Select ${r.name}`" @change="toggleRow(r.name, $event.target.checked)" />
              </td>
              <td v-for="(c, i) in shownColumns" :key="c.fieldname" class="overflow-hidden whitespace-nowrap px-4 py-2.5" :class="[i === 0 ? 'font-medium text-gray-900' : 'text-gray-600', isNumeric(c) && 'text-right']">
                <router-link v-if="i === 0" :to="rowRoute(r)" class="block truncate hover:text-brand-700" :title="cellText(c, r)" @click.stop>{{ cellText(c, r) }}</router-link>
                <StatusBadge v-else-if="c.fieldtype === 'Select' && isKnownStatus(r[c.fieldname])" :status="r[c.fieldname]" />
                <span v-else class="block truncate" :title="cellText(c, r)">{{ cellText(c, r) }}</span>
              </td>
              <td class="whitespace-nowrap px-4 py-2.5 text-right text-xs text-gray-500" :title="r.modified">{{ ago(r.modified) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Footer: range, page size, pages -->
    <div v-if="total" class="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
      <span class="tabular-nums">Showing {{ start + 1 }}–{{ Math.min(start + pageSize, total) }} of {{ total }}</span>
      <div class="flex items-center gap-2">
        <select v-model.number="pageSize" aria-label="Rows per page" class="h-8 rounded-md border-gray-300 text-sm">
          <option v-for="n in [20, 50, 100]" :key="n" :value="n">{{ n }} / page</option>
        </select>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white disabled:opacity-40" :disabled="page === 1" aria-label="Previous page" @click="page--">
          <LucideIcon name="chevron-left" class="h-4 w-4" />
        </button>
        <span class="tabular-nums">Page {{ page }} of {{ pageCount }}</span>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white disabled:opacity-40" :disabled="page >= pageCount" aria-label="Next page" @click="page++">
          <LucideIcon name="chevron-right" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { call, debounce } from 'frappe-ui'
import MultiSelectFilter from '@/components/MultiSelectFilter.vue'
import FilterBuilder from '@/components/FilterBuilder.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { getMeta, formatValue } from '@/data/meta'
import { errorText } from '@/data/api'
import { isKnownStatus } from '@/data/status'
import AppDialog from '@/components/AppDialog.vue'
import { formInfo, loadFormMenu } from '@/data/formMenu'
import { postDownload } from '@/data/reports/export'

const props = defineProps({
  doctype: { type: String, required: true },
  // (row) => route location of a row
  rowRoute: { type: Function, required: true },
  // [{ label, filters: [[field, op, value]] }] - tabs above the list
  tabs: { type: Array, default: () => [] },
  // Fixed filters the page decides (e.g. the card picked on Patients),
  // always applied under the tabs and the user's own filters.
  filters: { type: Array, default: () => [] },
  // Fill the page's remaining height; only the rows scroll (use with AppLayout fill).
  fill: Boolean,
  // Re-read every N seconds while open (0 = never)
  autoRefresh: { type: Number, default: 0 },
  // Starting sort, e.g. a worklist opens oldest first: sort="creation" sort-dir="asc"
  sort: { type: String, default: 'modified' },
  sortDir: { type: String, default: 'desc' },
})

const router = useRouter()
const NO_VALUE = ['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Button', 'Table', 'Table MultiSelect', 'Fold', 'Heading', 'Image', 'Attach Image', 'Text Editor', 'Code']

const meta = ref(null)
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const tab = ref(0)
const tabCounts = ref([])
const search = ref('')
const quick = reactive({})
const conditions = ref([])
const columnNames = ref([])
const sortField = ref(props.sort)
const sortDir = ref(props.sortDir)
const page = ref(1)
const pageSize = ref(20)
const selected = reactive(new Set())

const titleField = computed(() => meta.value?.title_field || 'name')
const valueFields = computed(() => (meta.value?.fields || []).filter((f) => !NO_VALUE.includes(f.fieldtype) && !f.hidden))
const byName = computed(() => Object.fromEntries(valueFields.value.map((f) => [f.fieldname, f])))
const idField = { fieldname: 'name', label: 'ID', fieldtype: 'Data' }

// First column is the record's title (Desk's title_field), then the
// doctype's "In List View" fields, as in Desk.
const defaultColumnNames = computed(() => {
  const title = titleField.value
  const list = valueFields.value.filter((f) => f.in_list_view && f.fieldname !== title).map((f) => f.fieldname)
  return [title, ...list.slice(0, 5)]
})
const pickableFields = computed(() => [idField, ...valueFields.value])
const shownColumns = computed(() =>
  columnNames.value.map((n) => (n === 'name' ? idField : byName.value[n])).filter(Boolean),
)
// Quick filters: Desk's "In Standard Filter" fields that have fixed choices.
const quickFilters = computed(() => valueFields.value.filter((f) => f.in_standard_filter && ['Select', 'Check'].includes(f.fieldtype)))
const filterFields = computed(() => [idField, ...valueFields.value])
const isFiltered = computed(() => !!search.value.trim() || conditions.value.length > 0 || Object.values(quick).some((v) => v && v.length))

const start = computed(() => (page.value - 1) * pageSize.value)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const allOnPage = computed(() => rows.value.length > 0 && rows.value.every((r) => selected.has(r.name)))
const someOnPage = computed(() => rows.value.some((r) => selected.has(r.name)))

function choiceOptions(df) {
  if (df.fieldtype === 'Check') return ['Yes', 'No']
  return String(df.options || '').split('\n').filter(Boolean)
}
function isNumeric(df) {
  return ['Currency', 'Float', 'Int', 'Percent'].includes(df.fieldtype)
}
function cellText(c, r) {
  const v = r[c.fieldname]
  if (v === null || v === undefined || v === '') return ''
  return formatValue(c, v)
}
function ago(ts) {
  if (!ts) return ''
  const s = Math.max(0, (Date.now() - new Date(String(ts).replace(' ', 'T')).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)} m`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d`
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))} M`
  return `${Math.floor(s / (86400 * 365))} y`
}

// Everything on screen turned into Frappe filters.
function buildFilters(tabIndex) {
  const out = [...props.filters, ...(props.tabs[tabIndex]?.filters || [])]
  for (const df of quickFilters.value) {
    const vals = quick[df.fieldname] || []
    if (!vals.length) continue
    out.push([df.fieldname, 'in', df.fieldtype === 'Check' ? vals.map((v) => (v === 'Yes' ? 1 : 0)) : vals])
  }
  for (const c of conditions.value) {
    const df = c.field === 'name' ? idField : byName.value[c.field] || {}
    let v = c.value
    if (df.fieldtype === 'Check') v = v === 'Yes' ? 1 : 0
    if (c.op === 'set' || c.op === 'not set') out.push([c.field, 'is', c.op])
    else if (c.op === 'between') out.push([c.field, 'between', [v, c.value2 || v]])
    else if (c.op === 'like' || c.op === 'not like') out.push([c.field, c.op, `%${v}%`])
    else out.push([c.field, c.op, v])
  }
  return out
}
// The search box looks in the ID, the title and Desk's search fields.
function buildOrFilters() {
  const t = search.value.trim()
  if (!t) return []
  const names = new Set(['name', titleField.value, ...String(meta.value?.search_fields || '').split(',').map((s) => s.trim())])
  return [...names].filter((n) => n === 'name' || byName.value[n]).map((n) => [n, 'like', `%${t}%`])
}

async function count(filters, orFilters) {
  return call('frappe.desk.reportview.get_count', { doctype: props.doctype, filters, or_filters: orFilters })
}

async function reload() {
  if (!meta.value) return
  loading.value = true
  error.value = ''
  const filters = buildFilters(tab.value)
  const orFilters = buildOrFilters()
  try {
    const fields = Array.from(new Set(['name', 'modified', ...columnNames.value]))
    const [list, n] = await Promise.all([
      call('frappe.client.get_list', {
        doctype: props.doctype,
        fields,
        filters,
        or_filters: orFilters.length ? orFilters : undefined,
        order_by: `${sortField.value} ${sortDir.value}`,
        limit_start: start.value,
        limit_page_length: pageSize.value,
      }),
      count(filters, orFilters),
    ])
    rows.value = list
    total.value = n
    if (props.tabs.length) {
      tabCounts.value = await Promise.all(props.tabs.map((t, i) => (i === tab.value ? n : count(buildFilters(i), orFilters))))
    }
  } catch (err) {
    error.value = errorText(err) || 'Could not load the list.'
  } finally {
    loading.value = false
  }
}

function toggleSort(field) {
  if (sortField.value === field) sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}
function toggleRow(name, on) {
  if (on) selected.add(name)
  else selected.delete(name)
}
function togglePage(on) {
  for (const r of rows.value) toggleRow(r.name, on)
}
function clearAll() {
  search.value = ''
  conditions.value = []
  for (const k of Object.keys(quick)) quick[k] = []
}

// CSV of the ticked rows that are on screen, with the shown columns.
function exportCsv() {
  const pick = rows.value.filter((r) => selected.has(r.name))
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const lines = [shownColumns.value.map((c) => esc(c.label)).join(',')]
  for (const r of pick) lines.push(shownColumns.value.map((c) => esc(cellText(c, r))).join(','))
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.doctype}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// Same file as Desk's list "Export" (frappe.desk.reportview.export_query):
// the ticked records, with the columns shown here.
function exportExcel() {
  postDownload('frappe.desk.reportview.export_query', {
    doctype: props.doctype,
    title: props.doctype,
    file_format_type: 'Excel',
    fields: JSON.stringify(['name', ...shownColumns.value.map((c) => c.fieldname).filter((f) => f !== 'name')].map((f) => `\`tab${props.doctype}\`.\`${f}\``)),
    selected_items: JSON.stringify([...selected]),
  })
}

// Delete and Export Excel follow the user's Desk permissions.
const canDelete = computed(() => !!formInfo(props.doctype)?.can_delete)
const canExport = computed(() => !!formInfo(props.doctype)?.can_export)
const confirmDelete = ref(false)
const deleting = ref(false)
const deleteNote = ref(null)

// One record at a time through frappe.client.delete, so Desk's own checks
// (links, submitted documents, permissions) apply and each refusal can be
// shown next to its record instead of one vague error.
async function deleteSelected() {
  deleting.value = true
  const failed = []
  let done = 0
  for (const name of [...selected]) {
    try {
      await call('frappe.client.delete', { doctype: props.doctype, name })
      selected.delete(name)
      done++
    } catch (err) {
      failed.push({ name, reason: errorText(err) || 'Could not delete.' })
    }
  }
  deleting.value = false
  confirmDelete.value = false
  deleteNote.value = { done, failed }
  reload()
}

// Watchers stay quiet until the first load is done, so opening the page
// loads the list once.
let ready = false
// Any change of filters goes back to page 1; paging just reloads.
const reloadFromStart = () => {
  if (!ready) return
  if (page.value !== 1) page.value = 1
  else reload()
}
const reloadSoon = debounce(reloadFromStart, 300)
watch(search, reloadSoon)
watch(quick, reloadFromStart, { deep: true })
watch([conditions, tab, sortField, sortDir, pageSize, columnNames], reloadFromStart)
watch(() => JSON.stringify(props.filters), reloadFromStart)
watch(page, reload)

let timer = null
onMounted(async () => {
  loadFormMenu()
  try {
    meta.value = (await getMeta(props.doctype)).meta
  } catch (err) {
    error.value = errorText(err)
    return
  }
  for (const df of quickFilters.value) quick[df.fieldname] = []
  columnNames.value = loadColumns() || defaultColumnNames.value
  await reload()
  ready = true
  if (props.autoRefresh) timer = setInterval(reload, props.autoRefresh * 1000)
})
onBeforeUnmount(() => timer && clearInterval(timer))

// Chosen columns are remembered per doctype on this browser.
const COL_KEY = `hmis-columns:${props.doctype}`
function loadColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_KEY) || 'null')
    return Array.isArray(saved) && saved.length ? saved : null
  } catch {
    return null
  }
}
// Saved only when the user picks columns, so an untouched list keeps
// following the doctype's Desk "In List View" settings.
function setColumns(v) {
  columnNames.value = v
  try {
    if (v === null) localStorage.removeItem(COL_KEY)
    else localStorage.setItem(COL_KEY, JSON.stringify(v))
  } catch {
    // not remembered - fine
  }
  if (v === null) columnNames.value = defaultColumnNames.value
}
</script>
