<template>
  <AppLayout :title="title" :back-to="{ name: 'DocList', params: { doctype } }">
    <!-- Option C header: status + record id under the title, one brand main
    button (Save, or Submit once saved) with the other actions beside it. -->
    <template #meta>
      <div v-if="doc && (statusLabel || (!isNew && title !== name) || showSave)" class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <StatusBadge v-if="statusLabel" :status="statusLabel" />
        <span v-if="showSave" class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Not saved</span>
        <span v-if="!isNew && title !== name" class="font-mono">{{ name }}</span>
      </div>
    </template>
    <template #actions>
      <button v-if="showSave" type="button" :class="BTN_SECONDARY" @click="discard">{{ isNew ? 'Cancel' : 'Discard' }}</button>
      <button v-if="canCancel" type="button" :class="BTN_SECONDARY" :disabled="busy" @click="confirmThen('Cancel', cancelDoc)">Cancel document</button>
      <button v-if="canDelete" type="button" :class="[BTN_SECONDARY, 'flex items-center gap-1.5 text-red-700']" :disabled="busy" @click="confirmThen('Delete', deleteDoc)">
        <LucideIcon name="trash-2" class="h-4 w-4" /> Delete
      </button>
      <button v-if="canSubmit" type="button" :class="BTN_PRIMARY" :disabled="busy" @click="confirmThen('Submit', submit)">Submit</button>
      <!-- form= ties this header button to the form below, so Enter in a
      field still submits it as the old in-form Save did. -->
      <button v-if="showSave && meta && doc" type="submit" form="doc-form" data-save :class="BTN_PRIMARY" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-else-if="meta && doc" id="doc-form" class="flex w-full flex-col gap-5" novalidate @submit.prevent="save">
      <PatientBar v-if="patient" :name="patient.name" :age="patient.age" :gender="patient.gender" :uhin="patient.uhin" :visit="patient.visit" />

      <!-- Desk's tabs -->
      <div v-if="visibleTabs.length > 1" role="tablist" class="flex gap-1 overflow-x-auto border-b border-gray-200">
        <button v-for="(t, i) in visibleTabs" :key="i" type="button" role="tab" :aria-selected="tab === i" class="relative h-10 whitespace-nowrap px-3 text-sm font-medium" :class="tab === i ? 'text-brand-800' : 'text-gray-600 hover:text-gray-900'" @click="tab = i">
          {{ t.label || 'Details' }}
          <span v-if="tab === i" class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-700" />
        </button>
      </div>

      <SectionJump :key="tab" :sections="jumpSections" />

      <!-- Every problem in one red block at the top. -->
      <div v-if="saveError || (missing.length && tried)" class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
        <div class="min-w-0 flex-1">
          <p v-if="missing.length && tried"><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
          <template v-if="saveError">
            <p class="font-semibold">Not saved</p>
            <p class="mt-0.5 whitespace-pre-line">{{ saveError }}</p>
          </template>
        </div>
        <button v-if="staleDoc" type="button" class="h-8 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="load">Reload latest</button>
      </div>

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
                <FormField v-for="df in run.fields" :key="df.fieldname" :class="df.fieldtype === 'Check' && 'sm:pt-6'" :df="plain(df)" :doc="doc" :filters="linkFilters(doctype, df.fieldname)" :model-value="doc[df.fieldname]" :readonly="readOnly(df)" :required="isRequired(df, doc)" :error="tried && missingSet.has(df.label) ? 'Required' : ''" @update:model-value="(v) => setValue(df, v)" />
              </div>
              <template v-else><template v-for="df in run.fields" :key="df.fieldname">
                <ChildTableEditor
                  v-if="(df.fieldtype === 'Table' || df.fieldtype === 'Table MultiSelect') && byName[df.options]"
                  :df="df"
                  :rows="ensureRows(df)"
                  :child-meta="byName[df.options]"
                  :parent-doc="doc"
                  :readonly="readOnly(df)"
                  :required="isRequired(df, doc)"
                />
                <FormField v-else :df="plain(df)" :doc="doc" :filters="linkFilters(doctype, df.fieldname)" :model-value="doc[df.fieldname]" :readonly="readOnly(df)" :required="isRequired(df, doc)" :error="tried && missingSet.has(df.label) ? 'Required' : ''" @update:model-value="(v) => setValue(df, v)" />
              </template></template>
            </template>
          </div>
          <div v-else class="grid grid-cols-1 gap-x-8 gap-y-5" :class="COLUMN_CLASSES[Math.min(s.columns.length, 4)]">
            <div v-for="(col, ci) in s.columns" :key="ci" class="flex min-w-0 flex-col gap-5">
              <template v-for="df in col" :key="df.fieldname">
                <template v-if="isVisible(df, doc)">
                  <ChildTableEditor
                    v-if="(df.fieldtype === 'Table' || df.fieldtype === 'Table MultiSelect') && byName[df.options]"
                    :df="df"
                    :rows="ensureRows(df)"
                    :child-meta="byName[df.options]"
                    :parent-doc="doc"
                    :readonly="readOnly(df)"
                    :required="isRequired(df, doc)"
                  />
                  <FormField v-else :df="plain(df)" :doc="doc" :filters="linkFilters(doctype, df.fieldname)" :model-value="doc[df.fieldname]" :readonly="readOnly(df)" :required="isRequired(df, doc)" :error="tried && missingSet.has(df.label) ? 'Required' : ''" @update:model-value="(v) => setValue(df, v)" />
                </template>
              </template>
            </div>
          </div>
        </template>
      </section>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </form>
    <p v-else class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import SubHeading from '@/components/SubHeading.vue'
