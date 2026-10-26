<template>
  <!-- One stock/pharmacy Desk form in Vue: the generic form (DocForm.vue's
  layout, save bar, Submit/Cancel/Delete) plus that doctype's Desk script,
  ported in src/data/stock/rules.js. -->
  <AppLayout :title="title" :back-to="listRoute(doctype)">
    <!-- Option C header: status + record id under the title; one brand main
    button (Save/Update, else Submit, else the Desk script's primary button)
    and every other action as a white button. -->
    <template #meta>
      <div v-if="doc && (statusLabel || (!isNew && title !== name) || showSave)" class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <StatusBadge v-if="statusLabel" :status="statusLabel" />
        <span v-if="showSave" class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Not saved</span>
        <span v-if="!isNew && title !== name" class="font-mono">{{ name }}</span>
      </div>
    </template>
    <template #actions>
      <template v-if="doc">
        <button v-for="a in customActions" :key="a.label" type="button" :class="mainAction === a.label ? BTN_PRIMARY : BTN_SECONDARY" :disabled="busy" @click="runAction(a)">
          {{ a.label }}
        </button>
      </template>
      <button v-if="!isNew && doc" type="button" :class="BTN_SECONDARY" @click="printDoc">Print</button>
      <button v-if="canCancel" type="button" :class="BTN_SECONDARY" :disabled="busy" @click="confirmThen(`Permanently Cancel ${name}?`, cancelDoc)">Cancel document</button>
      <button v-if="canDelete" type="button" :class="[BTN_SECONDARY, 'flex items-center gap-1.5 text-red-700']" :disabled="busy" @click="confirmThen(`Permanently delete ${name}?`, deleteDoc)">
        <LucideIcon name="trash-2" class="h-4 w-4" /> Delete
      </button>
      <button v-if="showSave && meta && doc" type="button" :class="BTN_SECONDARY" @click="discard">{{ isNew ? 'Cancel' : 'Discard' }}</button>
      <button v-if="canAmend" type="button" :class="mainAction === 'Amend' ? BTN_PRIMARY : BTN_SECONDARY" :disabled="busy" @click="amend">Amend</button>
      <button v-if="canSubmit" type="button" :class="BTN_PRIMARY" :disabled="busy" @click="confirmThen(`Permanently Submit ${name}?`, submit)">Submit</button>
      <!-- form= ties this header button to the form below, so Enter in a
      field still submits it; data-save lets AppLayout's Ctrl+S find it
      even when it says Update. -->
      <button v-if="showSave && meta && doc" type="submit" form="stock-form" data-save :class="BTN_PRIMARY" :disabled="busy">{{ busy ? 'Saving…' : doc.docstatus === 1 ? 'Update' : 'Save' }}</button>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-else-if="meta && doc" id="stock-form" class="flex w-full flex-col gap-5" novalidate @submit.prevent="save">
      <PatientBar v-if="patient" :name="patient.name" :age="patient.age" :gender="patient.gender" :uhin="patient.uhin" :visit="patient.visit" />

      <div v-if="visibleTabs.length > 1" role="tablist" class="flex gap-1 overflow-x-auto border-b border-gray-200">
        <button v-for="(t, i) in visibleTabs" :key="i" type="button" role="tab" :aria-selected="tab === i" class="relative h-10 whitespace-nowrap px-3 text-sm font-medium" :class="tab === i ? 'text-brand-800' : 'text-gray-600 hover:text-gray-900'" @click="tab = i">
          {{ t.label || 'Details' }}
          <span v-if="tab === i" class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-700" />
        </button>
      </div>

      <SectionJump :key="tab" :sections="jumpSections" />

      <p v-if="toast" class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{{ toast }}</p>
      <!-- Every problem in one red block at the top. -->
      <div v-if="saveError || (missing.length && tried)" class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
        <div class="min-w-0 flex-1">
          <p v-if="missing.length && tried"><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
          <template v-if="saveError">
            <p class="font-semibold">{{ errorTitle }}</p>
            <p class="mt-0.5 whitespace-pre-line">{{ saveError }}</p>
          </template>
        </div>
        <button v-if="staleDoc" type="button" class="h-8 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="load">Reload latest</button>
      </div>

      <!-- Desk asks a prompt-named doctype's name on a new record. -->
      <section v-if="promptName" class="rounded-xl border border-gray-200 bg-white p-5">
        <FormField :df="NAME_DF" :model-value="doc.__newname" required :error="tried && !doc.__newname ? 'Required' : ''" @update:model-value="(v) => (doc.__newname = v)" />
      </section>

      <section v-for="(s, si) in currentSections" :id="`sec-${si}`" :key="`${tab}-${si}`" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <component :is="s.collapsible ? 'button' : 'header'" v-if="s.label" :type="s.collapsible ? 'button' : undefined" class="block w-full text-left" :aria-expanded="s.collapsible ? !!opened[sectionKey(s)] : undefined" @click="s.collapsible && (opened[sectionKey(s)] = !opened[sectionKey(s)])">
          <SubHeading :icon="sectionIcon(s.label)">
            {{ s.label }}
            <template v-if="s.collapsible" #end><LucideIcon :name="opened[sectionKey(s)] ? 'chevron-up' : 'chevron-down'" class="h-4 w-4 text-gray-500" /></template>
          </SubHeading>
        </component>
        <template v-if="!s.collapsible || opened[sectionKey(s)]">
          <!-- One-column Desk section: short fields three per row, tables and
          long text full width, all in Desk's order. -->
          <div v-if="s.columns.length === 1" class="flex flex-col gap-5">
            <template v-for="(run, ri) in runs(s.columns[0])" :key="ri">
              <div v-if="!run.wide" :class="GRID">
                <FormField v-for="df in run.fields" :key="df.fieldname" :class="df.fieldtype === 'Check' && 'sm:pt-6'" :df="labelled(df)" :doc="doc" :filters="parentFilters(df.fieldname)" :model-value="doc[df.fieldname]" :readonly="readOnly(df)" :required="isRequired(df, doc)" :error="tried && missingSet.has(df.label) ? 'Required' : ''" @update:model-value="(v) => setField(df.fieldname, v)" />
              </div>
              <template v-else><template v-for="df in run.fields" :key="df.fieldname">
                <template v-if="(df.fieldtype === 'Table' || df.fieldtype === 'Table MultiSelect') && byName[df.options]">
                  <component :is="WIDGETS[rules.widgets[df.fieldname]]" v-if="rules.widgets?.[df.fieldname] && canWrite && doc.docstatus === 0" :doc="doc" :ctx="ctx" />
                  <StockChildTable
                    :df="labelled(df)"
                    :rows="ensureRows(df)"
                    :child-meta="byName[df.options]"
                    :parent-doc="doc"
                    :can-write="canWrite"
                    :required="isRequired(df, doc)"
                    :row-filters="rowFilters(df.fieldname)"
                    :show-missing="tried"
                    @add="addRow"
                    @change="(cdf, row, v) => setRowField(row, cdf.fieldname, v)"
                  />
                </template>
                <FormField v-else :df="labelled(df)" :doc="doc" :filters="parentFilters(df.fieldname)" :model-value="doc[df.fieldname]" :readonly="readOnly(df)" :required="isRequired(df, doc)" :error="tried && missingSet.has(df.label) ? 'Required' : ''" @update:model-value="(v) => setField(df.fieldname, v)" />
              </template></template>
            </template>
          </div>
          <div v-else class="grid grid-cols-1 gap-x-8 gap-y-5" :class="COLUMN_CLASSES[Math.min(s.columns.length, 4)]">
            <div v-for="(col, ci) in s.columns" :key="ci" class="flex min-w-0 flex-col gap-5">
              <template v-for="df in col" :key="df.fieldname">
                <template v-if="isVisible(df, doc)">
                  <template v-if="(df.fieldtype === 'Table' || df.fieldtype === 'Table MultiSelect') && byName[df.options]">
                    <component :is="WIDGETS[rules.widgets[df.fieldname]]" v-if="rules.widgets?.[df.fieldname] && canWrite && doc.docstatus === 0" :doc="doc" :ctx="ctx" />
                    <StockChildTable
                      :df="labelled(df)"
                      :rows="ensureRows(df)"
                      :child-meta="byName[df.options]"
                      :parent-doc="doc"
                      :can-write="canWrite"
                      :required="isRequired(df, doc)"
                      :row-filters="rowFilters(df.fieldname)"
                      :show-missing="tried"
                      @add="addRow"
                      @change="(cdf, row, v) => setRowField(row, cdf.fieldname, v)"
                    />
                  </template>
                  <FormField v-else :df="labelled(df)" :doc="doc" :filters="parentFilters(df.fieldname)" :model-value="doc[df.fieldname]" :readonly="readOnly(df)" :required="isRequired(df, doc)" :error="tried && missingSet.has(df.label) ? 'Required' : ''" @update:model-value="(v) => setField(df.fieldname, v)" />
                </template>
              </template>
            </div>
          </div>
        </template>
      </section>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </form>
    <p v-else class="text-gray-600">Loading…</p>

    <!-- frappe.msgprint -->
    <AppDialog v-model="msg.open" :title="msg.title">
      <p class="whitespace-pre-line text-sm text-gray-800">{{ msg.message }}</p>
      <template #footer>
        <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" @click="msg.open = false">OK</button>
      </template>
    </AppDialog>

    <!-- frappe.confirm -->
    <AppDialog :model-value="ask.open" title="Confirm" @update:model-value="answer(false)">
      <p class="text-sm text-gray-800">{{ ask.message }}</p>
      <template #footer>
        <button type="button" class="h-9 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium hover:bg-gray-50" @click="answer(false)">No</button>
        <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" @click="answer(true)">Yes</button>
      </template>
    </AppDialog>

    <!-- frappe.prompt -->
    <AppDialog :model-value="dlg.open" :title="dlg.title" @update:model-value="closePrompt(null)">
      <div class="flex flex-col gap-4">
        <FormField v-for="f in dlg.fields" :key="f.fieldname" :df="f" id-prefix="prompt" :model-value="dlg.values[f.fieldname]" :required="!!f.reqd" :error="dlg.tried && f.reqd && isEmpty(dlg.values[f.fieldname]) ? 'Required' : ''" @update:model-value="(v) => (dlg.values[f.fieldname] = v)" />
      </div>
      <template #footer>
        <button type="button" class="h-9 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" @click="submitPrompt">{{ dlg.primary }}</button>
      </template>
    </AppDialog>
  </AppLayout>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import SubHeading from '@/components/SubHeading.vue'
import { sectionIcon } from '@/data/sectionIcon'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import AppDialog from '@/components/AppDialog.vue'
import FormField from '@/components/FormField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { usePatientBar, fieldRuns, FORM_GRID } from '@/data/formLayoutC'
import StockChildTable from '@/components/stock/StockChildTable.vue'
import IndentItemSearch from '@/components/stock/IndentItemSearch.vue'
import { getMeta, evalDependsOn } from '@/data/meta'
import { errorText } from '@/data/api'
import { session } from '@/data/session'
import { listRoute, viewRoute, createRoute } from '@/data/formMenu'
import { buildLayout, newDoc, newChildRow, isVisible, isRequired, isReadOnly, fetchTargets, missingFields, toPayload, isEmpty, LAYOUT_TYPES } from '@/data/formEngine'
import { RULES } from '@/data/stock/rules'
import { handOff, takeHandOff } from '@/data/stock/handoff'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
const router = useRouter()
const route = useRoute()

const COLUMN_CLASSES = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4' }
const WIDGETS = { IndentItemSearch }
const GRID = FORM_GRID
const BTN_PRIMARY = 'h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60'
const BTN_SECONDARY = 'h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60'
const NAME_DF = { fieldname: '__newname', fieldtype: 'Data', label: 'Name', reqd: 1 }

const meta = ref(null)
const byName = ref({})
const doc = ref(null)
const snapshot = ref('')
const original = ref({})
const perms = ref({})
const loadError = ref('')
const saveError = ref('')
const errorTitle = ref('Not saved')
const staleDoc = ref(false)
const busy = ref(false)
const tried = ref(false)
const tab = ref(0)
const opened = reactive({})
const toast = ref('')

const rules = computed(() => RULES[props.doctype] || {})
const isNew = computed(() => props.name === 'new')
const canWrite = computed(() => (isNew.value ? !!perms.value.create : !!perms.value.write))
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
const promptName = computed(() => isNew.value && String(meta.value?.autoname || '').toLowerCase() === 'prompt')
const layout = computed(() => (meta.value ? buildLayout(meta.value) : []))
const visibleTabs = computed(() => layout.value.filter((t) => !t.df || (!t.df.hidden && evalDependsOn(t.df.depends_on, doc.value || {}))))
const currentSections = computed(() =>
  (visibleTabs.value[tab.value]?.sections || []).filter(
    (s) => (!s.df || (!s.df.hidden && evalDependsOn(s.df.depends_on, doc.value))) && s.columns.some((c) => c.some((df) => isVisible(df, doc.value))),
  ),
)
const missing = computed(() => {
  if (!meta.value || !doc.value) return []
  const out = missingFields(meta.value, doc.value, byName.value)
  if (promptName.value && !doc.value.__newname) out.unshift('Name')
  return out
})
const missingSet = computed(() => new Set(missing.value))
const title = computed(() => {
  if (isNew.value) return `New ${props.doctype}`
  const t = meta.value?.title_field
  return (t && doc.value?.[t]) || props.name
})
// A submitted record shows its own Status (Dispatched, Confirmed, ...); a
// draft or cancelled one says so - an amended copy carries the cancelled
// original's status until it is submitted.
const statusLabel = computed(() => {
  if (!doc.value || isNew.value) return ''
  if (!meta.value?.is_submittable) return doc.value.status || ''
  if (doc.value.docstatus === 1) return doc.value.status || 'Submitted'
  return doc.value.docstatus === 2 ? 'Cancelled' : 'Draft'
})
const canSubmit = computed(() => meta.value?.is_submittable && !isNew.value && doc.value?.docstatus === 0 && !dirty.value && perms.value.submit)
const canCancel = computed(() => meta.value?.is_submittable && doc.value?.docstatus === 1 && !dirty.value && perms.value.cancel)
const canAmend = computed(() => meta.value?.is_submittable && doc.value?.docstatus === 2 && perms.value.create)
const canDelete = computed(() => !isNew.value && doc.value?.docstatus !== 1 && perms.value.delete)
const customActions = computed(() => (doc.value && rules.value.actions ? rules.value.actions(ctx) : []))
// Save shows only while there is something to save (the old sticky bar's rule).
const showSave = computed(() => canWrite.value && (dirty.value || isNew.value))
// Only one brand button: Save, else Submit, else the Desk script's primary
// custom button, else Amend. Save and Submit are never shown together.
const mainAction = computed(() => {
  if (showSave.value) return 'Save'
  if (canSubmit.value) return 'Submit'
  const p = customActions.value.find((a) => a.primary)
  if (p) return p.label
  return canAmend.value ? 'Amend' : ''
})
const jumpSections = computed(() => currentSections.value.map((s, i) => ({ id: `sec-${i}`, label: s.label })).filter((s) => s.label))
const patient = usePatientBar(meta, doc)
const runs = (col) => fieldRuns(col, doc.value)

function readOnly(df) {
  return isReadOnly(df, doc.value, { canWrite: canWrite.value, original: original.value })
}
// Option C shows no helper text under fields, so Desk's description is
// left off here (the doctype keeps it; Desk still shows it).
function labelled(df) {
  const label = rules.value.label ? rules.value.label(df, doc.value) : df.label
  return label === df.label && !df.description ? df : { ...df, label, description: '' }
}
function sectionKey(s) {
  return s.df?.fieldname || s.label
}
function ensureRows(df) {
  if (!Array.isArray(doc.value[df.fieldname])) doc.value[df.fieldname] = []
  return doc.value[df.fieldname]
}
// frm.set_query for a parent field / a child-table field (per row).
function parentFilters(fieldname) {
  const f = rules.value.filters?.[fieldname]
  return typeof f === 'function' ? f(doc.value) : f || null
}
function rowFilters(table) {
  const m = rules.value.childFilters?.[table]
  if (!m) return null
  return (cdf, row) => {
    const f = m[cdf.fieldname]
    return typeof f === 'function' ? f(row, doc.value) : f || null
  }
}

function same(a, b) {
  return a === b || (isEmpty(a) && isEmpty(b))
}

// Link fetch_from: fill (or clear) the fields fetched from this link.
async function applyFetches(ofMeta, target, linkDf, v) {
  const targets = fetchTargets(ofMeta, linkDf.fieldname)
  if (!targets.length) return
  if (!v) {
    for (const t of targets) if (!t.df.fetch_if_empty) target[t.df.fieldname] = null
    return
  }
  try {
    const vals = await call('frappe.client.get_value', { doctype: linkDf.options, filters: v, fieldname: targets.map((t) => t.source) })
    if (target[linkDf.fieldname] !== v) return
    for (const t of targets) {
      if (t.df.fetch_if_empty && target[t.df.fieldname]) continue
      target[t.df.fieldname] = vals?.[t.source] ?? null
    }
  } catch {
    // the server fills fetched values on save
  }
}

// frm.set_value: set, fetch, then run the Desk change handler - only when
// the value really changed, as in Desk.
async function setField(fieldname, v) {
  const df = meta.value.fields.find((f) => f.fieldname === fieldname)
  if (df?.fieldtype === 'Check' && isEmpty(v)) v = 0
  const old = doc.value[fieldname]
  doc.value[fieldname] = v
  if (!df || same(old, v)) return
  if (df.fieldtype === 'Link') await applyFetches(meta.value, doc.value, df, v)
  const h = rules.value.change?.[fieldname]
  if (h) await guarded(() => h(ctx, v))
}

// frappe.model.set_value on a child row.
async function setRowField(row, fieldname, v) {
  const tableDf = meta.value.fields.find((f) => f.fieldname === row.parentfield)
  const cm = tableDf && byName.value[tableDf.options]
  const cdf = cm?.fields.find((f) => f.fieldname === fieldname)
  if (cdf?.fieldtype === 'Check' && isEmpty(v)) v = 0
  const old = row[fieldname]
  row[fieldname] = v
  if (!cdf || same(old, v)) return
  if (cdf.fieldtype === 'Link') await applyFetches(cm, row, cdf, v)
  const h = rules.value.rowChange?.[row.parentfield]?.[fieldname]
  if (h) await guarded(() => h(ctx, row, v))
}

// frm.add_child: a new row (with its defaults), returned reactive.
function addRow(table, values = {}) {
  const df = meta.value.fields.find((f) => f.fieldname === table)
  const list = ensureRows(df)
  const row = newChildRow(byName.value[df.options], doc.value, table, session.user)
  Object.assign(row, values)
  list.push(row)
  return list[list.length - 1]
}
function clearTable(table) {
  if (Array.isArray(doc.value[table])) doc.value[table].splice(0)
}

// --- Desk dialogs: msgprint, show_alert, confirm, prompt ---
const msg = reactive({ open: false, title: '', message: '' })
function msgprint(message, title = 'Message') {
  Object.assign(msg, { open: true, title, message })
}
let toastTimer = null
function alert(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 8000)
}
const ask = reactive({ open: false, message: '', resolve: null })
function confirm(message) {
  return new Promise((resolve) => Object.assign(ask, { open: true, message, resolve }))
}
function answer(yes) {
  ask.open = false
  ask.resolve?.(yes)
  ask.resolve = null
}
const dlg = reactive({ open: false, title: '', primary: '', fields: [], values: {}, tried: false, resolve: null })
function prompt({ title: t, fields, primary = 'Submit' }) {
  const values = Object.fromEntries(fields.map((f) => [f.fieldname, f.default ?? null]))
  return new Promise((resolve) => Object.assign(dlg, { open: true, title: t, primary, fields, values, tried: false, resolve }))
}
function submitPrompt() {
  dlg.tried = true
  if (dlg.fields.some((f) => f.reqd && isEmpty(dlg.values[f.fieldname]))) return
  closePrompt({ ...dlg.values })
}
function closePrompt(values) {
  dlg.open = false
  dlg.resolve?.(values)
  dlg.resolve = null
}

