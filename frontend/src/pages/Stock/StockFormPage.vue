<template>
  <!-- keyed by doctype: another stock form opening here starts fresh -->
  <StockForm :key="doctype" :doctype="doctype" :name="name" />
</template>

<script setup>
import StockForm from '@/components/stock/StockForm.vue'

defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
</script>
