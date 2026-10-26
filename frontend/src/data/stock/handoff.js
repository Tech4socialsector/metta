// Starting values for the next new form, handed over in memory - what
// Desk's frappe.new_doc(doctype, values) + add_child() does for "Create
// Return Transfer" and "Amend". Child rows can't travel in the address.
let pending = null

export function handOff(doctype, values, message = '') {
  pending = { doctype, values, message }
}

// Taken once: a reload of the new form starts clean, as in Desk.
export function takeHandOff(doctype) {
  if (!pending || pending.doctype !== doctype) return null
  const p = pending
  pending = null
  return p
}
