<template>
  <!-- One Desk field, any fieldtype - the control the generic form uses
  (Pathways' MasterField pattern, MIT, Tech4socialsector). -->
  <div :data-field="df.fieldname" class="min-w-0">
    <label v-if="df.fieldtype === 'Check'" class="flex min-h-8 cursor-pointer items-center gap-2.5">
      <input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-600" :checked="!!modelValue" :disabled="readonly" @change="set($event.target.checked ? 1 : 0)" />
      <span class="text-sm text-gray-800">{{ df.label }}<span v-if="required" class="text-red-600"> *</span></span>
    </label>

    <LinkField
      v-else-if="linkDoctype"
      :id="inputId"
      :label="df.label"
      :doctype="linkDoctype"
      :model-value="modelValue || ''"
      :filters="filters"
      :reqd="required"
      :readonly="readonly"
      :hint="hint"
      @update:model-value="set"
    />

    <template v-else>
      <label :for="inputId" class="mb-1 block font-medium" :class="look.label">
        {{ df.label }}<span v-if="required" class="text-red-600"> *</span>
      </label>

      <select v-if="df.fieldtype === 'Select'" :id="inputId" :value="modelValue ?? ''" :disabled="readonly" :class="boxClass" @change="set($event.target.value)">
        <option v-for="o in options" :key="o" :value="o">{{ o || '—' }}</option>
        <option v-if="modelValue && !options.includes(modelValue)" :value="modelValue">{{ modelValue }}</option>
      </select>

      <textarea v-else-if="TEXT_AREA.includes(df.fieldtype)" :id="inputId" :value="modelValue ?? ''" :readonly="readonly" :rows="df.fieldtype === 'Small Text' ? 3 : 5" :class="areaClass" @input="set($event.target.value)"></textarea>

      <div v-else-if="ATTACH.includes(df.fieldtype)" class="flex flex-wrap items-center gap-2">
        <a v-if="modelValue" :href="modelValue" target="_blank" rel="noopener" class="max-w-full truncate text-sm text-brand-700 underline">{{ fileName }}</a>
        <span v-else class="text-sm text-gray-500">No file</span>
        <template v-if="!readonly">
          <label class="flex h-8 cursor-pointer items-center rounded-md bg-gray-100 px-3 text-sm font-medium hover:bg-gray-200">
            {{ uploading ? 'Uploading…' : modelValue ? 'Replace' : 'Attach' }}
            <input type="file" class="sr-only" :accept="df.fieldtype === 'Attach Image' ? 'image/*' : undefined" :disabled="uploading" @change="upload($event.target.files[0])" />
          </label>
          <button v-if="modelValue" type="button" class="text-sm text-gray-600 hover:underline" @click="set('')">Remove</button>
        </template>
      </div>

      <input
        v-else
        :id="inputId"
        :type="inputType"
        :value="inputValue"
        :readonly="readonly"
        :step="step"
        :maxlength="df.fieldtype === 'Data' && df.length ? df.length : undefined"
        :class="boxClass"
        @input="onInput($event.target.value)"
      />
    </template>

    <p v-if="error" class="mt-1 text-sm text-red-600">{{ error }}</p>
    <p v-else-if="hint && !linkDoctype" class="mt-1 text-xs text-gray-500">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LinkField from '@/components/LinkField.vue'
import { errorText } from '@/data/api'
import { fieldLook } from '@/data/fieldLook'

const look = fieldLook()

const props = defineProps({
  df: { type: Object, required: true },
  modelValue: { type: [String, Number, Array], default: null },
  // the document, for Dynamic Link
  doc: { type: Object, default: () => ({}) },
  readonly: Boolean,
  required: Boolean,
  error: { type: String, default: '' },
  idPrefix: { type: String, default: 'f' },
  // a Link's picker filter (Desk's set_query)
  filters: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const TEXT_AREA = ['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code', 'Markdown Editor', 'HTML Editor', 'JSON', 'Signature', 'Geolocation']
const ATTACH = ['Attach', 'Attach Image']
const NUMBER = ['Int', 'Float', 'Currency', 'Percent', 'Rating', 'Duration']

const inputId = computed(() => `${props.idPrefix}-${props.df.fieldname}`)
// Same box as TextField/SelectField/LinkField (Frappe Desk look by default).
const boxClass = computed(() => [
  'w-full px-3',
  look.box,
  look.height,
  props.readonly ? look.locked : props.error ? look.invalid : look.editable,
])
// Text areas: same look, but their height comes from rows, not the 32px box.
const areaClass = computed(() => [
  'w-full px-3 py-2',
  look.box,
  props.readonly ? look.locked : props.error ? look.invalid : look.editable,
])
// Desk shows a field's description under it.
const hint = computed(() => String(props.df.description || '').replace(/<[^>]+>/g, '').trim())
const options = computed(() => String(props.df.options || '').split('\n'))
const linkDoctype = computed(() => {
  if (props.df.fieldtype === 'Link') return props.df.options
  if (props.df.fieldtype === 'Dynamic Link') return props.doc?.[props.df.options] || ''
  return ''
})
const inputType = computed(() => {
  const t = props.df.fieldtype
  if (NUMBER.includes(t)) return 'number'
  if (t === 'Date') return 'date'
  if (t === 'Datetime') return 'datetime-local'
  if (t === 'Time') return 'time'
  if (t === 'Password') return 'password'
  if (t === 'Color') return 'color'
  return 'text'
})
const step = computed(() => (props.df.fieldtype === 'Int' ? '1' : NUMBER.includes(props.df.fieldtype) ? 'any' : undefined))
// Datetime is stored "YYYY-MM-DD HH:mm:ss"; the input wants "YYYY-MM-DDTHH:mm".
const inputValue = computed(() => {
  const v = props.modelValue
  if (v === null || v === undefined) return ''
  if (props.df.fieldtype === 'Datetime') return String(v).slice(0, 16).replace(' ', 'T')
  if (props.df.fieldtype === 'Time') return String(v).slice(0, 8)
  return v
})
const fileName = computed(() => String(props.modelValue || '').split('/').pop())

function set(v) {
  emit('update:modelValue', v)
}
function onInput(v) {
  const t = props.df.fieldtype
  if (t === 'Datetime') return set(v ? `${v.replace('T', ' ')}:00` : null)
  if (t === 'Time') return set(v ? (v.length === 5 ? `${v}:00` : v) : null)
  if (NUMBER.includes(t)) return set(v === '' ? null : t === 'Int' ? parseInt(v, 10) : parseFloat(v))
  set(v)
}

// Frappe's own upload endpoint, as Desk's Attach control uses.
const uploading = ref(false)
async function upload(file) {
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    fd.append('is_private', '0')
    const res = await fetch('/api/method/upload_file', {
      method: 'POST',
      headers: window.csrf_token ? { 'X-Frappe-CSRF-Token': window.csrf_token } : {},
      body: fd,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?._server_messages || data?.exception || 'Upload failed')
    set(data.message.file_url)
  } catch (err) {
    window.alert(errorText(err) || 'Upload failed')
  } finally {
    uploading.value = false
  }
}
</script>
