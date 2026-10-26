import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Optional date filter shared by Patients and Vitals Check. A page opens on
// "All" (no date limit); staff narrow it to Today / This week / This month
// or their own From - To range only when they want to (user, 2026-10-24).
// The choice lives in the URL (?period=&from=&to=), so Back keeps it.
export const PERIOD_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'range', label: 'Date range' },
]

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const nice = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

export function usePeriod() {
  const route = useRoute()
  const router = useRouter()
  const setQuery = (patch) => router.replace({ query: { ...route.query, ...patch } })

  const period = computed({
    get: () => (PERIOD_OPTIONS.some((p) => p.key === route.query.period) ? route.query.period : 'all'),
    set: (v) => setQuery({ period: v }),
  })
  const from = computed({ get: () => route.query.from || '', set: (v) => setQuery({ from: v || undefined }) })
  const to = computed({ get: () => route.query.to || '', set: (v) => setQuery({ to: v || undefined }) })

  // { from, to } as YYYY-MM-DD (either may be empty for an open range),
  // or null for "All". A week starts on Monday.
  const range = computed(() => {
    const today = new Date()
    if (period.value === 'today') return { from: ymd(today), to: ymd(today) }
    if (period.value === 'week') {
      const d = new Date()
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      return { from: ymd(d), to: ymd(today) }
    }
    if (period.value === 'month') {
      const d = new Date()
      d.setDate(1)
      return { from: ymd(d), to: ymd(today) }
    }
    if (period.value === 'range' && (from.value || to.value)) return { from: from.value, to: to.value }
    return null
  })

  // Words for the cards' small lines: "today", "this week", "12 Oct – 20 Oct", or "" for All.
  const word = computed(() => {
    const r = range.value
    if (!r) return ''
    if (period.value === 'today') return 'today'
    if (period.value === 'week') return 'this week'
    if (period.value === 'month') return 'this month'
    if (r.from && r.to) return `${nice(r.from)} – ${nice(r.to)}`
    return r.from ? `from ${nice(r.from)}` : `until ${nice(r.to)}`
  })

  return { period, from, to, range, word }
}

// Frappe filters limiting `field` to the range. Datetime fields get the
// whole first and last day.
export function rangeFilters(field, range, datetime = false) {
  if (!range) return []
  const out = []
  if (range.from) out.push([field, '>=', datetime ? `${range.from} 00:00:00` : range.from])
  if (range.to) out.push([field, '<=', datetime ? `${range.to} 23:59:59` : range.to])
  return out
}
