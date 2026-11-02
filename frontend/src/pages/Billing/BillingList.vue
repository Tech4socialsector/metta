<template>
  <!-- /billing: the same waiting-to-pay view the Billing section shows under
  its Billing card (BillingQueue), for links that open the Billing list. -->
  <AppLayout title="Billing" subtitle="Doctor's orders waiting to be paid · today" fill>
    <template #actions>
      <router-link v-if="hasRole('Billing Staff')" :to="{ name: 'BillingForm', params: { name: 'new' } }" class="flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
        <LucideIcon name="plus" class="h-4 w-4" />New bill
      </router-link>
    </template>
    <BillingQueue />
  </AppLayout>
</template>

<script setup>
import AppLayout from '@/components/AppLayout.vue'
import BillingQueue from '@/components/BillingQueue.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { hasRole } from '@/data/session'
</script>
