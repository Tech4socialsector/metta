<template>
  <FrappeUIProvider>
    <!-- Keyed by the full address: going from one patient's New OP visit to
    another's re-creates the screen instead of keeping the old patient. -->
    <router-view v-slot="{ Component, route }">
      <component :is="Component" :key="route.fullPath" />
    </router-view>
  </FrappeUIProvider>
</template>

<script setup>
import { FrappeUIProvider } from 'frappe-ui'
import '@/data/session'
</script>
