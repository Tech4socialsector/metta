// Icon for a Desk section heading on forms built from the doctype's layout
// (labels come from Desk, so we match words; first match wins).
const RULES = [
  [/patient|demograph|personal|basic/i, 'user-round'],
  [/address|location|village/i, 'map-pin'],
  [/contact|emergency|phone/i, 'phone'],
  [/vital|physical|examination/i, 'heart-pulse'],
  [/lab|test|investigation|sample|result/i, 'flask-conical'],
  [/medicine|prescription|drug|pharmacy/i, 'pill'],
  [/bed|ward|room|admission|\bip\b/i, 'bed-double'],
  [/consult|doctor|diagnos|clinical|department/i, 'stethoscope'],
  [/bill|payment|amount|fee|price|tax|gst|total|charge|advance|account/i, 'indian-rupee'],
  [/item|stock|batch|warehouse|store|quantity/i, 'package'],
  [/supplier|purchase|vendor/i, 'truck'],
  [/date|schedule|follow/i, 'calendar-days'],
  [/history/i, 'history'],
  [/note|remark|comment|summary/i, 'notebook-pen'],
  [/category|type|setting|detail/i, 'list-checks'],
]

export function sectionIcon(label) {
  return RULES.find(([re]) => re.test(label || ''))?.[1] || 'file-text'
}
