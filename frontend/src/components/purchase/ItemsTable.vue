<template>
  <!-- A purchase document's Items table: Desk's grid columns ("In List
  View"), numbers typed straight into the row, every field of a row in the
  Edit dialog. Every change goes back to the form so its Desk row rules run. -->
  <div class="flex flex-col gap-2">
    <div class="overflow-x-auto rounded-lg border border-gray-200">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th class="w-10 px-3 py-2">#</th>
            <th v-for="c in shownColumns" :key="c.fieldname" class="whitespace-nowrap px-3 py-2 font-medium" :class="isNumber(c) && 'text-right'">
              {{ c.label }}<span v-if="c.reqd && !readonly" class="text-red-600"> *</span>
            </th>
            <th class="w-24 px-3 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td :colspan="shownColumns.length + 2" class="px-3 py-5 text-center text-gray-500">No items yet.</td>
          </tr>
          <tr v-for="(row, i) in rows" :key="row.name || i" class="border-b border-gray-100 last:border-0">
            <td class="px-3 py-2 text-gray-500">{{ i + 1 }}</td>
            <td v-for="c in shownColumns" :key="c.fieldname" class="whitespace-nowrap px-3 py-1.5" :class="isNumber(c) && 'text-right'">
              <template v-if="isVisible(c, row, parentDoc)">
                <input
                  v-if="inline(c, row)"
                  :type="isNumber(c) ? 'number' : c.fieldtype === 'Date' ? 'date' : 'text'"
                  :step="c.fieldtype === 'Int' ? '1' : 'any'"
                  :value="row[c.fieldname] ?? ''"
                  :aria-label="`${c.label}, row ${i + 1}`"
                  class="ctl"
                  :class="[isNumber(c) ? 'w-24 text-right' : 'w-36', missingCell(c, row) && 'border-red-400']"
                  @change="emitChange(row, c, $event.target.value)"
                />
                <select v-else-if="inlineSelect(c, row)" :value="row[c.fieldname] ?? ''" :aria-label="`${c.label}, row ${i + 1}`" class="ctl w-auto" :class="missingCell(c, row) && 'border-red-400'" @change="emitChange(row, c, $event.target.value)">
                  <option v-for="o in String(c.options || '').split('\n')" :key="o" :value="o">{{ o || '—' }}</option>
                </select>
                <span v-else class="block max-w-[220px] truncate text-gray-800" :title="show(c, row[c.fieldname])">{{ show(c, row[c.fieldname]) }}</span>
              </template>
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-right">
              <button type="button" class="rounded px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" @click="edit(i)">{{ readonly ? 'View' : 'Edit' }}</button>
              <button v-if="!readonly" type="button" class="rounded p-1 text-red-600 hover:bg-red-50" :aria-label="`Delete row ${i + 1}`" @click="$emit('remove', i)"><LucideIcon name="trash-2" class="h-3.5 w-3.5" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="!readonly" type="button" class="self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50" @click="add">+ Add row</button>

    <AppDialog v-model="dialogOpen" :title="`${df.label} — row ${editing + 1}`">
      <div v-if="editRow" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <template v-for="cdf in dialogFields" :key="cdf.fieldname">
          <SubHeading v-if="cdf.fieldtype === 'Section Break'" class="mt-2 sm:col-span-2">{{ cdf.label }}</SubHeading>
          <FormField
            v-else-if="isVisible(cdf, editRow, parentDoc)"
            :class="WIDE.includes(cdf.fieldtype) && 'sm:col-span-2'"
            :df="plain(cdf)"
            :doc="editRow"
            :id-prefix="`${df.fieldname}-${editing}`"
            :model-value="editRow[cdf.fieldname]"
            :filters="filters[cdf.fieldname] || null"
            :readonly="cellReadOnly(cdf, editRow)"
            :required="isRequired(cdf, editRow, parentDoc)"
            @update:model-value="(v) => $emit('change', editRow, cdf.fieldname, v)"
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
import { computed, ref } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import AppDialog from '@/components/AppDialog.vue'
import FormField from '@/components/FormField.vue'
import SubHeading from '@/components/SubHeading.vue'
import { formatValue } from '@/data/meta'
import { isVisible, isRequired, isReadOnly, isEmpty } from '@/data/formEngine'
import { plain } from '@/data/purchase/ui'

const props = defineProps({
  df: { type: Object, required: true },
  rows: { type: Array, required: true },
  childMeta: { type: Object, required: true },
  parentDoc: { type: Object, required: true },
  readonly: Boolean,
  // { fieldname: filters } - Desk's set_query on the row's Links
  filters: { type: Object, default: () => ({}) },
  // fieldnames to show as columns; default is Desk's "In List View"
  columns: { type: Array, default: null },
})
// change(row, fieldname, value) / add / remove(index)
const emit = defineEmits(['change', 'add', 'remove'])

const WIDE = ['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code']
const NUMBER = ['Int', 'Float', 'Currency', 'Percent']
const SKIP = ['Column Break', 'Tab Break', 'HTML', 'Button']

const dialogFields = computed(() => (props.childMeta.fields || []).filter((f) => !SKIP.includes(f.fieldtype) && !f.hidden))
const shownColumns = computed(() => {
  const fields = (props.childMeta.fields || []).filter((f) => !f.hidden && !SKIP.includes(f.fieldtype) && f.fieldtype !== 'Section Break')
  if (props.columns) return props.columns.map((n) => fields.find((f) => f.fieldname === n)).filter(Boolean)
  return fields.filter((f) => f.in_list_view)
})

const dialogOpen = ref(false)
const editing = ref(0)
const editRow = computed(() => props.rows[editing.value])

function isNumber(c) {
  return NUMBER.includes(c.fieldtype)
}
function cellReadOnly(c, row) {
  return props.readonly || isReadOnly(c, row, { canWrite: true, parent: props.parentDoc })
}
// Plain values are typed in the row; Links are picked in the Edit dialog.
function inline(c, row) {
  return !cellReadOnly(c, row) && (isNumber(c) || ['Data', 'Date'].includes(c.fieldtype))
}
function inlineSelect(c, row) {
  return !cellReadOnly(c, row) && c.fieldtype === 'Select'
}
function missingCell(c, row) {
  return isRequired(c, row, props.parentDoc) && isEmpty(row[c.fieldname])
}
function show(c, v) {
  if (v === null || v === undefined || v === '') return ''
  return formatValue(c, v)
}
function emitChange(row, c, raw) {
  let v = raw
  if (isNumber(c)) v = raw === '' ? null : c.fieldtype === 'Int' ? parseInt(raw, 10) : parseFloat(raw)
  emit('change', row, c.fieldname, v)
}
// A new row opens straight in the Edit dialog, where its Item is picked.
function add() {
  emit('add')
  edit(props.rows.length - 1)
}
function edit(i) {
  editing.value = i
  dialogOpen.value = true
}
</script>
