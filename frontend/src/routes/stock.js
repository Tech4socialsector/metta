// Pharmacy & Stock screens: a list and a form per doctype, e.g.
// /stock-indent and /stock-indent/:name ('new' for a new one).
import { STOCK_DOCTYPES, listName, formName } from '@/data/stock/doctypes'

export default STOCK_DOCTYPES.flatMap((d) => [
  {
    path: `/${d.path}`,
    name: listName(d),
    component: () => import('@/pages/Stock/StockListPage.vue'),
    props: () => ({ doctype: d.doctype }),
  },
  {
    path: `/${d.path}/:name`,
    name: formName(d),
    component: () => import('@/pages/Stock/StockFormPage.vue'),
    props: (route) => ({ doctype: d.doctype, name: route.params.name }),
  },
])
