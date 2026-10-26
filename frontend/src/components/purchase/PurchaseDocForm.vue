<template>
  <!-- The frame every purchase form shares: the doctype's fields in titled
  sections (3 per row), its Items table, Desk's Save / Submit / Cancel /
  Amend / Print / Delete, and the form's own Desk buttons. Exactly one
  button is the main (filled) one. -->
  <AppLayout :title="title" :subtitle="subtitle" :back-to="{ name: form.listName }">
    <!-- Option C: status and document id under the title. -->
    <template #meta>
      <div v-if="pill || (form.doc && !form.isNew)" class="mt-1 flex items-center gap-2 text-sm text-gray-500">
        <StatusBadge v-if="pill" :status="pill" />
        <span v-if="form.doc && !form.isNew" class="font-mono">{{ form.doc.name }}</span>
      </div>
    </template>
    <template #actions>
      <template v-if="form.doc && !form.loadError">
        <template v-for="b in buttons" :key="b.label">
          <a v-if="b.href" :href="b.href" target="_blank" rel="noopener" :class="BTN.plain">{{ b.label }}</a>
          <button v-else type="button" :class="b === main ? BTN.primary : b.danger ? BTN.danger : BTN.plain" :disabled="form.busy" @click="b.run">{{ b.label }}</button>
        </template>
      </template>
    </template>

    <p v-if="form.loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ form.loadError }}</p>

    <form v-else-if="form.meta && form.doc" class="flex w-full flex-col gap-5" novalidate @submit.prevent="form.save">
      <SectionJump :sections="jump" />
      <div v-if="form.notice" class="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm" :class="NOTICE[form.notice.kind]" role="status">
        <div class="min-w-0 flex-1">
          <p v-if="form.notice.title" class="font-semibold">{{ form.notice.title }}</p>
          <p class="whitespace-pre-line">{{ form.notice.text }}</p>
        </div>
        <button type="button" class="shrink-0 text-xs font-semibold underline" @click="form.notice = null">Dismiss</button>
      </div>
      <div v-if="form.saveError" class="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-red-800">Not saved</p>
          <p class="mt-0.5 whitespace-pre-line text-sm text-red-700">{{ form.saveError }}</p>
        </div>
        <button v-if="form.staleDoc" type="button" class="h-8 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="form.load">Reload latest</button>
      </div>
      <div v-else-if="form.missing.length && form.tried" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
        <p><span class="font-semibold">Please fill:</span> {{ form.missing.join(', ') }}</p>
      </div>

      <template v-for="s in layout" :key="s.title">
        <section v-if="s.table || shown(s.fields).length" :id="s.id" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading :icon="s.icon">{{ s.title }}</SubHeading>
          <div v-if="shown(s.fields).length" class="row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6">
            <FormField
              v-for="df in shown(s.fields)"
              :key="df.fieldname"
              :class="WIDE.includes(df.fieldtype) && 'md:col-span-3'"
              :df="plain(df)"
              :doc="form.doc"
              :filters="linkFilters[df.fieldname] || null"
              :model-value="form.doc[df.fieldname]"
              :readonly="form.readOnly(df)"
              :required="isRequired(df, form.doc)"
              :error="fieldError(df)"
              @update:model-value="(v) => form.setValue(df.fieldname, v)"
            />
          </div>
          <template v-if="s.table && form.byName[s.table.options]">
            <slot :name="`before-${s.table.fieldname}`" />
            <ItemsTable
              :df="s.table"
              :rows="form.doc[s.table.fieldname] || []"
              :child-meta="form.byName[s.table.options]"
              :parent-doc="form.doc"
              :readonly="form.readOnly(s.table)"
              :filters="tableFilters"
              :columns="tableColumns[s.table.fieldname] || null"
              @add="form.addBlankRow(s.table.fieldname)"
              @remove="(i) => form.removeRow(s.table.fieldname, i)"
              @change="(row, fn, v) => form.setRowValue(s.table.fieldname, row, fn, v)"
            />
          </template>
        </section>
      </template>

      <RecordActivity v-if="!form.isNew" :doc="form.doc" />
    </form>
    <p v-else class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import SubHeading from '@/components/SubHeading.vue'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import FormField from '@/components/FormField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import ItemsTable from '@/components/purchase/ItemsTable.vue'
import { LAYOUT_TYPES, isVisible, isRequired, isEmpty } from '@/data/formEngine'
import { BTN, plain } from '@/data/purchase/ui'

const props = defineProps({
  // the reactive state from useDocForm()
  form: { type: Object, required: true },
  subtitle: { type: String, default: '' },
  // [{ title, icon, fields: [fieldname] } | { title, icon, table: fieldname }]
  sections: { type: Array, required: true },
  // the form's own Desk buttons: [{ label, run, primary }]
  actions: { type: Array, default: () => [] },
  // { fieldname: filters } for the header's Links (Desk set_query)
  linkFilters: { type: Object, default: () => ({}) },
  // { fieldname: filters } for the Items rows' Links
  tableFilters: { type: Object, default: () => ({}) },
  // { tableField: [fieldname] } - grid columns, when Desk's In List View isn't enough
  tableColumns: { type: Object, default: () => ({}) },
})

