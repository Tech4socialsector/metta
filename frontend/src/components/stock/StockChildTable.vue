<template>
  <!-- A Desk child table for the stock forms. Same as ChildTableEditor, plus
  what these Desk scripts need: a picker filter per row (set_query with the
  row), a change hook per cell (frappe.ui.form.on(<child>, field)), and
  quantity cells typed straight into the grid. -->
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-semibold text-gray-900">{{ df.label }}<span v-if="required" class="text-red-600"> *</span></span>
      <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{{ rows.length }} {{ rows.length === 1 ? 'row' : 'rows' }}</span>
    </div>
    <!-- Same heading look as every list; number columns line up on the right
    (their boxes sit flush right under the heading). -->
    <div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="border-b border-brand-100 bg-brand-50 text-left text-xs uppercase text-brand-800">
          <tr>
            <th class="w-12 px-3 py-2.5 font-medium">#</th>
            <th v-for="c in columns" :key="c.fieldname" class="whitespace-nowrap px-3 py-2.5 font-medium" :class="isNumber(c) && 'text-right'">{{ c.label }}</th>
            <th class="w-28 px-3 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 2" class="px-3 py-5 text-center text-gray-500">No rows yet.</td>
          </tr>
          <tr v-for="(row, i) in rows" :key="row.name || i" class="h-12 border-b border-gray-100 last:border-0 hover:bg-gray-50" :class="missingRows.has(i) && 'bg-amber-50'">
            <td class="px-3 py-2 text-gray-500 tabular-nums">{{ i + 1 }}</td>
            <td v-for="c in columns" :key="c.fieldname" class="max-w-[260px] px-3 py-1.5 text-gray-800" :class="isNumber(c) && 'text-right tabular-nums'">
              <input
                v-if="isNumber(c) && !cellReadOnly(c, row)"
                type="number"
                :step="c.fieldtype === 'Int' ? '1' : 'any'"
                :value="row[c.fieldname] ?? ''"
                :aria-label="`${c.label}, row ${i + 1}`"
                class="ctl ml-auto block w-24 text-right tabular-nums"
                @change="onCell(c, row, $event.target.value)"
              />
              <span v-else class="block truncate" :title="show(c, row[c.fieldname])">{{ show(c, row[c.fieldname]) }}</span>
            </td>
            <td class="whitespace-nowrap px-3 py-2">
              <div class="flex items-center justify-end gap-1">
                <button type="button" class="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50" @click="edit(i)">
                  <LucideIcon :name="rowEditable(row) ? 'pencil' : 'eye'" class="h-3.5 w-3.5" />{{ rowEditable(row) ? 'Edit' : 'View' }}
                </button>
                <button v-if="canAdd" type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50" :aria-label="`Delete row ${i + 1}`" @click="rows.splice(i, 1)"><LucideIcon name="trash-2" class="h-4 w-4" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="canAdd" type="button" class="self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50" @click="add">+ Add row</button>

    <AppDialog v-model="dialogOpen" :title="`${df.label || 'Row'} — row ${editing + 1}`">
      <div v-if="editRow" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <template v-for="cdf in rowFields" :key="cdf.fieldname">
          <FormField
            v-if="isVisible(cdf, editRow, parentDoc)"
            :class="WIDE.includes(cdf.fieldtype) && 'sm:col-span-2'"
            :df="cdf"
            :doc="editRow"
            :id-prefix="`${df.fieldname}-${editing}`"
            :filters="rowFilters ? rowFilters(cdf, editRow) : null"
            :model-value="editRow[cdf.fieldname]"
            :readonly="cellReadOnly(cdf, editRow)"
            :required="isRequired(cdf, editRow, parentDoc)"
            @update:model-value="(v) => emit('change', cdf, editRow, v)"
          />
        </template>
      </div>
      <template #footer>
        <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" @click="dialogOpen = false">Done</button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { computed, ref } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import FormField from '@/components/FormField.vue'
import { formatValue } from '@/data/meta'
import { LAYOUT_TYPES, isVisible, isRequired, isReadOnly, isEmpty } from '@/data/formEngine'

const props = defineProps({
  df: { type: Object, required: true },
  // the parent's array - edited in place, as Desk's grid does
  rows: { type: Array, required: true },
  childMeta: { type: Object, required: true },
  parentDoc: { type: Object, required: true },
  // the user may edit this document at all (write / create permission)
  canWrite: Boolean,
  required: Boolean,
  // (cdf, row) => Link picker filters for that row, or null
  rowFilters: { type: Function, default: null },
  // highlight rows with missing required values after a failed save
  showMissing: Boolean,
})
// change(cdf, row, value): the parent sets the value and runs its handlers
const emit = defineEmits(['change', 'add'])

const WIDE = ['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code']
const NUMBER = ['Int', 'Float', 'Currency', 'Percent']
const rowFields = computed(() => (props.childMeta.fields || []).filter((f) => !LAYOUT_TYPES.includes(f.fieldtype) && !['HTML', 'Button'].includes(f.fieldtype)))
const columns = computed(() => {
  const list = rowFields.value.filter((f) => f.in_list_view && !f.hidden)
  return (list.length ? list : rowFields.value.filter((f) => !f.hidden)).slice(0, 8)
})
// Rows are added or removed only on a draft (Desk's grid locks after submit;
// allow_on_submit cells stay editable).
const tableReadOnly = computed(() => !props.canWrite || !!props.df.read_only || props.parentDoc.docstatus !== 0)
const canAdd = computed(() => !tableReadOnly.value)

// Missing required values per row, so the row to fix stands out.
const missingRows = computed(() => {
  const out = new Set()
  if (!props.showMissing) return out
  props.rows.forEach((row, i) => {
    if (rowFields.value.some((f) => isVisible(f, row, props.parentDoc) && isRequired(f, row, props.parentDoc) && isEmpty(row[f.fieldname]))) out.add(i)
  })
  return out
})

const dialogOpen = ref(false)
const editing = ref(0)
const editRow = computed(() => props.rows[editing.value])

function isNumber(c) {
  return NUMBER.includes(c.fieldtype)
}
function cellReadOnly(cdf, row) {
  if (!props.canWrite || props.df.read_only) return true
  return isReadOnly(cdf, { ...row, docstatus: props.parentDoc.docstatus }, { canWrite: true, parent: props.parentDoc })
}
function rowEditable(row) {
  return rowFields.value.some((f) => !f.hidden && !cellReadOnly(f, row))
}
function show(c, v) {
  if (v === null || v === undefined || v === '') return ''
  return formatValue(c, v)
}
function onCell(c, row, raw) {
  const v = raw === '' ? null : c.fieldtype === 'Int' ? parseInt(raw, 10) : parseFloat(raw)
  emit('change', c, row, v)
}
function add() {
  emit('add', props.df.fieldname)
  edit(props.rows.length - 1)
}
function edit(i) {
  editing.value = i
  dialogOpen.value = true
}
</script>
