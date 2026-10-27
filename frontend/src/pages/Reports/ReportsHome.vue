<template>
  <AppLayout title="Reports">
    <p v-if="session.roles.length && !groups.length" class="text-sm text-gray-600">You don't have access to any reports.</p>
    <!-- Style A, same cards as the section pages (TaskCard); the hint line
    is the report's one line from the catalog. -->
    <section v-for="g in groups" :key="g.name" class="flex flex-col gap-2.5">
      <h2 class="text-[18px] font-extrabold tracking-tight text-gray-900">{{ g.name }}</h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <!-- Name only - no description line (user, 2026-10-26). -->
        <TaskCard v-for="r in g.reports" :key="r.key" :label="r.title" :icon="ICONS[g.name] || 'file-bar-chart'" tone="bg-accent-50 text-accent-700" :to="{ name: r.route }" />
      </div>
    </section>
  </AppLayout>
</template>

<script setup>
import { computed } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import TaskCard from '@/components/TaskCard.vue'
import { session, hasRole } from '@/data/session'
import { REPORTS, REPORT_GROUPS } from '@/data/reports/catalog'

const ICONS = { 'Collections & Accounts': 'wallet', Purchase: 'shopping-cart', Stock: 'package', Laboratory: 'flask-conical' }

// Same role lists as each Desk page/report .json - a card is shown only to
// those roles (System Manager always), so nobody sees a link Desk would refuse.
const groups = computed(() =>
  REPORT_GROUPS.map((name) => ({ name, reports: REPORTS.filter((r) => r.group === name && hasRole(...r.roles)) })).filter((g) => g.reports.length),
)
</script>
