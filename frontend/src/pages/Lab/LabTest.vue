<template>
  <AppLayout :title="title" :back-to="{ name: 'LabWorklist' }">
    <!-- Option C: status + id under the title, the one main button at the top. -->
    <template v-if="meta && doc" #meta>
      <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <StatusBadge v-if="!isNew && original.status" :status="original.status" />
        <span v-else class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Not saved</span>
        <span v-if="!isNew" class="font-mono">{{ name }}</span>
        <span v-if="canWrite && !isNew && (dirty || savedNote)">· {{ dirty ? 'Unsaved changes' : savedNote }}</span>
      </div>
    </template>
    <template v-if="meta && doc" #actions>
      <a v-if="original.status === 'Reported'" :href="printUrl(name)" target="_blank" class="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50">
        <LucideIcon name="printer" class="h-4 w-4" /> Print
      </a>
      <button v-if="canCancelTest" type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60" :disabled="busy" @click="cancelTest">Cancel test</button>
      <button v-if="canDelete" type="button" class="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60" :disabled="busy" @click="deleteTest">
        <LucideIcon name="trash-2" class="h-4 w-4" /> Delete
      </button>
      <template v-if="canWrite">
        <button v-if="dirty && !isNew" type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" :disabled="busy" @click="load">Discard</button>
        <!-- With a next step, it is the brand button and Save stays white. -->
        <button v-if="dirty || isNew" type="button" class="h-9 rounded-lg px-5 text-sm font-semibold disabled:opacity-60" :class="step ? 'border border-gray-300 bg-white hover:bg-gray-50' : 'bg-brand-700 text-white hover:bg-brand-800'" :disabled="busy" @click="save">{{ busy && !step ? 'Saving…' : 'Save' }}</button>
        <button v-if="step" type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy" @click="runStep">{{ busy ? 'Saving…' : step.label }}</button>
      </template>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-else-if="meta && doc" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <LabTestContext :ctx="ctx" :patient-name="doc.patient_name || ''" />
      <SectionJump :sections="jumpSections" />

      <!-- One red block under the patient bar, seen after a click at the top. -->
      <div v-if="saveError || stepError || (missing.length && tried)" class="flex items-start gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <div class="min-w-0 flex-1">
          <p v-if="saveError" class="whitespace-pre-line">{{ saveError }}</p>
          <p v-else-if="stepError">{{ stepError }}</p>
          <p v-else><span class="font-semibold">Please fill:</span> {{ missing.join(', ') }}</p>
        </div>
        <button v-if="saveError && staleDoc" type="button" class="h-8 shrink-0 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" @click="load">Reload latest</button>
      </div>

      <template v-if="!isNew">
        <LabStepper :doc="original" />

        <p v-if="original.status === 'Cancelled'" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          <span class="font-semibold">Cancelled.</span> {{ original.cancel_reason }}
        </p>

        <!-- The work for the step the test is at - the one main button for it
        is at the top of the page. -->
        <section v-else id="sec-work" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <SubHeading :icon="stage.icon">{{ stage.title }}</SubHeading>

          <!-- 1. Not paid: nothing for the lab to do yet. -->
          <div v-if="stage.key === 'unpaid'" class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>The patient pays for <b>{{ doc.item_name }}</b> at Billing. This test turns to Paid by itself when the bill is submitted.</p>
            <button type="button" class="h-8 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold" :disabled="busy" @click="load">Check again</button>
          </div>

          <!-- 2. Paid: what to draw it in, from the Lab Sample Type. -->
          <template v-else-if="stage.key === 'collect'">
            <div v-if="sampleInfo" class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div v-for="[label, value] in sampleRows" :key="label" class="rounded-lg bg-brand-50 px-3 py-2">
                <p class="text-xs text-gray-600">{{ label }}</p>
                <p class="font-semibold text-gray-900">{{ value || '—' }}</p>
              </div>
            </div>
            <p v-else class="text-sm text-gray-600">No sample type is set for this test. Marking it collected only moves it on.</p>
            <p class="text-sm text-gray-600">This patient's other paid tests can be collected together from <router-link :to="{ name: 'LabWorklist' }" class="font-semibold text-brand-700 hover:underline">Lab → Collect samples</router-link>.</p>
          </template>

          <!-- 3-5. Results: typed while Sample Collected / Result Entered, read-only once Reported. -->
          <template v-else>
            <p v-if="stage.key === 'verify' && !isVerifier" class="rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-900">Results are saved. A Lab Verifier checks them and reports the test to the doctor.</p>
            <p v-else-if="stage.key === 'verify'" class="rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-900">Check every value against the sample, then click <b>Verify &amp; report</b>. The report goes to the doctor and is locked.</p>
            <LabResultsTable v-if="doc.results?.length" :rows="doc.results" :readonly="resultsLocked" />
            <div v-for="df in resultFields" :key="df.fieldname">
              <FormField :df="df" :doc="doc" :model-value="doc[df.fieldname]" :readonly="resultsLocked || readOnly(df)" @update:model-value="(v) => setValue(df, v)" />
            </div>
          </template>
        </section>
      </template>

      <!-- The consultation's diagnosis / notes, only when the user may read it. -->
      <section v-if="ctx && (ctx.diagnosis || ctx.clinical_notes)" id="sec-ctx" class="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="stethoscope">Consultation</SubHeading>
        <div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div v-if="ctx.diagnosis">
            <p class="text-gray-500">Diagnosis</p>
            <p class="whitespace-pre-line text-gray-900">{{ ctx.diagnosis }}</p>
          </div>
          <div v-if="ctx.clinical_notes">
            <p class="text-gray-500">Clinical Notes</p>
            <p class="whitespace-pre-line text-gray-900">{{ ctx.clinical_notes }}</p>
          </div>
        </div>
      </section>

      <!-- Every other field of the Desk form, in Desk's order and sections,
      three per row. Open while creating; folded away once the test is
      under way, since the work panel above is what the lab uses. -->
      <section id="sec-details" class="scroll-mt-4 rounded-xl border border-gray-200 bg-white">
        <button v-if="!isNew" type="button" class="block w-full px-5 py-3.5 text-left" :aria-expanded="detailsOpen" @click="detailsOpen = !detailsOpen">
          <SubHeading icon="file-text">
            Test details
            <template #end><LucideIcon :name="detailsOpen ? 'chevron-up' : 'chevron-down'" class="h-4 w-4 text-gray-500" /></template>
          </SubHeading>
        </button>
        <div v-if="isNew || detailsOpen" class="flex flex-col gap-5 px-5 pb-5" :class="isNew ? 'pt-5' : ''">
          <div v-for="(s, si) in detailSections" :key="si" class="flex flex-col gap-4">
            <p v-if="s.label" class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ s.label }}</p>
            <template v-for="(chunk, ki) in chunksOf(s)" :key="ki">
          <div v-if="!chunk.wide" :class="GRID">
            <FormField
              v-for="df in chunk.fields"
              :key="df.fieldname"
              :df="df"
              :doc="doc"
              :filters="linkFilters(DT, df.fieldname)"
              :model-value="doc[df.fieldname]"
              :readonly="readOnly(df)"
              :required="isRequired(df, doc)"
              :error="tried && missingSet.has(df.label) ? 'Required' : ''"
              @update:model-value="(v) => setValue(df, v)"
            />
          </div>
          <FormField
            v-else
            :df="chunk.df"
            :doc="doc"
            :filters="linkFilters(DT, chunk.df.fieldname)"
            :model-value="doc[chunk.df.fieldname]"
            :readonly="readOnly(chunk.df)"
            :required="isRequired(chunk.df, doc)"
            :error="tried && missingSet.has(chunk.df.label) ? 'Required' : ''"
            @update:model-value="(v) => setValue(chunk.df, v)"
          />
            </template>
          </div>
        </div>
      </section>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </form>
    <p v-else class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import SubHeading from '@/components/SubHeading.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import FormField from '@/components/FormField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import LabTestContext from '@/components/lab/LabTestContext.vue'
