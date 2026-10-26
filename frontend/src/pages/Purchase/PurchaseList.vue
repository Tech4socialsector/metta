<template>
  <AppLayout :title="doctype">
    <template #actions>
      <router-link v-if="canCreate" :to="formRoute(doctype, 'new')" :class="BTN.primary">New {{ doctype }}</router-link>
    </template>
    <DataList :doctype="doctype" :tabs="TABS" :row-route="(r) => formRoute(doctype, r.name)" />
  </AppLayout>
</template>

<script setup>
// The list for each purchase doctype (Purchase Order, Receipt, Quality
// Inspection, Bill, Return) - Desk's list, with docstatus tabs.
import { onMounted, ref } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { getPerms } from '@/data/billing/docApi'
import { BTN, formRoute } from '@/data/purchase/ui'

const props = defineProps({ doctype: { type: String, required: true } })

// Drafts first: those still need someone to finish and submit them.
const TABS = [
  { label: 'Draft', filters: [['docstatus', '=', 0]] },
  { label: 'Submitted', filters: [['docstatus', '=', 1]] },
  { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
  { label: 'All', filters: [] },
]

// New only for roles with create on the doctype, as in Desk.
const canCreate = ref(false)
onMounted(async () => {
  canCreate.value = !!(await getPerms(props.doctype).catch(() => ({}))).create
})
</script>
