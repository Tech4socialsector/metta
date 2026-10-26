<template>
  <!-- One Desk workspace as tasks rather than a list of form names: what
  can be started, which lists to open, which reports to run. Only what this
  user may open is shown (metta.api.get_form_menu - Desk's read/create). -->
  <AppLayout v-if="section" :title="section.label">
    <section v-for="g in groups" :key="g.label" class="flex flex-col gap-3">
      <SubHeading :icon="g.icon">{{ g.label }}</SubHeading>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <!-- The card opens the list; "+ New" (only when this user may
        create one) starts a new document, so each form appears once. -->
        <div v-for="t in g.tasks" :key="t.key" class="flex items-center gap-2 rounded-xl border border-gray-200 bg-white pr-3 hover:border-brand-200 hover:bg-brand-50">
          <component
            :is="t.to ? 'router-link' : 'a'"
            v-bind="t.to ? { to: t.to } : { href: t.href }"
            class="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-sm font-medium text-gray-900"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" :class="tone">
              <LucideIcon :name="t.icon || g.icon" class="h-4 w-4" />
            </span>
            <span class="flex-1 truncate">{{ t.label }}</span>
          </component>
          <router-link v-if="t.create" :to="t.create" class="flex h-7 shrink-0 items-center gap-1 rounded-md border border-brand-200 bg-white px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-100" :aria-label="`New ${t.label}`">
            <LucideIcon name="plus" class="h-3.5 w-3.5" /> New
          </router-link>
          <LucideIcon v-else name="chevron-right" class="h-4 w-4 shrink-0 text-gray-400" />
        </div>
      </div>
    </section>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import SubHeading from '@/components/SubHeading.vue'
import { SECTIONS, itemTarget, itemLabel, itemIcon } from '@/data/sections'
import { formMenu, formInfo, loadFormMenu, createRoute } from '@/data/formMenu'

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

// Each area of the hospital has its own soft colour on the card icons, so
// staff can tell at a glance where they are (same groups as the sidebar).
// Full class names, so Tailwind keeps them in the build.
const TONES = {
  pharmacy: 'bg-violet-50 text-violet-700',
  purchase: 'bg-violet-50 text-violet-700',
  store: 'bg-violet-50 text-violet-700',
  warehouse: 'bg-violet-50 text-violet-700',
  billing: 'bg-amber-50 text-amber-700',
  accounts: 'bg-amber-50 text-amber-700',
  reports: 'bg-amber-50 text-amber-700',
  masters: 'bg-gray-100 text-gray-700',
}
const tone = computed(() => TONES[props.section] || 'bg-brand-50 text-brand-700')

onMounted(loadFormMenu)

const groups = computed(() => {
  const items = section.value?.items || []
  const menuReady = formMenu.value.length > 0
  // A form this user can't open is left out (until the menu has loaded,
  // everything shows, so the page is never empty while it loads).
  const forms = [...new Map(items.filter((i) => i.kind === 'form').map((i) => [i.doctype, i])).values()].filter((i) => !menuReady || formInfo(i.doctype))
  const pages = items.filter((i) => i.kind === 'page')
  // Tasks that aren't a form of their own go first; daily forms get "+ New"
  // on their list card instead. (No pharmacy dispense screen: the Billing
  // counter's submitted bill already reduces stock and the patient shows its
  // paid print - user, 2026-10-25.)
  const start = []
  const lists = forms.map((i) => ({
    key: i.doctype,
    label: itemLabel(i),
    icon: itemIcon(i),
    create: DAILY[i.doctype] && formInfo(i.doctype)?.can_create ? createRoute(i.doctype) : null,
    ...itemTarget(i),
  }))
  const reports = pages.map((i) => ({ key: i.page, label: itemLabel(i), icon: itemIcon(i), ...itemTarget(i) }))
  return [
    { label: 'Daily work', icon: 'zap', tasks: start },
    { label: 'Lists', icon: 'list', tasks: lists },
    { label: 'Reports', icon: 'chart-column', tasks: reports },
  ].filter((g) => g.tasks.length)
})
</script>
