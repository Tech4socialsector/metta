<template>
  <!-- Delete is kept out of sight (user, 2026-10-27): it sits under the "⋯"
  menu, and even then it only runs after a clear warning, so a stray click
  never removes a record. -->
  <div class="relative">
    <button
      type="button"
      :class="BTN"
      aria-label="More actions"
      title="More actions"
      :aria-expanded="menu"
      :disabled="busy"
      @click="menu = !menu"
    >
      <LucideIcon name="ellipsis" class="h-4 w-4" />
    </button>
    <div v-if="menu" class="fixed inset-0 z-30" @click="menu = false" />
    <div v-if="menu" role="menu" class="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
      <button type="button" role="menuitem" class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50" @click="openAsk">
        <LucideIcon name="trash-2" class="h-4 w-4" /> Delete
      </button>
    </div>

    <AppDialog v-model="ask" :title="`Delete ${label}?`">
      <div class="flex gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700"><LucideIcon name="triangle-alert" class="h-5 w-5" /></span>
        <div class="flex flex-col gap-1.5 text-sm text-gray-700">
          <p><span class="font-semibold text-gray-900">{{ label }}</span> will be removed permanently.</p>
          <p>If it is already used in other records (for example a department set on doctors or visits), it will not be deleted and you'll see why.</p>
        </div>
      </div>
      <template #footer>
        <button type="button" class="h-9 rounded-lg border border-gray-300 px-4 text-sm font-semibold hover:bg-gray-50" @click="ask = false">Keep it</button>
        <button type="button" class="h-9 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800" @click="confirm">Yes, delete</button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import LucideIcon from '@/components/LucideIcon.vue'

defineProps({
  label: { type: String, required: true },
  busy: Boolean,
})
const emit = defineEmits(['delete'])

const BTN = 'flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60'
const menu = ref(false)
const ask = ref(false)

function openAsk() {
  menu.value = false
  ask.value = true
}
function confirm() {
  ask.value = false
  emit('delete')
}
</script>
