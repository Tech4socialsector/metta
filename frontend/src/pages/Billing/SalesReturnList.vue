<template>
  <AppLayout title="Sales Return">
    <template #actions>
      <router-link v-if="canCreate" :to="{ name: 'BillingSalesReturnForm', params: { name: 'new' } }" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">New Return</router-link>
    </template>
    <DataList doctype="Sales Return" :tabs="TABS" :row-route="(r) => ({ name: 'BillingSalesReturnForm', params: { name: r.name } })" />
  </AppLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { getPerms } from '@/data/billing/docApi'

const TABS = [
  { label: 'Draft', filters: [['docstatus', '=', 0]] },
  { label: 'Submitted', filters: [['docstatus', '=', 1]] },
  { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
  { label: 'All', filters: [] },
]

// Only roles with create on Sales Return see New (System Manager today).
const canCreate = ref(false)
onMounted(async () => {
  canCreate.value = !!(await getPerms('Sales Return').catch(() => ({}))).create
})
</script>