import LabResultsTable from '@/components/lab/LabResultsTable.vue'
import LabStepper from '@/components/lab/LabStepper.vue'
import SectionJump from '@/components/SectionJump.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { getMeta } from '@/data/meta'
import { errorText } from '@/data/api'
import { session, hasRole } from '@/data/session'
import { buildLayout, newDoc, isVisible, isRequired, isReadOnly, fetchTargets, missingFields, toPayload, linkFilters } from '@/data/formEngine'
import { DT, LAB_API, LAB_API_DT, NEXT_STEP, CANCELLABLE, NEEDS_RESULT_MSG, VERIFIER_ROLES, nowIST, hasResult, printUrl } from '@/data/lab/labRules'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()
const route = useRoute()

const meta = ref(null)
const byName = ref({})
const doc = ref(null)
const original = ref({})
const snapshot = ref('')
const perms = ref({})
const ctx = ref(null)
const loadError = ref('')
const saveError = ref('')
const stepError = ref('')
const savedNote = ref('')
const staleDoc = ref(false)
const busy = ref(false)
const tried = ref(false)

const isNew = computed(() => props.name === 'new')
// Desk's permissions, per record (Doctor: read/create only, and only their
// own patients' tests via the server's permission hooks).
const canWrite = computed(() => (isNew.value ? perms.value.create : perms.value.write))
const canDelete = computed(() => !isNew.value && perms.value.delete)
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
const sections = computed(() => (meta.value ? buildLayout(meta.value)[0]?.sections || [] : []))
const missing = computed(() => (meta.value && doc.value ? missingFields(meta.value, doc.value, byName.value) : []))
const missingSet = computed(() => new Set(missing.value))
const jumpSections = computed(() => [
  ...(!isNew.value && original.value.status !== 'Cancelled' ? [{ id: 'sec-work', label: stage.value.title }] : []),
  ...(ctx.value && (ctx.value.diagnosis || ctx.value.clinical_notes) ? [{ id: 'sec-ctx', label: 'Consultation' }] : []),
  { id: 'sec-details', label: 'Test details' },
])

