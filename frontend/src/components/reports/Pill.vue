<template>
  <Badge v-if="label" :theme="THEME[color] || 'gray'" :label="label" />
</template>

<script setup>
import { Badge } from 'frappe-ui'

// Desk indicator-pill colours mapped onto frappe-ui Badge themes; each
// report passes the same colour its Desk page uses for that status.
defineProps({ label: { type: String, default: '' }, color: { type: String, default: 'gray' } })
const THEME = { red: 'red', orange: 'orange', yellow: 'orange', green: 'green', blue: 'blue', gray: 'gray', darkgrey: 'gray' }
</script>
