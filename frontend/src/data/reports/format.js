import { flt, todayStr } from '@/data/registrationRules'

export { flt, todayStr }

// Desk's format_currency, as the report pages and their exports show it.
export function money(v) {
  return `₹ ${flt(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Plain numbers print the way Desk's flt() prints them (no forced decimals).
export function num(v) {
  return String(flt(v))
}

export function pct1(part, whole) {
  return `${(flt(whole) ? (100 * flt(part)) / flt(whole) : 0).toFixed(1)}%`
}

// Every Desk report page shows dates as dd/mm/yy regardless of the user's
// own date format setting; read straight from the string so the browser's
// timezone can't shift the day.
export function ddmmyy(value) {
  if (!value) return ''
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1].slice(-2)}`
}

// ---- date arithmetic on 'YYYY-MM-DD' strings (UTC maths, no DST drift) ----
function parse(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function fmt(d) {
  return d.toISOString().slice(0, 10)
}
export function addDays(s, n) {
  const d = parse(s)
  d.setUTCDate(d.getUTCDate() + n)
  return fmt(d)
}
export function addMonths(s, n) {
  const d = parse(s)
  d.setUTCMonth(d.getUTCMonth() + n)
  return fmt(d)
}
export function monthStart(s = todayStr()) {
  return `${s.slice(0, 7)}-01`
}
export function monthEnd(s = todayStr()) {
  return addDays(addMonths(monthStart(s), 1), -1)
}
// frappe.datetime.week_start/week_end follow moment's default locale, where
// the week runs Sunday to Saturday.
export function weekStart(s = todayStr()) {
  return addDays(s, -parse(s).getUTCDay())
}
export function weekEnd(s = todayStr()) {
  return addDays(weekStart(s), 6)
}

// The quick-range buttons the Desk pages offer, by key.
export const QUICK_RANGES = {
  today: { label: 'Today', range: () => [todayStr(), todayStr()] },
  yesterday: { label: 'Yesterday', range: () => [addDays(todayStr(), -1), addDays(todayStr(), -1)] },
  week: { label: 'This Week', range: () => [weekStart(), weekEnd()] },
  month: { label: 'This Month', range: () => [monthStart(), monthEnd()] },
  last_month: { label: 'Last Month', range: () => [addMonths(monthStart(), -1), addDays(monthStart(), -1)] },
  last_30: { label: 'Last 30 Days', range: () => [addDays(todayStr(), -30), todayStr()] },
  last_90: { label: 'Last 90 Days', range: () => [addDays(todayStr(), -90), todayStr()] },
}

// "From Date: 01/10/26   |   To Date: ..." - the subtitle line every Desk
// export carries; empty values are left out.
export function filterLine(pairs) {
  return pairs
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('   |   ')
}

// An export cell as text, the way Desk's get_export_data writes it.
export function cellText(v) {
  return v === null || v === undefined ? '' : String(v)
}
