<template>
  <AppLayout :title="doctype" :subtitle="drill.label" :back-to="drill.from === 'dashboard' ? { name: 'HospitalDashboard' } : { name: 'Home' }">
    <template #actions>
      <router-link v-if="info?.can_create && !drill.filters.length" :to="createRoute(doctype)" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">+ New {{ doctype }}</router-link>
    </template>
    <DataList :key="doctype" :doctype="doctype" :filters="drill.filters" :row-route="(r) => viewRoute(doctype, r.name)" />
  </AppLayout>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { loadFormMenu, formInfo, viewRoute, createRoute } from '@/data/formMenu'

const props = defineProps({ doctype: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const info = computed(() => formInfo(props.doctype))

// A dashboard card opens this list already filtered (?filters=[[f, op, v]]
// &label=...&from=dashboard): the filters stay fixed under the user's own,
// the card's name shows under the title and Back returns to the dashboard.
const drill = computed(() => {
  let filters = []
  try {
    filters = JSON.parse(route.query.filters || '[]')
  } catch {
    // a hand-edited URL - show the plain list
  }
  return { filters: Array.isArray(filters) ? filters : [], label: route.query.label || '', from: route.query.from || '' }
})

// A single (settings) doctype has no list - open its one record.
onMounted(async () => {
  await loadFormMenu()
  if (info.value?.issingle) router.replace({ name: 'DocForm', params: { doctype: props.doctype, name: props.doctype } })
})
</script>
