<template>
  <AppLayout :title="title" :back-to="{ name: 'DocList', params: { doctype: DTT } }">
    <template v-if="doc" #meta>
      <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <StatusBadge v-if="!isNew" :status="doc.is_active ? 'Active' : 'Inactive'" />
        <span v-else class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Not saved</span>
        <span v-if="!isNew && (dirty || savedNote)">· {{ dirty ? 'Unsaved changes' : savedNote }}</span>
      </div>
    </template>
    <template v-if="doc" #actions>
      <DeleteRecord v-if="canDelete" :label="title" :busy="busy" @delete="remove" />
      <button v-if="canWrite && dirty && !isNew" type="button" class="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" :disabled="busy" @click="load">Discard</button>
      <button v-if="canWrite" type="button" class="h-9 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="busy || (!dirty && !isNew)" @click="save">{{ busy ? 'Saving…' : 'Save' }}</button>
    </template>

    <p v-if="loadError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{{ loadError }}</p>

    <form v-else-if="doc" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <p v-if="error" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>

      <section class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="flask-conical">Test</SubHeading>
        <div :class="GRID">
          <TextField id="ltt-name" v-model="doc.test_name" label="Test Name" reqd :readonly="!canWrite" />
          <LinkField id="ltt-item" :model-value="doc.item || ''" doctype="Item" label="Billing Item" reqd :filters="{ item_type: 'Service', is_active: 1 }" :readonly="!canWrite" @update:model-value="setItem" />
          <LinkField id="ltt-dept" v-model="doc.department" doctype="Department" label="Department" :readonly="!canWrite" />
          <LinkField id="ltt-sample" v-model="doc.sample_type" doctype="Lab Sample Type" label="Sample Type" :filters="{ is_active: 1 }" :readonly="!canWrite" />
          <SelectField id="ltt-rtype" v-model="doc.result_type" label="Result Type" reqd :options="RESULT_TYPES" :readonly="!canWrite" />
          <TextField id="ltt-tat" v-model="doc.turnaround_hours" label="Turnaround (Hours)" type="number" inputmode="numeric" unit="hrs" :readonly="!canWrite" />
          <TextField id="ltt-method" v-model="doc.method" label="Method" :readonly="!canWrite" />
          <label class="flex min-h-8 cursor-pointer items-center gap-2.5 self-end pb-1.5 text-sm">
            <input v-model="activeBox" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-brand-700" :disabled="!canWrite" /> Is Active
          </label>
        </div>
      </section>

      <!-- What the lab types results into: one row per parameter. Hidden for
      Text only tests, which keep no rows (the server clears them too). -->
      <section v-if="doc.result_type !== 'Text only'" class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <SubHeading icon="list-checks">
          Parameters
          <template #end><span class="text-xs font-normal text-gray-500">Ranges: low – high. Leave a side empty for "less than" / "more than".</span></template>
        </SubHeading>
        <div class="overflow-x-auto rounded-lg border border-gray-200">
          <table class="w-full min-w-[1180px] text-sm">
            <thead class="bg-brand-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-700">
              <tr>
                <th class="w-8 px-2 py-2">#</th>
                <th class="px-2 py-2">Parameter</th>
                <th class="w-24 px-2 py-2">Unit</th>
                <th class="w-36 px-2 py-2">Value Type</th>
                <th v-for="g in RANGE_GROUPS" :key="g.key" class="w-40 px-2 py-2 text-center" colspan="1">{{ g.label }}</th>
                <th class="w-36 px-2 py-2">Normal Value</th>
                <th class="w-10 px-2 py-2"><span class="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in doc.parameters" :key="r.name || r.__key" class="border-t border-gray-100 align-top">
                <td class="px-2 py-2 text-gray-500">{{ i + 1 }}</td>
                <td class="px-2 py-1.5"><input v-model="r.parameter" :aria-label="`Parameter ${i + 1}`" :class="cell(!canWrite)" :readonly="!canWrite" /></td>
                <td class="px-2 py-1.5"><input v-model="r.unit" :aria-label="`Unit ${i + 1}`" :class="cell(!canWrite)" :readonly="!canWrite" /></td>
                <td class="px-2 py-1.5">
                  <select v-model="r.value_type" :aria-label="`Value type ${i + 1}`" :class="cell(!canWrite)" :disabled="!canWrite">
                    <option v-for="v in VALUE_TYPES" :key="v" :value="v">{{ v }}</option>
                  </select>
                </td>
                <td v-for="g in RANGE_GROUPS" :key="g.key" class="px-2 py-1.5">
                  <div class="flex items-center gap-1">
                    <input v-model="r[`${g.key}_low`]" type="number" step="any" :aria-label="`${g.label} low ${i + 1}`" placeholder="low" :class="cell(!canWrite || r.value_type !== 'Number')" :readonly="!canWrite || r.value_type !== 'Number'" />
                    <span class="text-gray-400">–</span>
                    <input v-model="r[`${g.key}_high`]" type="number" step="any" :aria-label="`${g.label} high ${i + 1}`" placeholder="high" :class="cell(!canWrite || r.value_type !== 'Number')" :readonly="!canWrite || r.value_type !== 'Number'" />
                  </div>
                </td>
                <td class="px-2 py-1.5"><input v-model="r.normal_text" :aria-label="`Normal value ${i + 1}`" :placeholder="r.value_type === 'Positive-Negative' ? 'Negative' : ''" :class="cell(!canWrite || r.value_type === 'Number')" :readonly="!canWrite || r.value_type === 'Number'" /></td>
                <td class="px-2 py-1.5">
                  <button v-if="canWrite" type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700" :aria-label="`Remove row ${i + 1}`" @click="doc.parameters.splice(i, 1)">
                    <LucideIcon name="x" class="h-4 w-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="!doc.parameters.length">
                <td colspan="10" class="px-3 py-4 text-center text-gray-500">No parameters yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="canWrite">
          <button type="button" class="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50" @click="addRow">
            <LucideIcon name="plus" class="h-4 w-4" /> Add parameter
          </button>
        </div>
      </section>

      <RecordActivity v-if="!isNew" :doc="doc" />
    </form>
    <p v-else class="text-gray-600">Loading…</p>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DeleteRecord from '@/components/DeleteRecord.vue'