// A handler's server error shows the way Desk's frappe.call shows it.
async function guarded(fn) {
  try {
    await fn()
  } catch (err) {
    msgprint(errorText(err) || 'Something went wrong. Please try again.')
  }
}
async function runAction(a) {
  busy.value = true
  try {
    await guarded(() => a.run())
  } finally {
    busy.value = false
  }
}

// frm.call(method): the form as it stands goes to the server.
function runDocMethod(method, args) {
  return call('run_doc_method', { method, docs: JSON.stringify(toPayload(doc.value)), args })
}
// frappe.new_doc(doctype, values) - child rows included.
function openNew(doctype, values, message = '') {
  handOff(doctype, values, message)
  router.push(createRoute(doctype))
}

// What the Desk script handlers get in place of frm.
const ctx = {
  get doc() {
    return doc.value
  },
  get isNew() {
    return isNew.value
  },
  get perms() {
    return perms.value
  },
  set: setField,
  setRow: setRowField,
  addRow,
  clearTable,
  msgprint,
  alert,
  confirm,
  prompt,
  runDocMethod,
  reload: () => load(),
  openNew,
}

async function load() {
  loadError.value = ''
  saveError.value = ''
  staleDoc.value = false
  tried.value = false
  tab.value = 0
  try {
    const m = await getMeta(props.doctype)
    meta.value = m.meta
    byName.value = m.byName
    if (isNew.value) {
      doc.value = newDoc(m.meta, session.user)
      perms.value = await call('metta.api.get_doc_permissions', { doctype: props.doctype })
      // Values handed over (Create Return Transfer, Amend) go in as they
      // are, rows included, without firing handlers - like new_doc + add_child.
      const handed = takeHandOff(props.doctype)
      if (handed) {
        for (const [k, v] of Object.entries(handed.values)) {
          if (Array.isArray(v)) {
            clearTable(k)
            v.forEach((r) => addRow(k, r))
          } else doc.value[k] = v
        }
        if (handed.message) alert(handed.message)
      }
      // Starting values from the address, like frappe.new_doc(doctype, values).
      for (const [k, v] of Object.entries(route.query)) {
        if (typeof v === 'string' && m.meta.fields.some((f) => f.fieldname === k)) await setField(k, v)
      }
      if (rules.value.onNew) await guarded(() => rules.value.onNew(ctx))
    } else {
      doc.value = await call('frappe.client.get', { doctype: props.doctype, name: props.name })
      perms.value = await call('metta.api.get_doc_permissions', { doctype: props.doctype, name: props.name })
    }
    original.value = JSON.parse(JSON.stringify(doc.value))
    snapshot.value = isNew.value ? '' : JSON.stringify(toPayload(doc.value))
  } catch (err) {
    loadError.value = errorText(err) || `${props.doctype} ${props.name} could not be opened.`
  }
}

