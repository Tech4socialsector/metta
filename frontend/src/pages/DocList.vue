<template>
  <AppLayout :title="doctype" :back-to="{ name: 'Home' }">
    <template #actions>
      <router-link v-if="info?.can_create" :to="createRoute(doctype)" class="flex h-9 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">+ New {{ doctype }}</router-link>
    </template>
    <DataList :key="doctype" :doctype="doctype" :row-route="(r) => viewRoute(doctype, r.name)" />
  </AppLayout>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import DataList from '@/components/DataList.vue'
import { loadFormMenu, formInfo, viewRoute, createRoute } from '@/data/formMenu'

const props = defineProps({ doctype: { type: String, required: true } })
const router = useRouter()
const info = computed(() => formInfo(props.doctype))

// A single (settings) doctype has no list - open its one record.
onMounted(async () => {
  await loadFormMenu()
  if (info.value?.issingle) router.replace({ name: 'DocForm', params: { doctype: props.doctype, name: props.doctype } })
})
</script>
