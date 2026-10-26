// Desk report pages rebuilt in Vue, keyed by their Desk page name
// (/desk/<page-name>) - the sidebar opens these instead of Desk. Script
// reports (no Desk page) are keyed by their catalog key so a sidebar
// p('collection-report', ...) / p('stock-ledger', ...) item can open them,
// and 'reports' opens the hub.
import { REPORTS } from '@/data/reports/catalog'

export default {
  reports: { name: 'ReportsHome' },
  ...Object.fromEntries(REPORTS.map((r) => [r.deskPage || r.key, { name: r.route }])),
}