// Fields the work panel shows (or the buttons set), so Test details leaves
// them out. Status moves only by the step buttons and Cancel, never by hand;
// the server refuses a skipped step anyway.
const PANEL_FIELDS = ['result', 'normal_range', 'result_attachment', 'remarks']
const HIDDEN_ALWAYS = ['status', 'results', 'cancel_reason']
const detailsOpen = ref(false)
const detailSections = computed(() =>
  sections.value.filter((s) => chunksOf(s).length),
)

// The step the test is at, from the saved record - it picks the work panel.
const stage = computed(() => {
  const d = original.value
  if (d.status === 'Ordered') return d.is_paid ? { key: 'collect', title: 'Collect sample', icon: 'test-tube' } : { key: 'unpaid', title: 'Waiting for payment', icon: 'wallet' }
  if (d.status === 'Sample Collected') return { key: 'results', title: 'Enter results', icon: 'clipboard-list' }
  if (d.status === 'Result Entered') return { key: 'verify', title: 'Verify results', icon: 'shield-check' }
  return { key: 'report', title: 'Report', icon: 'file-check' }
})
const isVerifier = computed(() => hasRole(...VERIFIER_ROLES))
// Results are typed only between sample and report (server rule too).
const resultsLocked = computed(() => !canWrite.value || !['Sample Collected', 'Result Entered'].includes(original.value.status))
// The free-text result, range, attachment and remarks - for a test with no
// template rows these ARE the result; with rows, only Remarks is shown.
const resultFields = computed(() => {
  if (!meta.value) return []
  const names = doc.value?.results?.length ? ['remarks'] : PANEL_FIELDS
  return names.map((n) => meta.value.fields.find((f) => f.fieldname === n)).filter(Boolean)
})

