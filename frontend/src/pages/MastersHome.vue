<template>
  <!-- Setup -> Masters home (approved mock, 2026-10-25): the admin's set-up
  records as tiles in four groups, with a record count and "+ New". A
  master the user can't open is left out; "+ New" only where they may create. -->
  <AppLayout title="Masters" subtitle="Set up once by the admin — everyone else uses these">
    <template #actions>
      <div class="relative w-72">
        <LucideIcon name="search" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input v-model="q" type="search" placeholder="Find a master, e.g. ward" aria-label="Find a master" class="ctl pl-8" />
      </div>
    </template>

    <section v-for="g in groups" :key="g.label" class="flex flex-col gap-3">
      <SubHeading :icon="g.icon">{{ g.label }}</SubHeading>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <div v-for="t in g.tiles" :key="t.doctype" class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-brand-300">
          <component :is="t.to ? 'router-link' : 'a'" v-bind="t.to ? { to: t.to } : { href: t.href }" class="flex min-w-0 flex-1 items-center gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <LucideIcon :name="t.icon" class="h-[18px] w-[18px]" />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-gray-900">{{ t.label }}</span>
              <span class="block text-xs text-gray-600">{{ counts[t.doctype] == null ? '…' : `${Number(counts[t.doctype]).toLocaleString('en-IN')} records` }}</span>
            </span>
          </component>
          <router-link v-if="t.create" :to="t.create" class="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">+ New</router-link>
        </div>
      </div>
    </section>
    <p v-if="!groups.length" class="text-sm text-gray-600">{{ q ? `No master matches “${q}”.` : 'You have no masters to manage.' }}</p>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import SubHeading from '@/components/SubHeading.vue'
import { itemTarget, itemLabel, itemIcon } from '@/data/sections'
import { formMenu, formInfo, loadFormMenu, createRoute } from '@/data/formMenu'

// Same masters as the Desk "Masters" workspace, grouped by area.
const GROUPS = [
  { label: 'Hospital', icon: 'building-2', doctypes: ['Department', 'Doctor Master', 'Registration type Master', 'Ward Master', 'Room Master'] },
  { label: 'Billing', icon: 'receipt-text', doctypes: ['Category Price Adjustment', 'Corporate Customer', 'Service Rate List'] },
  { label: 'Items & medicines', icon: 'pill', doctypes: ['Item', 'Item Group', 'Item Category', 'Item Sub Category', 'Item Classification', 'HSN Master', 'Chemical Composition', 'Chemical Term', 'Unit of Measure'] },
  { label: 'Stock & suppliers', icon: 'package', doctypes: ['Warehouse', 'Supplier'] },
  { label: 'Laboratory', icon: 'flask-conical', doctypes: ['Lab Test Template', 'Lab Sample Type', 'Lab Settings'] },
]

const q = ref('')
const counts = reactive({})

const groups = computed(() => {
  const menuReady = formMenu.value.length > 0
  const term = q.value.trim().toLowerCase()
  return GROUPS.map((g) => ({
    ...g,
    tiles: g.doctypes
      // Until the menu has loaded everything shows, so the page is never empty.
      .filter((dt) => !menuReady || formInfo(dt))
      .map((dt) => {
        const item = { kind: 'form', doctype: dt }
        return { doctype: dt, label: itemLabel(item), icon: itemIcon(item), create: formInfo(dt)?.can_create ? createRoute(dt) : null, ...itemTarget(item) }
      })
      .filter((t) => !term || t.label.toLowerCase().includes(term) || g.label.toLowerCase().includes(term)),
  })).filter((g) => g.tiles.length)
})

// Record counts, permission-aware (same call the lists use); a master the
// user can't count just shows no number.
onMounted(async () => {
  await loadFormMenu()
  await Promise.all(
    GROUPS.flatMap((g) => g.doctypes).map(async (dt) => {
      try {
        counts[dt] = await call('frappe.desk.reportview.get_count', { doctype: dt })
      } catch {
        counts[dt] = null
      }
    }),
  )
})
</script>