function showError(err, heading = 'Not saved') {
  staleDoc.value = err?.exc_type === 'TimestampMismatchError'
  errorTitle.value = heading
  saveError.value = errorText(err) || 'Something went wrong. Please try again.'
}

async function save() {
  tried.value = true
  saveError.value = ''
  if (missing.value.length) {
    document.querySelector('[role=alert]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  busy.value = true
  try {
    const payload = toPayload(doc.value)
    if (promptName.value) payload.name = payload.__newname
    const saved = isNew.value ? await call('frappe.client.insert', { doc: payload }) : await call('frappe.client.save', { doc: payload })
    doc.value = saved
    original.value = JSON.parse(JSON.stringify(saved))
    snapshot.value = JSON.stringify(toPayload(saved))
    tried.value = false
    if (isNew.value) router.replace(viewRoute(props.doctype, saved.name))
  } catch (err) {
    showError(err)
  } finally {
    busy.value = false
  }
}

async function submit() {
  busy.value = true
  saveError.value = ''
  try {
    await call('frappe.client.submit', { doc: toPayload(doc.value) })
    await load()
  } catch (err) {
    showError(err, 'Not submitted')
  } finally {
    busy.value = false
  }
}
async function cancelDoc() {
  busy.value = true
  saveError.value = ''
  try {
    await call('frappe.client.cancel', { doctype: props.doctype, name: props.name })
    await load()
  } catch (err) {
    showError(err, 'Not cancelled')
  } finally {
    busy.value = false
  }
}
async function deleteDoc() {
  busy.value = true
  try {
    await call('frappe.client.delete', { doctype: props.doctype, name: props.name })
    snapshot.value = JSON.stringify(toPayload(doc.value))
    router.replace(listRoute(props.doctype))
  } catch (err) {
    showError(err, 'Not deleted')
  } finally {
    busy.value = false
  }
}

// Desk's Amend (frappe.model.copy_doc with from_amend): every field is
// copied except name / amended_from / amendment_date / cancel_reason, and
// the copy links back through amended_from; the server names it <name>-1.
function amend() {
  const SKIP = ['name', 'amended_from', 'amendment_date', 'cancel_reason']
  const copyOf = (src, m) => {
    const out = {}
    for (const df of m.fields || []) {
      if (LAYOUT_TYPES.includes(df.fieldtype) || df.fieldtype === 'Password' || SKIP.includes(df.fieldname) || !(df.fieldname in src)) continue
      const v = src[df.fieldname]
      out[df.fieldname] = Array.isArray(v) && byName.value[df.options] ? v.map((r) => copyOf(r, byName.value[df.options])) : v
    }
    return out
  }
  openNew(props.doctype, { ...copyOf(doc.value, meta.value), amended_from: doc.value.name })
}

function printDoc() {
  window.open(`/printview?doctype=${encodeURIComponent(props.doctype)}&name=${encodeURIComponent(props.name)}`, '_blank')
}
async function confirmThen(message, fn) {
  if (await confirm(message)) fn()
}
function discard() {
  if (isNew.value) router.push(listRoute(props.doctype))
  else load()
}

// Ctrl/Cmd+S is AppLayout's: it clicks the header Save/Update (data-save),
// shown under the same rule this page used. Leaving with unsaved changes asks first.
function onBeforeUnload(e) {
  if (dirty.value && canWrite.value && !isNew.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
const leaveGuard = () => !(dirty.value && canWrite.value && !isNew.value) || window.confirm('You have unsaved changes. Leave without saving?')
onBeforeRouteLeave(leaveGuard)
onBeforeRouteUpdate(leaveGuard)
// The same screen opens another record (after insert, Create Return
// Transfer, Amend) - load it.
watch(
  () => props.name,
  () => load(),
)
onMounted(() => {
  load()
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  clearTimeout(toastTimer)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
