<template>
  <AppLayout title="Discharge Summaries">
    <template #actions>
      <router-link v-if="canCreate" :to="{ name: 'WardDischargeSummaryForm', params: { name: 'new' } }" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">+ New discharge summary</router-link>
    </template>
    <DataList doctype="Discharge Summary" :row-route="(r) => ({ name: 'WardDischargeSummaryForm', params: { name: r.name } })" />
  </AppLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { call } from 'frappe-ui'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'

const canCreate = ref(false)
onMounted(async () => {
  try {
    canCreate.value = !!(await call('metta.api.get_doc_permissions', { doctype: 'Discharge Summary' }))?.create
  } catch {
    canCreate.value = false
  }
})
</script>
