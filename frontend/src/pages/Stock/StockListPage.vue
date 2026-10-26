<template>
  <AppLayout :title="doctype" :back-to="{ name: 'Home' }">
    <template #actions>
      <router-link v-if="info?.can_create" :to="createRoute(doctype)" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">+ New {{ doctype }}</router-link>
    </template>
    <DataList :key="doctype" :doctype="doctype" :tabs="LIST_TABS[doctype] || []" :row-route="(r) => viewRoute(doctype, r.name)" />
  </AppLayout>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { loadFormMenu, formInfo, viewRoute, createRoute } from '@/data/formMenu'
import { LIST_TABS } from '@/data/stock/lists'

const props = defineProps({ doctype: { type: String, required: true } })
const info = computed(() => formInfo(props.doctype))

onMounted(loadFormMenu)
</script>
