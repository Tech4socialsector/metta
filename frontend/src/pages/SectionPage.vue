<template>
  <!-- A section (Store, Warehouse, Billing, Accounts) as cards that switch
  the list below, on the same page (user, 2026-10-26) - the same pattern as
  Patients. Each card is a form with its count; the picked card's full list
  (search, filters, columns) shows underneath and only the list scrolls.
  Store has more forms than fit in a row, so it gets group tabs first. -->
  <AppLayout v-if="section" :title="section.label" fill>
    <template #actions>
      <!-- The one main button: start a new one of the picked form. -->
      <component
        :is="current?.createHref ? 'a' : 'router-link'"
        v-if="current?.create || current?.createHref"
        v-bind="current.createHref ? { href: current.createHref } : { to: current.create }"
        class="flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
      >
        <LucideIcon name="plus" class="h-4 w-4" /> New {{ current.label }}
      </component>
    </template>

    <!-- Group tabs, only when the forms don't fit in one row of cards -->
    <div v-if="useGroupTabs" class="flex shrink-0 flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1" role="tablist" aria-label="Groups">
      <button
        v-for="g in groups"
        :key="g.label"
        type="button"
        role="tab"
        :aria-selected="activeGroup === g.label"
        class="rounded-lg px-4 py-2 text-[14px] font-bold"
        :class="activeGroup === g.label ? 'bg-brand-700 text-white' : 'text-gray-700 hover:bg-gray-50'"
        @click="pickGroup(g.label)"
      >
        {{ g.label }}
      </button>
    </div>

    <!-- The forms: one card each; the picked one decides the list below -->
    <div role="tablist" :aria-label="`${section.label} forms`" class="grid shrink-0 gap-3" :class="CARD_COLS[Math.min(cards.length, 6)]">
      <button
        v-for="t in cards"
        :key="t.key"
        type="button"
        role="tab"
        :aria-selected="selected === t.key"
        class="flex min-w-0 items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left transition-colors"
        :class="selected === t.key ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200 hover:border-brand-300'"
        @click="pick(t.key)"
      >
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" :class="selected === t.key ? 'bg-brand-700 text-white' : t.tone">
          <LucideIcon :name="t.icon || 'file-text'" class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span v-if="!useGroupTabs" class="block truncate text-[11px] font-bold uppercase tracking-[0.06em] text-gray-500">{{ t.group }}</span>
          <span class="block truncate text-[15px] font-bold text-accent-900">{{ t.label }}</span>
        </span>
        <span class="shrink-0 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums" :class="selected === t.key ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-700'">{{ t.count == null ? '…' : t.count.toLocaleString('en-IN') }}</span>
      </button>
    </div>

    <DataList v-if="current" :key="current.key" fill :doctype="current.key" :row-route="(r) => viewRoute(current.key, r.name)" :row-href="current.deskOnly ? (r) => deskUrl(current.key, r.name) : null" />
    <p v-else class="flex items-center gap-2 px-1 text-[13.5px] text-gray-500">
      <LucideIcon name="mouse-pointer-click" class="h-4 w-4" /> Click a card to see its list.
    </p>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { SECTIONS, DESK_ONLY, itemLabel, itemIcon } from '@/data/sections'
import { CUSTOM, formMenu, formInfo, loadFormMenu, createRoute, viewRoute } from '@/data/formMenu'

const props = defineProps({ section: { type: String, required: true } })

// Documents staff start in a section's daily work - their list card gets a
// "+ New" button (masters and records - Item, Warehouse, Stock Ledger... -
// don't; visits, consultations and tests start from the patient flow).
const DAILY = {
  Billing: 'Bill',
  'Sales Return': 'Sales Return',
  'Patient Advance': 'Patient Advance',
  'Stock Indent': 'Stock Indent',
  'Stock Transfer': 'Stock Transfer',
  'Material Issue': 'Material Issue',
  'Stock Adjustment': 'Stock Adjustment',
  'Stock Reconciliation': 'Stock Reconciliation',
  'Purchase Order': 'Purchase Order',
  'Purchase Receipt': 'Purchase Receipt',
  'Quality Inspection': 'Quality Inspection',
  'Purchase Bill': 'Purchase Bill',
  'Purchase Return': 'Purchase Return',
  'Payment Entry': 'Payment Entry',
}

const section = computed(() => SECTIONS.find((s) => s.key === props.section))

