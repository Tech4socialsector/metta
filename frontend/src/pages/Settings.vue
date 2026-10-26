<template>
  <AppLayout title="Settings" subtitle="Changes show straight away. Save to apply them for everyone; leave without saving to undo.">
    <template #actions>
      <button v-if="changed" type="button" class="h-9 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50" @click="undo">Undo changes</button>
      <button type="button" class="h-9 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60" :disabled="!canSave || saving || !changed" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </template>

    <p v-if="!canSave" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Only a System Manager can change these settings.</p>
    <p v-if="message" class="rounded-lg px-4 py-3 text-sm" :class="error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'">{{ message }}</p>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section class="flex min-w-0 flex-col gap-5 rounded-xl border border-gray-200 bg-white px-5 py-4">
        <SectionTitle icon="palette" title="Appearance" />

        <FormSection title="Logo & name" icon="image">
          <div class="flex flex-col gap-1">
            <span class="ctl-label">Logo</span>
            <div class="flex items-center gap-3">
              <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-1">
                <img :src="draft.logo || defaultLogo" alt="" class="h-full w-full object-contain" />
              </span>
              <div class="flex flex-col gap-1.5">
                <label class="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-gray-100 px-3 text-sm font-medium hover:bg-gray-200" :class="!canSave && 'pointer-events-none opacity-60'">
                  <LucideIcon name="upload" class="h-4 w-4" />{{ uploading ? 'Uploading…' : 'Upload logo' }}
                  <input type="file" accept="image/*" class="sr-only" :disabled="!canSave || uploading" @change="upload($event.target.files[0])" />
                </label>
                <button v-if="draft.logo" type="button" class="text-left text-xs text-gray-600 hover:underline" :disabled="!canSave" @click="draft.logo = ''">Use default logo</button>
              </div>
            </div>
          </div>
          <TextField id="app_name" v-model="draft.app_name" label="App name" :readonly="!canSave" placeholder="LCH HMIS" />
          <TextField id="hospital_name" v-model="draft.hospital_name" label="Hospital name" :readonly="!canSave" placeholder="Shown under the app name" />
        </FormSection>

        <!-- Two steps per colour: pick a colour, then how light or dark it is. -->
        <FormSection v-for="k in KINDS" :key="k.key" :title="k.title" :icon="k.icon" :cols="1">
          <div class="flex flex-col gap-1.5">
            <span class="ctl-label">1. Colour</span>
            <div class="flex flex-wrap items-center gap-2.5">
              <button
                v-for="f in k.families"
                :key="f.name"
                type="button"
                :title="f.name"
                :aria-label="f.name"
                :aria-pressed="family[k.key] === f.name"
                :disabled="!canSave"
                class="h-9 w-9 rounded-full"
                :style="swatchStyle(f.hex, family[k.key] === f.name)"
                @click="pickFamily(k, f)"
              />
              <label class="ml-1 flex h-9 items-center gap-2 rounded-md bg-gray-100 px-2.5" :title="'Any other colour'">
                <input type="color" :value="draft[k.field]" :disabled="!canSave" class="h-6 w-7 cursor-pointer border-0 bg-transparent p-0" :aria-label="`Pick any ${k.word}`" @input="pickCustom(k, $event.target.value)" />
                <input :value="draft[k.field]" :readonly="!canSave" maxlength="7" class="w-20 bg-transparent font-mono text-sm uppercase focus:outline-none" :aria-label="`${k.word} code`" @change="pickCustom(k, $event.target.value)" />
              </label>
            </div>
          </div>
          <div v-if="family[k.key]" class="flex flex-col gap-1.5">
            <span class="ctl-label">2. Shade of {{ family[k.key] }}</span>
            <div class="flex flex-wrap gap-2.5">
              <button
                v-for="s in shadeChoices(k)"
                :key="s.hex"
                type="button"
                :aria-pressed="same(draft[k.field], s.hex)"
                :disabled="!canSave"
                class="flex w-[88px] flex-col items-center gap-1 rounded-lg p-1 text-xs"
                :class="same(draft[k.field], s.hex) ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-50'"
                @click="draft[k.field] = s.hex"
              >
                <span class="h-9 w-full rounded-md" :style="{ background: s.hex, boxShadow: same(draft[k.field], s.hex) ? `0 0 0 2px #fff, 0 0 0 4px ${s.hex}` : 'none' }" />
                {{ s.label }}
              </button>
            </div>
          </div>
        </FormSection>

        <div>
          <button type="button" class="text-sm font-medium text-brand-700 hover:underline disabled:opacity-60" :disabled="!canSave" @click="restoreDefault">Back to the standard look</button>
        </div>
      </section>

      <!-- A small sample of each themed part, next to the real app around it. -->
      <aside class="flex min-w-0 flex-col gap-3 self-start rounded-xl border border-gray-200 bg-white px-5 py-4">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</span>
        <SectionTitle icon="users-round" title="Patient Registration">
          <span class="rounded-md bg-accent-500 px-2 py-0.5 text-xs font-bold text-white">OP</span>
        </SectionTitle>
        <FormSection title="Basic details" icon="user-round" :cols="2">
          <TextField id="pv_first" model-value="Lakshmi" label="First Name" reqd />
          <TextField id="pv_full" model-value="Lakshmi Ramesh" label="Full Name" readonly />
        </FormSection>
        <div class="flex items-center gap-2 pt-1">
          <span class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white">Save registration</span>
          <span class="flex h-9 items-center rounded-md border border-gray-300 px-4 text-sm font-semibold">Cancel</span>
        </div>
      </aside>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import FormSection from '@/components/FormSection.vue'
