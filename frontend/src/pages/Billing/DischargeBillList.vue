<template>
  <AppLayout title="Discharge Bill">
    <template #actions>
      <router-link v-if="hasRole('Billing Staff')" :to="{ name: 'BillingDischargeBillForm', params: { name: 'new' } }" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">New Discharge Bill</router-link>
    </template>
    <DataList doctype="Discharge Bill" :tabs="TABS" :row-route="(r) => ({ name: 'BillingDischargeBillForm', params: { name: r.name } })" />
  </AppLayout>
</template>

<script setup>
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { hasRole } from '@/data/session'

const TABS = [
  { label: 'Draft', filters: [['docstatus', '=', 0]] },
  { label: 'Submitted', filters: [['docstatus', '=', 1]] },
  { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
  { label: 'All', filters: [] },
]
</script>
