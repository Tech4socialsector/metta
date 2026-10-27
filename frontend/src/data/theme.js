import { reactive } from 'vue'
import { api } from '@/data/api'

// The hospital's look, set on the Settings screen: logo, names and the two
// theme colours. Every screen's brand-* / accent-* classes read CSS
// variables (index.css), so changing them here recolours the whole app at
// once - no rebuild. Empty values fall back to the built-in look.
export const DEFAULT_THEME = {
  app_name: 'LCH HMIS',
  hospital_name: '',
  logo: '',
  // The CHW app's colours (chw/frontend/tailwind.config.js), so both apps of
  // the hospital look like one family. Main is CHW's banner green (its Home
  // banner, forest-700) for bars and headings; navy from the logo's cross is
  // only the small accent (user, 2026-10-26: "don't need navy everywhere").
  brand_color: '#245535',
  accent_color: '#2E4B85',
}

// Hand-made scales for the CHW colours, copied from the CHW app. Generated
// shades keep the colour's saturation, which turns a deep navy into bright
// royal blue in the middle steps - these keep it a soft navy throughout.
// brand-700 (top bar, buttons) is CHW's navy-900, the colour of its buttons.
// brand-700 (bars, buttons) and accent-500 (tags) land on the picked colour.
const CHW_FOREST = ['#eef6f0', '#d6eadb', '#aed4b8', '#7fb990', '#529a68', '#367d4d', '#2b6a3f', '#245535', '#1d4429', '#15321f']
const CHW_NAVY = ['#eef2f9', '#d9e1f0', '#b3c2e0', '#7f97c6', '#4d6ca6', '#2e4b85', '#1f3769', '#152a54', '#0c1e40', '#031530']
const FIXED_SCALES = {
  brand: {
    '#245535': CHW_FOREST,
    '#031530': ['#eef2f9', '#d9e1f0', '#b3c2e0', '#7f97c6', '#4d6ca6', '#2e4b85', '#1f3769', '#031530', '#021026', '#010b1c'],
  },
  accent: {
    '#2e4b85': CHW_NAVY,
    '#367d4d': CHW_FOREST,
  },
}
const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

// What the screens show right now (the saved theme, or a preview while
// someone is choosing colours on Settings).
export const theme = reactive({ ...DEFAULT_THEME })

const CACHE_KEY = 'hmis-theme'
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

// Shades keep the colour's hue and saturation and only change lightness, so
// the light bands stay a clear tint of the colour (mixing with white turned
// them grey). The brand base is its 700 shade (top bar, buttons); the accent
// base is its 500 shade (tags) - the same anchors index.css uses.
// Light shades: fixed lightness %. Dark shades: a share of the base lightness.
const BRAND_L = [97, 93, 86, 74, 60, 47, 38, null, 0.82, 0.68]
const ACCENT_L = [97, 93, 85, 74, 63, null, 0.86, 0.72, 0.6, 0.5]

function toHsl(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

function toRgb(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255))
}

// The same colour at another lightness - each step from its own lightness
// (delta in % points, or a factor below 1 for darker), capped at maxL.
export function relightened(hex, change, maxL = 100) {
  const [h, s, l] = toHsl(hex)
  const target = change < 1 && change > 0 ? l * change : l + change
  return toRgb(h, s, Math.max(0, Math.min(maxL, target)))
}

export function shades(hex, which = 'brand') {
  const fixed = FIXED_SCALES[which]?.[hex.toLowerCase()]
  if (fixed) return STEPS.map((step, i) => ({ step, rgb: hexRgb(fixed[i]) }))
  const [h, s, base] = toHsl(hex)
  const table = which === 'brand' ? BRAND_L : ACCENT_L
  return STEPS.map((step, i) => {
    const t = table[i]
    if (t === null) return { step, rgb: toRgb(h, s, base) }
    // Very light tints get a little less saturation so they stay calm.
    const light = t > 1
    return { step, rgb: toRgb(h, light && t >= 90 ? Math.min(s, 70) : s, light ? Math.max(t, base) : base * t) }
  })
}

const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '')

// Put a theme on screen: CSS variables for both colour scales, plus the
// browser tab title.
export function applyTheme(values) {
  const t = { ...DEFAULT_THEME, ...Object.fromEntries(Object.entries(values || {}).filter(([, v]) => v)) }
  Object.assign(theme, t)
  const root = document.documentElement.style
  for (const [name, key] of [['brand', 'brand_color'], ['accent', 'accent_color']]) {
    const hex = isHex(t[key]) ? t[key] : DEFAULT_THEME[key]
    for (const { step, rgb } of shades(hex, name)) root.setProperty(`--${name}-${step}`, rgb.join(' '))
  }
  document.title = t.app_name
}

// Called once at start-up: show the last known theme straight away (no
// flash of the default colours), then refresh it from the server.
export async function loadTheme() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (cached) applyTheme(cached)
  } catch {
    // no storage (private window) - the server copy below still applies
  }
  try {
    const saved = await api('metta.api.get_hmis_theme')
    applyTheme(saved)
    remember(saved)
  } catch {
    // offline or server error - keep whatever is on screen
  }
}

export async function saveTheme(values) {
  const saved = await api('metta.api.save_hmis_theme', { theme: values })
  applyTheme(saved)
  remember(saved)
  return saved
}

function remember(values) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(values))
  } catch {
    // not remembered on this browser - harmless
  }
}