// Tube to use, from the template's Lab Sample Type (read in load()).
const sampleInfo = ref(null)
const sampleRows = computed(() => {
  const s = sampleInfo.value || {}
  return [
    ['Sample', s.name],
    ['Container', s.container],
    ['Tube colour', s.tube_colour],
    ['Volume', s.volume],
  ]
})
async function loadSampleInfo() {
  sampleInfo.value = null
  const tpl = doc.value?.lab_test_template
  if (!tpl || isNew.value) return
  try {
    const t = await call('frappe.client.get_value', { doctype: 'Lab Test Template', filters: tpl, fieldname: ['sample_type'] })
    if (!t?.sample_type) return
    const s = await call('frappe.client.get_value', { doctype: 'Lab Sample Type', filters: t.sample_type, fieldname: ['name', 'container', 'tube_colour', 'volume'] })
    sampleInfo.value = s || { name: t.sample_type }
  } catch {
    // only a help for the person collecting - the screen works without it
  }
}

// Three fields per row; a lone last field takes the whole row (row-fit).
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'
// FormField draws these as boxes that need the whole width.
const WIDE = ['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code', 'Markdown Editor', 'HTML Editor', 'JSON', 'Signature', 'Geolocation', 'Table', 'Table MultiSelect']
// A section's visible fields in Desk order (columns read left to right),
// cut into runs of short fields (one grid each) and lone wide fields.
function chunksOf(s) {
  const out = []
  for (const df of s.columns.flat()) {
    if (!isVisible(df, doc.value)) continue
    if (HIDDEN_ALWAYS.includes(df.fieldname) || (!isNew.value && PANEL_FIELDS.includes(df.fieldname))) continue
    if (WIDE.includes(df.fieldtype)) out.push({ wide: true, df })
    else if (out.length && !out[out.length - 1].wide) out[out.length - 1].fields.push(df)
    else out.push({ wide: false, fields: [df] })
  }
  return out
}
const title = computed(() => (isNew.value ? 'New test' : doc.value?.patient_name || props.name))

// The step button follows the saved status; once the Status dropdown is
// changed by hand, plain Save is the only action so the choice isn't overridden.
const step = computed(() => {
  if (isNew.value || !doc.value || doc.value.status !== original.value.status) return null
  const s = NEXT_STEP[original.value.status]
  if (!s) return null
  // Nothing to collect until Billing has the money (the server refuses too).
  if (original.value.status === 'Ordered' && !original.value.is_paid) return null
  // Lab tests are reported only by a verifier (the server checks it too);
  // X-Ray / Scan / Other keep the plain "Report" step for Lab Staff.
  if (s.verify && original.value.test_type === 'Lab Test') {
    return hasRole(...VERIFIER_ROLES) ? { ...s, label: s.verifyLabel } : null
  }
  return s
})
const canCancelTest = computed(() => canWrite.value && !isNew.value && CANCELLABLE.includes(original.value.status))

function readOnly(df) {
  return isReadOnly(df, doc.value, { canWrite: canWrite.value, original: original.value })
}

async function load() {
  loadError.value = ''
  saveError.value = ''
  stepError.value = ''
  staleDoc.value = false
  tried.value = false
  try {
    const m = await getMeta(DT)
    meta.value = m.meta
    byName.value = m.byName
    if (isNew.value) {
      doc.value = newDoc(m.meta, session.user)
      doc.value.ordered_on = nowIST()
      // Starting values from the address (?doctor_consultation=…), like
      // Desk's frappe.new_doc; Links fill their fetch_from fields.
      for (const [k, v] of Object.entries(route.query)) {
        const df = m.meta.fields.find((f) => f.fieldname === k)
        if (df && typeof v === 'string') await setValue(df, v)
      }
      perms.value = await call('metta.api.get_doc_permissions', { doctype: DT })
    } else {
      doc.value = await call('frappe.client.get', { doctype: DT, name: props.name })
      perms.value = await call('metta.api.get_doc_permissions', { doctype: DT, name: props.name })
    }
    original.value = JSON.parse(JSON.stringify(doc.value))
    snapshot.value = JSON.stringify(toPayload(doc.value))
  } catch (err) {
    loadError.value = errorText(err) || `${DT} ${props.name} could not be opened.`
    return
  }
  loadContext()
  loadSampleInfo()
}