import { sectionIcon } from '@/data/sectionIcon'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import FormField from '@/components/FormField.vue'
import ChildTableEditor from '@/components/ChildTableEditor.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PatientBar from '@/components/PatientBar.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { usePatientBar, fieldRuns, FORM_GRID } from '@/data/formLayoutC'
import { getMeta, evalDependsOn } from '@/data/meta'
import { errorText } from '@/data/api'
import { session } from '@/data/session'
import { buildLayout, newDoc, isVisible, isRequired, isReadOnly, fetchTargets, missingFields, toPayload, linkFilters, cleanValue } from '@/data/formEngine'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
const router = useRouter()
const route = useRoute()

const COLUMN_CLASSES = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4' }
const GRID = FORM_GRID
const BTN_PRIMARY = 'h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60'
const BTN_SECONDARY = 'h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60'

const meta = ref(null)
const byName = ref({})
const doc = ref(null)
const snapshot = ref('')
const original = ref({})
const perms = ref({})
const loadError = ref('')
const saveError = ref('')
const staleDoc = ref(false)
const busy = ref(false)
const tried = ref(false)
const tab = ref(0)
const opened = reactive({})

const isNew = computed(() => props.name === 'new')
const canWrite = computed(() => (isNew.value ? perms.value.create : perms.value.write))
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
const layout = computed(() => (meta.value ? buildLayout(meta.value) : []))
// A tab or section whose own depends_on is false is hidden, as in Desk.
const visibleTabs = computed(() => layout.value.filter((t) => !t.df || (!t.df.hidden && evalDependsOn(t.df.depends_on, doc.value || {}))))
const currentSections = computed(() =>
  (visibleTabs.value[tab.value]?.sections || []).filter(
    (s) => (!s.df || (!s.df.hidden && evalDependsOn(s.df.depends_on, doc.value))) && s.columns.some((c) => c.some((df) => isVisible(df, doc.value))),
  ),
)
// Save shows only while there is something to save (was the sticky bar's rule).
const showSave = computed(() => !!canWrite.value && (dirty.value || isNew.value))
const jumpSections = computed(() => currentSections.value.map((s, i) => ({ id: `sec-${i}`, label: s.label })).filter((s) => s.label))
const patient = usePatientBar(meta, doc)
const runs = (col) => fieldRuns(col, doc.value)
const missing = computed(() => (meta.value && doc.value ? missingFields(meta.value, doc.value, byName.value) : []))
const missingSet = computed(() => new Set(missing.value))
const title = computed(() => {
  if (isNew.value) return `New ${props.doctype}`
  const t = meta.value?.title_field
  return (t && doc.value?.[t]) || props.name
})
const statusLabel = computed(() => {
  if (!doc.value || isNew.value) return ''
  if (meta.value?.is_submittable) return ['Draft', 'Submitted', 'Cancelled'][doc.value.docstatus] || ''
  return doc.value.status || ''
})
const canSubmit = computed(() => meta.value?.is_submittable && !isNew.value && doc.value?.docstatus === 0 && !dirty.value && perms.value.submit)
const canCancel = computed(() => meta.value?.is_submittable && doc.value?.docstatus === 1 && perms.value.cancel)
const canDelete = computed(() => !isNew.value && !meta.value?.issingle && doc.value?.docstatus !== 1 && perms.value.delete)

