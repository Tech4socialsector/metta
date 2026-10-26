// Lucide ships 1862 icons as ~23MB of individual SVG modules - importing
// them by name (frappe-ui's own ~icons/lucide/* virtual-module mechanism)
// only works for names known statically at build time, not a name coming
// from arbitrary DB data (App Module Setting's icon field, etc). The sprite
// sheet is the same one Frappe's own Desk icon picker renders from
// (frappe.utils.icon() -> <use href="#icon-name">) - a single ~400KB SVG
// with one <symbol> per icon, fetched once and injected into the DOM so any
// icon name can be referenced by <use> without shipping its markup again.
let spriteEl = null
let loadPromise = null

export function ensureLucideSpriteLoaded() {
  // Every mounted LucideIcon calls this - sharing one in-flight promise
  // (rather than a "have I started yet" boolean) means a second/third
  // caller awaits the same fetch instead of seeing "already started" and
  // resolving immediately before the sprite actually lands in the DOM,
  // which left spriteEl null under hasLucideSymbol() for a while
  // (rendering the "unknown icon" circle fallback) even for icons that
  // were about to load correctly a moment later.
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        // import.meta.env.BASE_URL, not a literal /-rooted path - this
        // file physically lives wherever Vite's build.base resolves to
        // (/assets/metta/frontend/, set by frappeui()'s vite plugin - see
        // vite.config.js), not at the site root. A literal
        // '/lucide-sprite.svg' would hit the SPA's own catch-all route
        // instead of the real file, a bug CHW hit with its
        // service worker.
        const res = await fetch(`${import.meta.env.BASE_URL}lucide-sprite.svg`)
        const svgText = await res.text()
        const container = document.createElement('div')
        container.innerHTML = svgText
        const svg = container.querySelector('svg')
        if (svg) {
          svg.id = 'lucide-sprite'
          // The display:none lived on `container`, which never actually
          // enters the document - only `svg` (its child) gets appended
          // below, so that hiding never took effect and the sprite's own
          // intrinsic size rendered as ~150px of real, visible, scrollable
          // layout at the top of the page. Setting it directly on the
          // element that's actually inserted is what Frappe's own Desk
          // does for this same sprite pattern (see the injected
          // #all-symbols svg in frappe/public/js's icon helpers).
          svg.style.display = 'none'
          document.body.prepend(svg)
          spriteEl = svg
        }
      } catch (e) {
        loadPromise = null
        console.error('Failed to load Lucide icon sprite', e)
      }
    })()
  }
  return loadPromise
}

export function hasLucideSymbol(name) {
  return !!spriteEl?.querySelector(`symbol#${CSS.escape(name)}`)
}
