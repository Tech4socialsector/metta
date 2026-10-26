// Pharmacy & Stock: the sidebar sections and the generic engine open these
// Vue screens instead of Desk.
import { STOCK_DOCTYPES, listName, formName } from '@/data/stock/doctypes'

export default Object.fromEntries(
  STOCK_DOCTYPES.map((d) => [
    d.doctype,
    {
      list: { name: listName(d) },
      view: (name) => ({ name: formName(d), params: { name } }),
      create: { name: formName(d), params: { name: 'new' } },
    },
  ]),
)
