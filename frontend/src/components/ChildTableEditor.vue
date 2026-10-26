<template>
  <!-- A Desk child table: the grid columns Desk shows ("In List View"),
  every field of a row in the Edit dialog. -->
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-medium text-gray-800">{{ df.label }}<span v-if="required" class="text-red-600"> *</span></span>
      <span class="text-xs text-gray-500">{{ rows.length }} {{ rows.length === 1 ? 'row' : 'rows' }}</span>
    </div>
    <div class="overflow-x-auto rounded-lg border border-gray-200">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th class="w-10 px-3 py-2">#</th>
            <th v-for="c in columns" :key="c.fieldname" class="whitespace-nowrap px-3 py-2 font-medium">{{ c.label }}</th>
            <th class="w-28 px-3 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 2" class="px-3 py-5 text-center text-gray-500">No rows yet.</td>
          </tr>
          <tr v-for="(row, i) in rows" :key="row.name || i" class="border-b border-gray-100 last:border-0">
            <td class="px-3 py-2 text-gray-500">{{ i + 1 }}</td>
            <td v-for="c in columns" :key="c.fieldname" class="max-w-[200px] truncate px-3 py-2 text-gray-800">{{ show(c, row[c.fieldname]) }}</td>
            <td class="whitespace-nowrap px-3 py-2 text-right">
              <button type="button" class="rounded px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" @click="edit(i)">{{ readonly ? 'View' : 'Edit' }}</button>
              <template v-if="!readonly">
                <button type="button" class="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" :disabled="i === 0" :aria-label="`Move row ${i + 1} up`" @click="move(i, -1)"><LucideIcon name="chevron-up" class="h-3.5 w-3.5" /></button>
                <button type="button" class="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" :disabled="i === rows.length - 1" :aria-label="`Move row ${i + 1} down`" @click="move(i, 1)"><LucideIcon name="chevron-down" class="h-3.5 w-3.5" /></button>
                <button type="button" class="rounded p-1 text-red-600 hover:bg-red-50" :aria-label="`Delete row ${i + 1}`" @click="rows.splice(i, 1)"><LucideIcon name="trash-2" class="h-3.5 w-3.5" /></button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="!readonly" type="button" class="self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50" @click="add">+ Add row</button>

    <AppDialog v-model="dialogOpen" :title="`${df.label} — row ${editing + 1}`">
      <div v-if="editRow" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <template v-for="cdf in rowFields" :key="cdf.fieldname">
          <FormField
            v-if="isVisible(cdf, editRow, parentDoc)"
            :class="WIDE.includes(cdf.fieldtype) && 'sm:col-span-2'"
            :df="cdf"
            :doc="editRow"
            :id-prefix="`${df.fieldname}-${editing}`"
            :model-value="editRow[cdf.fieldname]"
            :readonly="readonly || isReadOnly(cdf, editRow, { canWrite: true, parent: parentDoc })"
            :required="isRequired(cdf, editRow, parentDoc)"
            @update:model-value="(v) => setRowValue(cdf, v)"
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
import { call } from 'frappe-ui'
import AppDialog from '@/components/AppDialog.vue'
import FormField from '@/components/FormField.vue'
import { formatValue } from '@/data/meta'
import { LAYOUT_TYPES, isVisible, isRequired, isReadOnly, newChildRow, fetchTargets } from '@/data/formEngine'
import { session } from '@/data/session'

const props = defineProps({
  df: { type: Object, required: true },
  // the parent's array - edited in place, as Desk's grid does
  rows: { type: Array, required: true },
  childMeta: { type: Object, required: true },
  parentDoc: { type: Object, required: true },
  readonly: Boolean,
  required: Boolean,
})

const WIDE = ['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code']
const rowFields = computed(() => (props.childMeta.fields || []).filter((f) => !LAYOUT_TYPES.includes(f.fieldtype) && !['HTML', 'Button'].includes(f.fieldtype)))
const columns = computed(() => {
  const list = rowFields.value.filter((f) => f.in_list_view && !f.hidden)
  return (list.length ? list : rowFields.value.filter((f) => !f.hidden)).slice(0, 5)
})

const dialogOpen = ref(false)
const editing = ref(0)
const editRow = computed(() => props.rows[editing.value])

function show(c, v) {
  if (v === null || v === undefined || v === '') return ''
  return formatValue(c, v)
}
function add() {
  props.rows.push(newChildRow(props.childMeta, props.parentDoc, props.df.fieldname, session.user))
  edit(props.rows.length - 1)
}
function edit(i) {
  editing.value = i
  dialogOpen.value = true
}
function move(i, step) {
  const [r] = props.rows.splice(i, 1)
  props.rows.splice(i + step, 0, r)
}

// A Link in a row fills that row's fetch_from fields, as in Desk.
async function setRowValue(cdf, v) {
  const row = editRow.value
  row[cdf.fieldname] = v
  if (cdf.fieldtype !== 'Link') return
  const targets = fetchTargets(props.childMeta, cdf.fieldname)
  if (!targets.length) return
  if (!v) {
    for (const t of targets) if (!t.df.fetch_if_empty) row[t.df.fieldname] = null
    return
  }
  try {
    const vals = await call('frappe.client.get_value', { doctype: cdf.options, filters: v, fieldname: targets.map((t) => t.source) })
    for (const t of targets) {
      if (t.df.fetch_if_empty && row[t.df.fieldname]) continue
      row[t.df.fieldname] = vals?.[t.source] ?? null
    }
  } catch {
    // the server fills fetched values on save
  }
}
</script>