import SubHeading from '@/components/SubHeading.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import RecordActivity from '@/components/RecordActivity.vue'
import { errorText } from '@/data/api'
import { toPayload } from '@/data/formEngine'

const DTT = 'Lab Test Template'
const RESULT_TYPES = ['Parameters', 'Single value', 'Text only']
const VALUE_TYPES = ['Number', 'Text', 'Positive-Negative']
const RANGE_GROUPS = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'child', label: 'Child' },
  { key: 'critical', label: 'Critical' },
]
const GRID = 'row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()

const doc = ref(null)
const snapshot = ref('')
const perms = ref({})
const busy = ref(false)
const error = ref('')
const loadError = ref('')
const savedNote = ref('')

const isNew = computed(() => props.name === 'new')
const canWrite = computed(() => (isNew.value ? perms.value.create : perms.value.write))
const canDelete = computed(() => !isNew.value && perms.value.delete)
const dirty = computed(() => !!doc.value && JSON.stringify(toPayload(doc.value)) !== snapshot.value)
const title = computed(() => (isNew.value ? 'New lab test' : doc.value?.test_name || props.name))
// Check fields are 0/1 on the server.
const activeBox = computed({ get: () => !!doc.value?.is_active, set: (v) => (doc.value.is_active = v ? 1 : 0) })

let keySeq = 0
const cell = (locked) => ['h-8 w-full px-2', locked ? 'ctl-ro' : 'ctl']

function addRow() {
  doc.value.parameters.push({ doctype: 'Lab Test Parameter', __key: `k${++keySeq}`, __new: true, value_type: 'Number' })
}

// Most tests are named after their billing item (same as Desk's form script).
async function setItem(v) {
  doc.value.item = v
  if (!v || doc.value.test_name) return
  try {
    const r = await call('frappe.client.get_value', { doctype: 'Item', filters: v, fieldname: ['item_name'] })
    if (r?.item_name && !doc.value.test_name) doc.value.test_name = r.item_name
  } catch {
    // just a convenience
  }
}

async function load() {
  error.value = ''
  loadError.value = ''
  try {
    if (isNew.value) {
      doc.value = { doctype: DTT, __islocal: 1, result_type: 'Parameters', is_active: 1, parameters: [] }
      perms.value = await call('metta.api.get_doc_permissions', { doctype: DTT })
    } else {
      doc.value = await call('frappe.client.get', { doctype: DTT, name: props.name })
      perms.value = await call('metta.api.get_doc_permissions', { doctype: DTT, name: props.name })
    }
    doc.value.parameters = doc.value.parameters || []
    snapshot.value = JSON.stringify(toPayload(doc.value))
  } catch (err) {
    loadError.value = errorText(err) || `${DTT} ${props.name} could not be opened.`
  }
}

// Saved through frappe.client, so LabTestTemplate.validate() checks the
// Service item, rows and ranges exactly as a Desk save does.
async function save() {
  error.value = ''
  savedNote.value = ''
  if (!doc.value.test_name || !doc.value.item) {
    error.value = 'Please fill: ' + [!doc.value.test_name && 'Test Name', !doc.value.item && 'Billing Item'].filter(Boolean).join(', ')
    return
  }
  busy.value = true
  try {
    const payload = toPayload(doc.value)
    payload.parameters = payload.parameters.map(({ __key, ...r }) => r)
    const saved = isNew.value ? await call('frappe.client.insert', { doc: payload }) : await call('frappe.client.save', { doc: payload })
    doc.value = { ...saved, parameters: saved.parameters || [] }
    snapshot.value = JSON.stringify(toPayload(doc.value))
    savedNote.value = 'Saved'
    if (isNew.value) router.replace({ name: 'LabTemplateForm', params: { name: saved.name } })
  } catch (err) {
    error.value = errorText(err) || 'Something went wrong. Please try again.'
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await call('frappe.client.delete', { doctype: DTT, name: props.name })
    router.replace({ name: 'DocList', params: { doctype: DTT } })
  } catch (err) {
    error.value = errorText(err) || 'Could not delete.'
  } finally {
    busy.value = false
  }
}

watch(() => props.name, (n, old) => n !== old && load())
onMounted(load)
</script>
