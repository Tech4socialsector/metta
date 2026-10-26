<template>
  <!-- Pattern from the Pathways app (MIT, Tech4socialsector): a solid brand
  bar with the app name and the user menu; the hospital logo (same as the
  CHW app) on a white tile so it reads on the brand colour. -->
  <header class="flex h-14 shrink-0 items-center gap-4 bg-brand-700 px-4 text-white">
    <router-link :to="{ name: 'Home' }" class="flex min-w-0 items-center gap-2.5">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white">
        <img :src="theme.logo || logo" alt="" class="h-full w-full object-contain" />
      </span>
      <span class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-lg font-bold tracking-tight">{{ theme.app_name }}</span>
        <span v-if="theme.hospital_name" class="truncate text-xs text-white/80">{{ theme.hospital_name }}</span>
      </span>
    </router-link>

    <div class="flex-1" />

    <div ref="menuRoot" class="relative">
      <button type="button" class="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10" :class="menuOpen && 'bg-white/10'" :aria-expanded="menuOpen" aria-haspopup="menu" @click="menuOpen = !menuOpen">
        <Avatar :label="session.full_name || session.user || '?'" size="md" />
        <span class="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{{ session.full_name || session.user }}</span>
        <LucideIcon name="chevron-down" class="h-4 w-4 text-white/80" />
      </button>
      <div v-if="menuOpen" role="menu" class="absolute right-0 top-10 z-40 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm text-gray-800 shadow-lg">
        <!-- Logo, names and colours: an admin task, so it lives here, not in the sidebar. -->
        <router-link v-if="hasRole('System Manager')" :to="{ name: 'Settings' }" role="menuitem" class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50" @click="menuOpen = false">
          <LucideIcon name="palette" class="h-4 w-4 text-gray-500" /> Settings
        </router-link>
        <a href="/desk" role="menuitem" class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
          <LucideIcon name="monitor" class="h-4 w-4 text-gray-500" /> Switch to Desk
        </a>
        <button type="button" role="menuitem" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50" @click="logoutResource.submit()">
          <LucideIcon name="log-out" class="h-4 w-4 text-gray-500" /> Log out
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Avatar } from 'frappe-ui'
import { session, logoutResource, hasRole } from '@/data/session'
import { theme } from '@/data/theme'

// Default logo (same file as the CHW app) when Settings has none uploaded.
const logo = `${import.meta.env.BASE_URL}logo-mark.png`

const menuOpen = ref(false)
const menuRoot = ref(null)

// Close the user menu on any click outside it.
function onDocClick(e) {
  if (menuOpen.value && menuRoot.value && !menuRoot.value.contains(e.target)) menuOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>