const WIDE = ['Small Text', 'Text', 'Long Text', 'Text Editor']
const NOTICE = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
}
const NO_INPUT = [...LAYOUT_TYPES, 'HTML', 'Button']

const f = props.form
// The id sits under the title (option C), so the title is the doctype.
const title = computed(() => (f.isNew ? `New ${f.doctype}` : f.doctype))
// Confirm prompts name the document itself, as before.
const docLabel = computed(() => f.doc?.name || title.value)
// Desk's "Not Saved" while a new or edited draft is waiting for Save.
const pill = computed(() => (f.doc?.docstatus === 0 && f.canWrite && (f.isNew || f.dirty) ? 'Not Saved' : f.statusLabel))

// Sections as the form lists them; any doctype field a form forgot (or one
// added to the doctype later) still shows, at the end of the first section,
// so nothing Desk has can go missing here.
const layout = computed(() => {
  const all = (f.meta?.fields || []).filter((df) => !NO_INPUT.includes(df.fieldtype))
  const byName = Object.fromEntries(all.map((df) => [df.fieldname, df]))
  const listed = new Set(props.sections.flatMap((s) => (s.table ? [s.table] : s.fields)))
  const out = props.sections.map((s, i) => ({ id: `sec-${i}`, title: s.title, icon: s.icon, table: s.table ? byName[s.table] : null, fields: (s.fields || []).map((n) => byName[n]).filter(Boolean) }))
  const extra = all.filter((df) => !listed.has(df.fieldname))
  if (out.length) out[0].fields.push(...extra.filter((df) => df.fieldtype !== 'Table'))
  for (const t of extra.filter((df) => df.fieldtype === 'Table')) out.push({ id: `sec-${t.fieldname}`, title: t.label, icon: 'list', table: t, fields: [] })
  return out
})
const missingSet = computed(() => new Set(f.missing))
// Jump chips for the sections actually on screen.
const jump = computed(() => layout.value.filter((s) => s.table || shown(s.fields).length).map((s) => ({ id: s.id, label: s.title })))

const canSubmit = computed(() => f.meta?.is_submittable && !f.isNew && f.doc?.docstatus === 0 && !f.dirty && f.perms.submit)
const canCancel = computed(() => f.doc?.docstatus === 1 && f.perms.cancel)
const canAmend = computed(() => f.doc?.docstatus === 2 && f.perms.amend)
const canDelete = computed(() => !f.isNew && f.doc?.docstatus === 0 && f.perms.delete)
const canSave = computed(() => f.canWrite && f.doc?.docstatus === 0 && (f.isNew || f.dirty))

const saveBtn = { label: 'Save', run: () => f.save() }
const submitBtn = { label: 'Submit', run: () => confirmThen(`Permanently submit ${docLabel.value}?`, f.submit) }
const amendBtn = { label: 'Amend', run: () => f.amend() }

// The one filled button: the form's own next step when it has one (e.g.
// Approve, Get Items), otherwise Save while there is something to save,
// then Submit, and Amend on a cancelled document - Desk's order.
const main = computed(() => {
  const own = props.actions.find((a) => a.primary)
  if (own) return own
  if (canSave.value) return saveBtn
  if (canSubmit.value) return submitBtn
  if (canAmend.value) return amendBtn
  return null
})

const buttons = computed(() => {
  const list = props.actions.filter((a) => a !== main.value)
  if (canSave.value && main.value !== saveBtn) list.push(saveBtn)
  if (canSubmit.value && !canSave.value && main.value !== submitBtn) list.push(submitBtn)
  if (!f.isNew && f.doc?.name) list.push({ label: 'Print', href: `/printview?doctype=${encodeURIComponent(f.doctype)}&name=${encodeURIComponent(f.doc.name)}` })
  if (canCancel.value) list.push({ label: 'Cancel', run: () => confirmThen(`Permanently cancel ${docLabel.value}?`, f.cancelDoc) })
  if (canAmend.value && main.value !== amendBtn) list.push(amendBtn)
  if (canDelete.value) list.push({ label: 'Delete', danger: true, run: () => confirmThen(`Delete ${docLabel.value}?`, f.deleteDoc) })
  if (main.value) list.push(main.value)
  return list
})

// Desk hides hidden and depends_on fields, and a read-only field with no value.
function shown(list) {
  return (list || []).filter((df) => isVisible(df, f.doc) && !(f.readOnly(df) && isEmpty(f.doc[df.fieldname]) && df.fieldtype !== 'Check'))
}
function fieldError(df) {
  return f.tried && missingSet.value.has(df.label) ? 'Required' : ''
}
function confirmThen(question, fn) {
  if (window.confirm(question)) fn()
}

// Ctrl/Cmd+S: AppLayout presses the Save button (always on screen while
// canSave), so this form has no key handler of its own - two would start
// two saves (two inserts on a new document) from one keypress.
function onBeforeUnload(e) {
  if (f.dirty && f.canWrite && f.doc?.docstatus === 0) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
