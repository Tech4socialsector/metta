<template>
  <AppLayout title="Reports">
    <p v-if="session.roles.length && !groups.length" class="text-sm text-gray-600">You don't have access to any reports.</p>
    <section v-for="g in groups" :key="g.name" class="flex flex-col gap-3">
      <SectionTitle :title="g.name" :icon="ICONS[g.name]" />
      <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <router-link
          v-for="r in g.reports"
          :key="r.key"
          :to="{ name: r.route }"
          class="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          {{ r.title }}
          <LucideIcon name="chevron-right" class="h-4 w-4 text-gray-400" />
        </router-link>
      </div>
    </section>
  </AppLayout>
</template>

<script setup>
import { computed } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { session, hasRole } from '@/data/session'
import { REPORTS, REPORT_GROUPS } from '@/data/reports/catalog'

const ICONS = { 'Collections & Accounts': 'wallet', GST: 'receipt', Purchase: 'shopping-cart', Stock: 'package', Laboratory: 'flask-conical' }

// Same role lists as each Desk page/report .json - a card is shown only to
// those roles (System Manager always), so nobody sees a link Desk would refuse.
const groups = computed(() =>
  REPORT_GROUPS.map((name) => ({ name, reports: REPORTS.filter((r) => r.group === name && hasRole(...r.roles)) })).filter((g) => g.reports.length),
)
</script>