function readOnly(df) {
  return isReadOnly(df, doc.value, { canWrite: canWrite.value, original: original.value })
}
// Option C shows no helper text under fields, so Desk's description is
// left off here (the doctype keeps it; Desk still shows it).
const plain = (df) => (df.description ? { ...df, description: '' } : df)
function sectionKey(s) {
  return s.df?.fieldname || s.label
}
function ensureRows(df) {
  if (!Array.isArray(doc.value[df.fieldname])) doc.value[df.fieldname] = []
  return doc.value[df.fieldname]
}

async function load() {
  loadError.value = ''
  saveError.value = ''
  staleDoc.value = false
  tried.value = false
  try {
    const m = await getMeta(props.doctype)
    meta.value = m.meta
    byName.value = m.byName
    if (isNew.value) {
      doc.value = newDoc(m.meta, session.user)
      // Starting values from the address (?patient_visit=IP-…), like
      // Desk's frappe.new_doc(doctype, values); Links fill their fetches.
      for (const [k, v] of Object.entries(route.query)) {
        const df = m.meta.fields.find((f) => f.fieldname === k)
        if (df && typeof v === 'string') await setValue(df, v)
      }
      perms.value = await call('metta.api.get_doc_permissions', { doctype: props.doctype })
    } else {
      doc.value = await call('frappe.client.get', { doctype: props.doctype, name: props.name })
      perms.value = await call('metta.api.get_doc_permissions', { doctype: props.doctype, name: props.name })
    }
    original.value = JSON.parse(JSON.stringify(doc.value))
    snapshot.value = JSON.stringify(toPayload(doc.value))
  } catch (err) {
    loadError.value = errorText(err) || `${props.doctype} ${props.name} could not be opened.`
  }
}

// Setting a Link also fills its fetch_from fields; clearing it clears them.
async function setValue(df, v) {
  v = cleanValue(props.doctype, df.fieldname, v)
  doc.value[df.fieldname] = v
  if (df.fieldtype !== 'Link') return
  const targets = fetchTargets(meta.value, df.fieldname)
  if (!targets.length) return
  if (!v) {
    for (const t of targets) if (!t.df.fetch_if_empty) doc.value[t.df.fieldname] = null
    return
  }
  try {
    const vals = await call('frappe.client.get_value', { doctype: df.options, filters: v, fieldname: targets.map((t) => t.source) })
    if (doc.value[df.fieldname] !== v) return
    for (const t of targets) {
      if (t.df.fetch_if_empty && doc.value[t.df.fieldname]) continue
      doc.value[t.df.fieldname] = vals?.[t.source] ?? null
    }
  } catch {
    // the server fills fetched values on save
  }
}

function showError(err) {
  staleDoc.value = err?.exc_type === 'TimestampMismatchError'
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
    const saved = isNew.value ? await call('frappe.client.insert', { doc: payload }) : await call('frappe.client.save', { doc: payload })
    snapshot.value = JSON.stringify(toPayload(saved))
    if (isNew.value) {
      router.replace({ name: 'DocForm', params: { doctype: props.doctype, name: saved.name } })
      return
    }
    doc.value = saved
    original.value = JSON.parse(JSON.stringify(saved))
    snapshot.value = JSON.stringify(toPayload(saved))
    tried.value = false
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
    doc.value = await call('frappe.client.submit', { doc: toPayload(doc.value) })
    snapshot.value = JSON.stringify(toPayload(doc.value))
    perms.value = await call('metta.api.get_doc_permissions', { doctype: props.doctype, name: props.name })
  } catch (err) {
    showError(err)
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
    showError(err)
  } finally {
    busy.value = false
  }
}
async function deleteDoc() {
  busy.value = true
  try {
    await call('frappe.client.delete', { doctype: props.doctype, name: props.name })
    snapshot.value = JSON.stringify(toPayload(doc.value))
    router.replace({ name: 'DocList', params: { doctype: props.doctype } })
  } catch (err) {
    showError(err)
  } finally {
    busy.value = false
  }
}
function confirmThen(action, fn) {
  if (window.confirm(`${action} ${title.value}?`)) fn()
}
function discard() {
  if (isNew.value) router.push({ name: 'DocList', params: { doctype: props.doctype } })
  else load()
}

// Ctrl/Cmd+S is AppLayout's: it clicks the header Save (data-save), which
// shows under the same rule this page used. Leaving with unsaved changes asks first.
function onBeforeUnload(e) {
  if (dirty.value && canWrite.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onBeforeRouteLeave(() => !(dirty.value && canWrite.value && !isNew.value) || window.confirm('You have unsaved changes. Leave without saving?'))
onMounted(() => {
  load()
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
