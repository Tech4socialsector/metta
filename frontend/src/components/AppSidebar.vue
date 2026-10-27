<template>
  <!-- Pattern from the Pathways app (MIT, Tech4socialsector): icons only
  when collapsed (with a tooltip), labels when expanded; the choice is
  remembered on this browser. -->
  <nav aria-label="Main" class="flex h-full flex-col border-r border-gray-200 bg-white px-2 py-3 transition-all duration-200" :class="expanded ? 'w-60' : 'w-14'">
    <div class="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
      <!-- Four groups (Patient care / Pharmacy & Stores / Finance / Setup),
      each item once; a group shows only when the user has an item in it. -->
      <template v-for="(g, gi) in groups" :key="g.label">
        <p v-if="expanded" class="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500" :class="gi ? 'pt-3' : 'pt-0.5'">{{ g.label }}</p>
        <div v-else-if="gi" class="mx-2 my-2 border-t border-gray-200" />
        <component
          :is="item.to ? 'router-link' : 'a'"
          v-for="item in g.items"
          :key="item.label"
          v-bind="item.to ? { to: item.to } : { href: item.href }"
          :aria-label="expanded ? undefined : item.label"
          :title="expanded ? undefined : item.label"
          class="flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm"
          :class="isActive(item) ? 'bg-brand-50 font-semibold text-brand-800 ring-1 ring-brand-100' : 'font-medium text-gray-700 hover:bg-gray-100'"
        >
          <LucideIcon :name="item.icon" class="h-[18px] w-[18px] shrink-0" :class="isActive(item) ? 'text-brand-700' : 'text-gray-500'" />
          <span v-if="expanded" class="flex-1 truncate">{{ item.label }}</span>
        </component>
      </template>
    </div>
    <div class="border-t border-gray-200 pt-2">
      <button type="button" class="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-gray-700 hover:bg-gray-100" :title="expanded ? undefined : 'Expand'" @click="expanded = !expanded">
        <LucideIcon :name="expanded ? 'chevron-left' : 'chevron-right'" class="h-4 w-4 shrink-0" />
        <span v-if="expanded">Collapse</span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { hasRole } from '@/data/session'
import { SECTIONS } from '@/data/sections'
import { REPORTS } from '@/data/reports/catalog'

// All reports live in one place (user, 2026-10-25). The menu item shows to
// anyone allowed at least one report; the Reports page then lists only the
// reports their roles may open. Stays lit inside any report (Reports* routes).
const REPORTS_ITEM = {
  label: 'Reports',
  to: { name: 'ReportsHome' },
  roles: [...new Set(REPORTS.flatMap((r) => r.roles))],
  matchPrefix: 'Reports',
  icon: 'chart-column',
}

const route = useRoute()
const KEY = 'hmis-sidebar'

function readExpanded() {
  try {
    return localStorage.getItem(KEY) !== 'collapsed'
  } catch {
    return true
  }
}
const expanded = ref(readExpanded())
watch(expanded, (v) => {
  try {
    localStorage.setItem(KEY, v ? 'expanded' : 'collapsed')
  } catch {
    // private browsing etc. - just not remembered
  }
})

// Same roles as the Desk workspaces, in four groups. Icons stay grey; the
// active item gets a light brand tint with brand text and icon.
const section = (key) => {
  const s = SECTIONS.find((x) => x.key === key)
  return s && { label: s.label, to: { name: 'SectionPage', params: { section: s.key } }, roles: s.roles, section: s.key, icon: s.icon }
}
// A section that has its own home screen (Pharmacy, Masters): same label,
// roles and icon, but opens that screen and stays lit on its sub-pages.
const home = (key, routeName, match = []) => {
  const s = SECTIONS.find((x) => x.key === key)
  return s && { label: s.label, to: { name: routeName }, roles: s.roles, match: [routeName, ...match], icon: s.icon }
}
const GROUPS = [
  {
    label: 'Patient care',
    items: [
      { label: 'Front Desk', to: { name: 'Home' }, roles: ['Front Desk'], match: ['Home', 'Register'], icon: 'clipboard-list' },
      // Patients and Visits share one page (cards for registered / OP / IP / new).
      { label: 'Patients', to: { name: 'PatientList' }, roles: ['Front Desk', 'Doctor', 'Nurse', 'Pharmacy Staff', 'Billing Staff'], match: ['PatientList', 'PatientView', 'NewVisit', 'WardPatientEdit', 'VisitView', 'AdmitPatient', 'WardVisitEdit'], icon: 'users' },
      { label: 'Vitals Check', to: { name: 'NurseList' }, roles: ['Nurse', 'Doctor', 'Front Desk'], match: ['NurseList', 'NurseForm'], icon: 'heart-pulse' },
      { label: 'Doctor', to: { name: 'DoctorDashboard' }, roles: ['Doctor'], match: ['DoctorDashboard', 'ConsultationForm'], icon: 'stethoscope' },
      { label: 'Lab', to: { name: 'LabWorklist' }, roles: ['Lab Staff', 'Lab Verifier'], match: ['LabWorklist', 'LabTest'], icon: 'flask-conical' },
      { label: 'Wards', to: { name: 'WardBoard' }, roles: ['Nurse', 'Doctor', 'Front Desk'], match: ['WardBoard'], icon: 'bed-double' },
    ],
  },
  { label: 'Pharmacy & Stores', items: [home('pharmacy', 'PharmacyHome', ['StockLookup']), section('store'), section('warehouse')] },
  { label: 'Finance', items: [section('billing'), section('accounts'), REPORTS_ITEM] },
  { label: 'Setup', items: [home('masters', 'MastersHome')] },
]
const groups = computed(() =>
  GROUPS.map((g) => ({ label: g.label, items: g.items.filter((item) => item && hasRole(...item.roles)) })).filter((g) => g.items.length),
)

function isActive(item) {
  if (item.section) return route.name === 'SectionPage' && route.params.section === item.section
  if (item.matchPrefix && String(route.name || '').startsWith(item.matchPrefix)) return true
  return (item.match || []).includes(route.name)
}
</script>
