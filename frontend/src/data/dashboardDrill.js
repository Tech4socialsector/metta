// Hospital Dashboard drill-downs: a card opens the in-app list (DocList)
// with the card's filters; a row there opens the record's own screen.
//
// filters: { field: value | [operator, value] } - the same shape the Desk
// Hospital Overview used for its list links; empty values are skipped.
const OPS = new Set(['=', '!=', '>', '<', '>=', '<=', 'in', 'not in', 'like', 'between', 'is'])

export function drillRoute(doctype, filters, label) {
  const list = []
  for (const [field, val] of Object.entries(filters || {})) {
    if (val === undefined || val === null || val === '') continue
    if (Array.isArray(val) && val.length === 2 && OPS.has(val[0])) list.push([field, val[0], val[1]])
    else list.push([field, '=', val])
  }
  return { name: 'DocList', params: { doctype }, query: { filters: JSON.stringify(list), label, from: 'dashboard' } }
}