import TextField from '@/components/TextField.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { errorText } from '@/data/api'
import { hasRole } from '@/data/session'
import { DEFAULT_THEME, theme, applyTheme, saveTheme, relightened } from '@/data/theme'

// Colour families. Each hex is the family's standard shade - the brand
// anchor (700) for the main colour, the accent anchor (500) for the second.
// Picking a family then offers five shades of it, light to dark (user,
// 2026-10-24: "if they choose red - light, dark, more light - they can choose").
const BRAND_FAMILIES = [
  { name: 'Ocean blue', hex: '#0B5B8C' },
  { name: 'Blue', hex: '#1E4FA8' },
  { name: 'Indigo', hex: '#3B3F8F' },
  { name: 'Teal', hex: '#0F5F5A' },
  { name: 'Green', hex: '#1F6B3A' },
  { name: 'Red', hex: '#A3242B' },
  { name: 'Maroon', hex: '#7A1F2B' },
  { name: 'Purple', hex: '#5B2C83' },
  { name: 'Graphite', hex: '#2F3640' },
]
const ACCENT_FAMILIES = [
  { name: 'Orange', hex: '#EA6A12' },
  { name: 'Amber', hex: '#D99A06' },
  { name: 'Red', hex: '#DC3A32' },
  { name: 'Rose', hex: '#D9466F' },
  { name: 'Green', hex: '#2E9E55' },
  { name: 'Teal', hex: '#1A9A8F' },
  { name: 'Blue', hex: '#2F7FD6' },
]
// The five shades offered, each from the colour's own lightness: two lighter
// (+ % points), the colour itself, two darker (x factor). The main colour
// carries white text (top bar, buttons), so its lightest stays at or under
// 50% lightness to keep that text readable.
const KINDS = [
  { key: 'brand', field: 'brand_color', title: 'Main colour — top bar, section headings, buttons', icon: 'paint-bucket', word: 'main colour', families: BRAND_FAMILIES, steps: [14, 7, 0, 0.82, 0.66], maxL: 50 },
  { key: 'accent', field: 'accent_color', title: 'Second colour — tags and small highlights', icon: 'sparkles', word: 'second colour', families: ACCENT_FAMILIES, steps: [22, 11, 0, 0.86, 0.72], maxL: 82 },
]
const SHADE_LABELS = ['Light', 'Medium', 'Standard', 'Dark', 'Darker']
const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()

