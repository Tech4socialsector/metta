<template>
  <Badge v-if="status" :theme="statusTheme(status)" :label="status" />
</template>

<script setup>
// Pattern from the Pathways app (MIT, Tech4socialsector): one frappe-ui
// Badge, coloured by what the status means.
import { Badge } from 'frappe-ui'
import { statusTheme } from '@/data/status'

defineProps({ status: { type: String, default: '' } })
</script>
