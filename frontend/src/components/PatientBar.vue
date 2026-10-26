<template>
  <!-- Slim patient bar on every patient form (Bahmni's patient banner): who
  this record is for, without scrolling back up. -->
  <section class="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm">
    <span class="flex items-center gap-2 text-[15px] font-bold text-gray-900">
      <LucideIcon name="user-round" class="h-4 w-4 text-accent-500" />{{ name || '—' }}
    </span>
    <span v-if="ageGender" class="text-gray-600"><b class="font-semibold text-gray-900">{{ ageGender }}</b></span>
    <span v-if="uhin" class="text-gray-600">UHIN <b class="font-mono font-semibold text-gray-900">{{ uhin }}</b></span>
    <span v-if="visit" class="text-gray-600">{{ visitLabel }} <router-link :to="{ name: 'VisitView', params: { name: visit } }" class="font-mono font-semibold text-brand-700 hover:underline">{{ visit }}</router-link></span>
    <span v-if="doctor" class="text-gray-600">{{ doctor }}</span>
    <slot />
    <router-link v-if="uhin" :to="{ name: 'PatientView', params: { uhin } }" class="ml-auto font-semibold text-brand-700 hover:underline">View patient</router-link>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'

const props = defineProps({
  name: { type: String, default: '' },
  age: { type: [String, Number], default: null },
  gender: { type: String, default: '' },
  uhin: { type: String, default: '' },
  visit: { type: String, default: '' },
  doctor: { type: String, default: '' },
})

const ageGender = computed(() => [props.age != null && props.age !== '' ? `${props.age} y` : '', props.gender].filter(Boolean).join(' · '))
// IP-2026-… / OP-2026-… tell which kind of visit it is.
const visitLabel = computed(() => (String(props.visit).startsWith('IP') ? 'IP' : 'OP'))
</script>
