<template>
  <!-- Setup -> Masters as a set-up checklist (approved 2026-10-26): search
  with All / Need setup, then the masters in the order they must be set up,
  each step with its progress. No summary tiles; a count badge instead of a
  tick (user, 2026-10-26). A master the user can't open is left out;
  "+ New" only where they may create. -->
  <AppLayout title="Masters" subtitle="Set up once by the admin, in the order shown. Everything else in the hospital uses these.">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="relative w-full max-w-sm">
        <LucideIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input v-model="q" type="search" placeholder="Find a master, e.g. ward or item" aria-label="Find a master" class="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-[13.5px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      </div>
      <div class="inline-flex gap-0.5 rounded-xl border border-gray-200 bg-white p-1" role="group" aria-label="Show">
        <button v-for="f in FILTERS" :key="f.key" type="button" class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold" :class="filter === f.key ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-50'" :aria-pressed="filter === f.key" @click="filter = f.key">
          {{ f.label }}
          <span class="rounded-full px-1.5 text-xs" :class="filter === f.key ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'">{{ f.key === 'need' ? needCount : allCount }}</span>
        </button>
      </div>
    </div>

    <section v-for="s in steps" :key="s.title" class="flex flex-col gap-3 border-t border-gray-200 pt-5 first-of-type:border-0 first-of-type:pt-0">
      <div class="flex flex-wrap items-start gap-3">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold" :class="s.full ? 'bg-brand-700 text-white' : 'border-2 border-amber-300 bg-white text-amber-700'">
          <LucideIcon v-if="s.full" name="check" class="h-4 w-4" />
          <template v-else>{{ s.number }}</template>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-[18.5px] font-extrabold tracking-tight text-accent-900">Step {{ s.number }} · {{ s.title }}</h2>
          <p class="text-[13px] text-gray-500">{{ s.note }}</p>
        </div>
        <span class="whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-semibold" :class="s.full ? 'border-brand-100 bg-brand-50 text-brand-700' : 'border-amber-200 bg-amber-50 text-amber-800'">
          {{ s.setUp }} of {{ s.total }} set up
        </span>
      </div>

      <!-- Equal columns; every card in a row stretches to one height and its
      footer sits on the bottom edge, so cards line up across the row. -->
      <div class="grid auto-rows-fr grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <div
          v-for="m in s.masters"
          :key="m.doctype"
          class="relative flex min-h-[136px] flex-col rounded-2xl border bg-white transition hover:shadow-[0_6px_16px_rgb(var(--brand-700)/0.1)] motion-reduce:transition-none"
          :class="m.setUp ? 'border-gray-200 hover:border-brand-500' : 'border-dashed border-amber-300 hover:border-amber-400'"
        >
          <component :is="m.to ? 'router-link' : 'a'" v-bind="m.to ? { to: m.to } : { href: m.href }" class="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" :aria-label="m.label" />
          <div class="flex items-center gap-3 px-4 pb-2.5 pt-4">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <LucideIcon :name="m.icon" class="h-[22px] w-[22px]" />
            </span>
            <span class="min-w-0 flex-1 text-[15.5px] font-bold leading-snug text-accent-900">{{ m.label }}</span>
            <!-- In place of a tick: how much is there, or "Empty" in amber. -->
            <span class="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold tabular-nums" :class="m.setUp ? 'bg-gray-100 text-gray-700' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'">
              <template v-if="m.single">{{ m.setUp ? 'Saved' : 'Not saved' }}</template>
              <template v-else-if="m.count == null">…</template>
              <template v-else-if="m.count">{{ m.count.toLocaleString('en-IN') }} {{ m.count === 1 ? 'record' : 'records' }}</template>
              <template v-else>Empty</template>
            </span>
          </div>
          <!-- No description line (user, 2026-10-26) - only what must exist first. -->
          <div class="flex flex-1 flex-col px-4 pb-3.5">
            <span v-if="m.needs" class="text-[12.5px] text-gray-500">Needs: <b class="font-semibold text-accent-700">{{ m.needs }}</b></span>
          </div>
          <div class="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5 text-[12.5px] text-gray-500">
            <span>{{ m.modified ? `Updated ${formatDate(m.modified)}` : 'Not set up yet' }}</span>
            <router-link
              v-if="m.create"
              :to="m.create"
              class="relative z-10 rounded-md px-2 py-0.5 font-semibold"
              :class="m.setUp ? 'text-brand-700 hover:bg-brand-50' : 'bg-brand-700 text-white hover:bg-brand-800'"
              :aria-label="`New ${m.label}`"
            >+ New</router-link>
          </div>
        </div>
      </div>
    </section>

    <p v-if="!steps.length" class="rounded-2xl border border-dashed border-gray-300 bg-white p-7 text-center text-sm text-gray-500">
      {{ q ? `No master matches “${q}”.` : filter === 'need' ? 'Every master is set up.' : 'You have no masters to manage.' }}
    </p>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { itemTarget, itemLabel } from '@/data/sections'
import { formMenu, formInfo, loadFormMenu, createRoute } from '@/data/formMenu'

