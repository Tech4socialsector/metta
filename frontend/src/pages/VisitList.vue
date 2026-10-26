<template>
  <AppLayout title="Visits" subtitle="Every OP visit and IP admission">
    <DataList doctype="Patient Visit" :tabs="TABS" :row-route="(r) => ({ name: 'VisitView', params: { name: r.name } })" />
  </AppLayout>
</template>

<script setup>
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'

const TABS = [
  { label: 'All', filters: [] },
  { label: 'OP', filters: [['registration_category', '=', 'OP']] },
  { label: 'IP admitted', filters: [['registration_category', '=', 'IP'], ['admission_status', '=', 'Admitted']] },
]
</script>