// The work each form belongs to, in the order the groups are shown. Icon
// tiles take the group's colour from the theme (green, navy, amber, grey),
// so they follow Settings. Full class names, so Tailwind keeps them.
const WORK = [
  { label: 'Buying', note: 'From order to supplier bill', tone: 'bg-brand-50 text-brand-700', doctypes: ['Purchase Order', 'Purchase Receipt', 'Quality Inspection', 'Purchase Bill', 'Purchase Return'] },
  { label: 'Moving stock', note: 'Between stores and wards', tone: 'bg-accent-50 text-accent-700', doctypes: ['Stock Indent', 'Stock Transfer', 'Material Issue'] },
  { label: 'Corrections', note: 'When the count is off', tone: 'bg-amber-50 text-amber-800', doctypes: ['Stock Adjustment', 'Stock Reconciliation'] },
  { label: 'Patient bills', note: 'At the billing counter', tone: 'bg-brand-50 text-brand-700', doctypes: ['Billing', 'Sales Return', 'Patient Advance'] },
  { label: 'Payments', note: 'To suppliers', tone: 'bg-accent-50 text-accent-700', doctypes: ['Payment Entry'] },
]
const RECORDS = { label: 'Records', note: 'Look up', tone: 'bg-gray-100 text-gray-700' }

// doctype -> { count, modified } (metta.api.get_masters_overview)
const info = reactive({})


const route = useRoute()
const router = useRouter()

// Desk URL of a doctype (its list, a record, or a new one).
const slug = (dt) => dt.toLowerCase().replace(/\s+/g, '-')
const deskUrl = (dt, name) => `/desk/${slug(dt)}/${encodeURIComponent(name)}`
// A form with real Desk logic and no Vue screen yet opens in Desk.
const isDeskOnly = (dt) => DESK_ONLY.has(dt) && !CUSTOM[dt]?.view

const groups = computed(() => {
  const items = section.value?.items || []
  const menuReady = formMenu.value.length > 0
  // A form this user can't open is left out (until the menu has loaded,
  // everything shows, so the page is never empty while it loads).
  const forms = [...new Map(items.filter((i) => i.kind === 'form').map((i) => [i.doctype, i])).values()].filter((i) => !menuReady || formInfo(i.doctype))
  const card = (g) => (i) => {
    const deskOnly = isDeskOnly(i.doctype)
    const canCreate = DAILY[i.doctype] && formInfo(i.doctype)?.can_create
    return {
      key: i.doctype,
      label: itemLabel(i),
      icon: itemIcon(i),
      group: g.label,
      tone: g.tone,
      count: info[i.doctype]?.count ?? null,
      deskOnly,
      create: canCreate && !deskOnly ? createRoute(i.doctype) : null,
      createHref: canCreate && deskOnly ? `/desk/${slug(i.doctype)}/new` : null,
    }
  }
  // Each form into its work group (in WORK order); anything else is a record.
  const placed = new Set(WORK.flatMap((w) => w.doctypes))
  return [
    ...WORK.map((w) => ({ ...w, tasks: forms.filter((i) => w.doctypes.includes(i.doctype)).map(card(w)) })),
    { ...RECORDS, tasks: forms.filter((i) => !placed.has(i.doctype)).map(card(RECORDS)) },
  ].filter((g) => g.tasks.length)
})

// Up to six cards fit in one row; more than that (Store) gets group tabs.
const MAX_IN_ROW = 6
const allCards = computed(() => groups.value.flatMap((g) => g.tasks))
const useGroupTabs = computed(() => allCards.value.length > MAX_IN_ROW)
// Full class names, so Tailwind keeps them in the build.
const CARD_COLS = {
  1: 'grid-cols-1 md:max-w-sm',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
}

// Picked group and form live in the address, so Back from a record comes
// back to the same list.
const activeGroup = computed(() => {
  const g = groups.value.find((x) => x.label === route.query.group)
  return (g || groups.value[0])?.label
})
const cards = computed(() => (useGroupTabs.value ? groups.value.find((g) => g.label === activeGroup.value)?.tasks || [] : allCards.value))
// Nothing is picked until a card is clicked (user, 2026-10-26) - no list
// shows on opening the page.
const selected = computed(() => (cards.value.some((t) => t.key === route.query.list) ? route.query.list : null))
const current = computed(() => cards.value.find((t) => t.key === selected.value) || null)

function pick(key) {
  router.replace({ query: { ...route.query, list: key } })
}
function pickGroup(label) {
  router.replace({ query: { ...route.query, group: label, list: undefined } })
}

const sectionForms = computed(() => [...new Set((section.value?.items || []).filter((i) => i.kind === 'form').map((i) => i.doctype))])

async function loadNumbers() {
  const forms = sectionForms.value
  if (!forms.length) return
  try {
    Object.assign(info, (await call('metta.api.get_masters_overview', { doctypes: forms })) || {})
  } catch {
    // counts are a help only - the rows still open the lists
  }
}

onMounted(() => {
  loadFormMenu()
  loadNumbers()
})
// Same page component for every section: reload when the section changes.
watch(() => props.section, loadNumbers)
</script>