// The masters in the order they must be set up (later steps link to earlier
// ones), each with what it is for and which masters it needs first.
const STEPS = [
  { title: 'Hospital', note: 'Start here. Doctors, wards and registration use these.', masters: [
    // Icons picked to show what each master is (hospital, doctor, ID card...).
    ['Department', 'hospital', 'Hospital departments, e.g. General Medicine.'],
    ['Doctor Master', 'stethoscope', 'Doctors with their department, fees and timings.', 'Department'],
    ['Registration type Master', 'id-card', 'General / Emergency, new or revisit, with the fee.'],
    ['Ward Master', 'bed-double', 'Wards and their beds for admitted patients.'],
    ['Room Master', 'door-open', 'Rooms inside a ward.', 'Ward Master'],
  ] },
  { title: 'Items & medicines', note: 'Everything bought, stocked and billed.', masters: [
    ['Unit of Measure', 'ruler', 'Tablet, Strip, Bottle… stock is counted in these.'],
    ['Item Group', 'folder-tree', 'Top-level groups, e.g. Medicines, Consumables.'],
    ['Item Category', 'shapes', 'Categories inside a group.', 'Item Group'],
    ['Item Sub Category', 'list-tree', 'Finer split of a category.', 'Item Category'],
    ['Item Classification', 'shield-alert', 'Schedule H, narcotic and similar flags.'],
    ['HSN Master', 'receipt-text', 'HSN codes with their GST rate.'],
    ['Chemical Composition', 'flask-conical', 'Generic composition, e.g. Paracetamol 500 mg.'],
    ['Chemical Term', 'atom', 'Terms used in compositions.'],
    ['Item', 'pill', 'Medicines, consumables and services with their pack.', 'Item Group, Unit of Measure, HSN Master'],
  ] },
  { title: 'Stock & suppliers', note: 'Where stock is kept and who we buy from.', masters: [
    ['Warehouse', 'warehouse', 'Central Store, Pharmacy and ward stores.'],
    ['Supplier', 'truck', 'Suppliers for purchase orders and bills.'],
  ] },
  { title: 'Billing', note: 'What patients are charged.', masters: [
    ['Service Rate List', 'indian-rupee', 'Price of each service, with history.', 'Item'],
    ['Category Price Adjustment', 'badge-percent', 'Discount or increase by billing category.'],
    ['Corporate Customer', 'building', 'Companies billed on credit.'],
  ] },
  { title: 'Laboratory', note: 'Tests, samples and ranges for the lab.', masters: [
    ['Lab Sample Type', 'test-tube', 'Blood, urine… with tube colour and volume.'],
    ['Lab Test Template', 'microscope', 'Each test with its parameters and normal ranges.', 'Item, Lab Sample Type'],
    ['Lab Settings', 'settings-2', 'Pay-first, verification and report footer rules.'],
  ] },
]
const ALL_DOCTYPES = STEPS.flatMap((s) => s.masters.map((m) => m[0]))

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'need', label: 'Need setup' },
]
const q = ref('')
const filter = ref('all')
// doctype -> { count, single, modified, set_up } from metta.api.get_masters_overview
const info = reactive({})

// Masters this user may open (all of them until the menu has loaded, so the
// page is never empty while it loads), with their live numbers.
const visible = computed(() => {
  const menuReady = formMenu.value.length > 0
  return STEPS.map((s, i) => ({
    ...s,
    number: i + 1,
    masters: s.masters
      .filter(([dt]) => !menuReady || formInfo(dt))
      .map(([dt, icon, purpose, needs]) => {
        const item = { kind: 'form', doctype: dt }
        const d = info[dt] || {}
        return {
          doctype: dt,
          label: itemLabel(item),
          icon,
          purpose,
          needs,
          count: d.count ?? null,
          single: !!d.single,
          modified: d.modified,
          setUp: !!d.set_up,
          create: formInfo(dt)?.can_create ? createRoute(dt) : null,
          ...itemTarget(item),
        }
      }),
  }))
})

const allMasters = computed(() => visible.value.flatMap((s) => s.masters))
const allCount = computed(() => allMasters.value.length)
const needCount = computed(() => allMasters.value.filter((m) => !m.setUp).length)

// What is shown: search and the All / Need setup switch; progress counts
// the whole step, not just the cards left after filtering.
const steps = computed(() => {
  const term = q.value.trim().toLowerCase()
  return visible.value
    .map((s) => ({
      ...s,
      total: s.masters.length,
      setUp: s.masters.filter((m) => m.setUp).length,
      full: s.masters.length > 0 && s.masters.every((m) => m.setUp),
      masters: s.masters.filter(
        (m) =>
          (filter.value === 'all' || !m.setUp) &&
          (!term || m.label.toLowerCase().includes(term) || m.purpose.toLowerCase().includes(term) || s.title.toLowerCase().includes(term)),
      ),
    }))
    .filter((s) => s.masters.length)
})

function formatDate(v) {
  const d = new Date(String(v).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

onMounted(async () => {
  await loadFormMenu()
  try {
    Object.assign(info, (await call('metta.api.get_masters_overview', { doctypes: ALL_DOCTYPES })) || {})
  } catch {
    // numbers are a help only - the cards still open the lists
  }
})
</script>
