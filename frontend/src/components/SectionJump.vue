<template>
  <!-- Section chips: jump straight to a section instead of hunting through
  tabs or scrolling (only worth it with three or more sections). -->
  <nav v-if="sections.length >= 3" aria-label="Sections" class="flex flex-wrap gap-1.5">
    <button
      v-for="s in sections"
      :key="s.id"
      type="button"
      class="rounded-full border px-3 py-1 text-xs font-semibold"
      :class="active === s.id ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'"
      @click="go(s.id)"
    >
      {{ s.label }}
    </button>
  </nav>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'

const props = defineProps({
  // [{ id, label }] - id is the section element's id
  sections: { type: Array, default: () => [] },
})

const active = ref(props.sections[0]?.id || '')

function go(id) {
  active.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// The chip of the section nearest the top of the scroll area lights up
// while the user scrolls.
let observer = null
function observe() {
  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (top) active.value = top.target.id
    },
    { rootMargin: '0px 0px -65% 0px' },
  )
  for (const s of props.sections) {
    const el = document.getElementById(s.id)
    if (el) observer.observe(el)
  }
}
onMounted(() => nextTick(observe))
watch(() => props.sections.map((s) => s.id).join(), () => nextTick(observe))
onBeforeUnmount(() => observer?.disconnect())
</script>
