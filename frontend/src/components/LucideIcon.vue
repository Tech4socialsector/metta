<template>
  <!-- viewBox is required, not cosmetic: the sprite's <symbol> elements
  (see lucideSprite.js) carry no viewBox of their own, just raw path data
  in Lucide's native 24x24 coordinate space - without one here, the
  browser has nothing to scale that path data against and it renders at
  literal pixel coordinates regardless of whatever size a caller's class
  actually requests.

  No explicit v-bind="$attrs" - this component has a single root element
  and doesn't opt out of inheritAttrs, so Vue already merges a caller's
  class (h-4 w-4, etc) onto this <svg> automatically; binding $attrs here
  too just applied the same class a second time. -->
  <svg v-if="ready" viewBox="0 0 24 24" class="lucide-icon">
    <use :href="`#${resolvedName}`" />
  </svg>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ensureLucideSpriteLoaded, hasLucideSymbol } from '@/data/lucideSprite'
import { toLucideIconName } from '@/data/legacyIconNames'

const props = defineProps({
  name: { type: String, required: true },
})

// ensureLucideSpriteLoaded() fetches the sprite once and injects its
// <symbol>s directly into the current document (see lucideSprite.js), so
// <use href="#name"> - a same-document fragment reference - resolves
// without a second network request or cross-origin <use> restrictions.
// Gating render on that injection (rather than referencing eagerly) avoids
// a flash of nothing-rendered before the symbols exist in the DOM.
const ready = ref(false)
onMounted(async () => {
  await ensureLucideSpriteLoaded()
  ready.value = true
})

// toLucideIconName() catches the ~45 Feather names Lucide renamed during
// its fork (still hardcoded here and there, or stored from before this
// switch). A name that's neither a valid Lucide symbol nor a known legacy
// alias (typo'd, removed, never existed) falls back to a plain circle
// rather than <use> silently rendering nothing, matching how FeatherIcon
// (the icon set this replaced) always renders *something*.
const resolvedName = computed(() => {
  const mapped = toLucideIconName(props.name)
  return ready.value && !hasLucideSymbol(mapped) ? 'circle' : mapped
})
</script>

<style scoped>
/* No width/height here - every caller sizes this via Tailwind classes on
the `class` prop (h-4 w-4, h-7 w-7, ...), the same way FeatherIcon (what
this replaced) works. A fixed width/height in a scoped style compiles to
a [data-v-hash] attribute selector, which outranks a plain utility class
on specificity regardless of source order - it was winning over every
size class callers passed in, silently locking every icon at 1em (16px)
no matter what size was actually requested. */
.lucide-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