function shadeChoicesOf(kind, familyHex) {
  return kind.steps.map((change, i) => ({
    label: SHADE_LABELS[i],
    // Standard is the family colour exactly, so a saved default maps back to it.
    hex: change === 0 ? familyHex.toUpperCase() : toHex(relightened(familyHex, change, Math.max(kind.maxL, 0))),
  }))
}
function shadeChoices(kind) {
  const f = kind.families.find((x) => x.name === family[kind.key])
  return f ? shadeChoicesOf(kind, f.hex) : []
}
// The family a saved colour belongs to (one of its five shades), else none -
// a colour typed in or picked freely shows no family.
function familyOf(kind, hex) {
  return kind.families.find((f) => shadeChoicesOf(kind, f.hex).some((s) => same(s.hex, hex)))?.name || ''
}

const defaultLogo = `${import.meta.env.BASE_URL}logo-mark.png`
const canSave = computed(() => hasRole('System Manager'))

// What is saved now, and what is being edited. The edit previews live on
// every screen; leaving without saving puts the saved look back.
const savedTheme = ref({ ...theme })
const draft = reactive({ ...theme })
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '')
const same = (a, b) => String(a).toUpperCase() === String(b).toUpperCase()

watch(
  draft,
  (d) => {
    if (isHex(d.brand_color) && isHex(d.accent_color)) applyTheme({ ...d })
  },
  { deep: true },
)

const changed = computed(() => Object.keys(DEFAULT_THEME).some((k) => (draft[k] || '') !== (savedTheme.value[k] || '')))

// Selected family per colour, found from the colour now in use.
const family = reactive({ brand: '', accent: '' })
function syncFamilies() {
  for (const k of KINDS) family[k.key] = familyOf(k, draft[k.field])
}
syncFamilies()

function pickFamily(kind, f) {
  family[kind.key] = f.name
  draft[kind.field] = shadeChoicesOf(kind, f.hex)[2].hex // its Standard shade
}
function pickCustom(kind, value) {
  const v = String(value || '').trim().toUpperCase()
  if (!isHex(v)) return
  draft[kind.field] = v
  family[kind.key] = familyOf(kind, v)
}

function swatchStyle(hex, on) {
  return { background: hex, boxShadow: on ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : 'none', cursor: canSave.value ? 'pointer' : 'default' }
}

function undo() {
  Object.assign(draft, savedTheme.value)
  syncFamilies()
}
function restoreDefault() {
  Object.assign(draft, DEFAULT_THEME)
  syncFamilies()
}

const saving = ref(false)
const message = ref('')
const error = ref(false)
async function save() {
  if (!isHex(draft.brand_color) || !isHex(draft.accent_color)) {
    error.value = true
    message.value = 'Colours must look like #0B5B8C.'
    return
  }
  saving.value = true
  message.value = ''
  try {
    savedTheme.value = await saveTheme({ ...draft })
    Object.assign(draft, { ...DEFAULT_THEME, ...Object.fromEntries(Object.entries(savedTheme.value).filter(([, v]) => v)) })
    savedTheme.value = { ...draft }
    error.value = false
    message.value = 'Saved. Everyone sees the new look the next time a page loads.'
  } catch (err) {
    error.value = true
    message.value = errorText(err) || 'Could not save.'
  } finally {
    saving.value = false
  }
}

// Frappe's own upload endpoint (public file, so the logo shows on the login page too).
const uploading = ref(false)
async function upload(file) {
  if (!file) return
  uploading.value = true
  message.value = ''
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
    draft.logo = data.message.file_url
  } catch (err) {
    error.value = true
    message.value = errorText(err) || 'Upload failed.'
  } finally {
    uploading.value = false
  }
}

onBeforeUnmount(() => {
  if (changed.value) applyTheme(savedTheme.value)
})
</script>
