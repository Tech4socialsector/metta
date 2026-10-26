<template>
  <AppLayout title="Patient Advance">
    <template #actions>
      <router-link v-if="hasRole('Account Staff')" :to="{ name: 'BillingAdvanceForm', params: { name: 'new' } }" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">Collect Advance</router-link>
    </template>
    <DataList doctype="Patient Advance" :row-route="(r) => ({ name: 'BillingAdvanceForm', params: { name: r.name } })" />
  </AppLayout>
</template>

<script setup>
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { hasRole } from '@/data/session'
</script>