// Context is a help, not a must: if it can't be read the form still works.
async function loadContext() {
  const args = isNew.value ? { consultation: doc.value?.doctor_consultation } : { test: props.name }
  if (!args.test && !args.consultation) {
    ctx.value = null
    return
  }
  try {
    const res = await call(`${LAB_API}.get_test_context`, args)
    ctx.value = res && res.consultation ? res : null
  } catch {
    ctx.value = null
  }
}

// Setting a Link also fills its fetch_from fields (patient_name from the
// consultation, item_name from the item); clearing it clears them.
async function setValue(df, v) {
  doc.value[df.fieldname] = v
  if (df.fieldtype !== 'Link') return
  if (isNew.value && df.fieldname === 'doctor_consultation') loadContext()
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
    // no read access to the source - the server fills fetched values on save
  }
}

// Saved through frappe.client, so DiagnosticTest.validate() stamps
// reported_by / reported_on exactly as a Desk save does.
async function save() {
  tried.value = true
  saveError.value = ''
  stepError.value = ''
  savedNote.value = ''
  if (missing.value.length) {
    document.querySelector('[role=alert]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return false
  }
  busy.value = true
  try {
    const payload = toPayload(doc.value)
    const saved = isNew.value ? await call('frappe.client.insert', { doc: payload }) : await call('frappe.client.save', { doc: payload })
    doc.value = saved
    original.value = JSON.parse(JSON.stringify(saved))
    snapshot.value = JSON.stringify(toPayload(saved))
    tried.value = false
    savedNote.value = 'Saved'
    if (isNew.value) router.replace({ name: 'LabTest', params: { name: saved.name } })
    return true
  } catch (err) {
    staleDoc.value = err?.exc_type === 'TimestampMismatchError'
    saveError.value = errorText(err) || 'Something went wrong. Please try again.'
    return false
  } finally {
    busy.value = false
  }
}

// Moves the status one step on and saves; any edits on screen go with it.
// "Sample collected" also records the time, unless already filled in.
async function runStep() {
  const s = step.value
  if (!s) return
  if (s.needsResult && !hasResult(doc.value)) {
    stepError.value = NEEDS_RESULT_MSG
    return
  }
  // Collecting goes through collect_samples (as Desk's Collect Sample does)
  // so the tube gets its Sample ID; unsaved edits are saved first.
  if (s.to === 'Sample Collected') {
    if (dirty.value && !(await save())) return
    busy.value = true
    try {
      const samples = (await call(`${LAB_API_DT}.collect_samples`, { tests: [props.name] })) || []
      await load()
      savedNote.value = samples.length ? `Sample ID ${samples.map((x) => x.sample).join(', ')}` : 'Saved'
    } catch (err) {
      stepError.value = errorText(err) || 'Could not mark the sample collected.'
    } finally {
      busy.value = false
    }
    return
  }
  const before = { status: doc.value.status, sample_collected_on: doc.value.sample_collected_on }
  doc.value.status = s.to
  if (s.to === 'Sample Collected' && !doc.value.sample_collected_on) doc.value.sample_collected_on = nowIST()
  if (!(await save())) Object.assign(doc.value, before)
}

// Desk makes Cancel Reason mandatory once Cancelled, so ask for it here.
async function cancelTest() {
  const reason = window.prompt(`Why is this test for ${doc.value.patient_name || props.name} being cancelled?`)
  if (!reason || !reason.trim()) return
  const before = { status: doc.value.status, cancel_reason: doc.value.cancel_reason }
  doc.value.status = 'Cancelled'
  doc.value.cancel_reason = reason.trim()
  if (!(await save())) Object.assign(doc.value, before)
}

async function deleteTest() {
  if (!window.confirm(`Delete ${props.name}?`)) return
  busy.value = true
  try {
    await call('frappe.client.delete', { doctype: DT, name: props.name })
    snapshot.value = JSON.stringify(toPayload(doc.value))
    router.replace({ name: 'LabWorklist' })
  } catch (err) {
    saveError.value = errorText(err) || 'Could not delete.'
  } finally {
    busy.value = false
  }
}

// After "new" is saved the address changes to the real name - same page,
// so reload for that record.
watch(
  () => props.name,
  (n, old) => {
    if (n !== old) {
      ctx.value = null
      load()
    }
  },
)

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
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>
