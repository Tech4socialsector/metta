import { inject, provide } from 'vue'

// Every form uses Frappe Desk's control look by default (user, 2026-10-24:
// "in all the forms we can use the frappe default form view, on top of that
// any customization"): grey filled 32px boxes with no border that turn white
// with a soft ring on focus, and small muted labels. Read-only boxes stay
// lighter with muted text so staff can tell them from fields to fill.
// A screen that needs big touch-friendly boxes can opt out for everything
// inside it with useRoomyFields() - one call, no prop on every field.
// Pages that build their own <input>s use the same look through the .ctl
// classes in index.css.
const KEY = Symbol('roomyFields')

export function useRoomyFields() {
  provide(KEY, true)
}

export function fieldLook() {
  const roomy = inject(KEY, false)
  if (!roomy) {
    return {
      compact: true,
      label: 'text-[13px] text-gray-600',
      height: 'h-8',
      box: 'rounded-md border text-sm focus:outline-none',
      editable: 'border-transparent bg-gray-100 hover:bg-gray-200 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-brand-100',
      locked: 'border-transparent bg-gray-50 text-gray-600',
      invalid: 'border-red-400 bg-white focus:ring-2 focus:ring-red-100',
    }
  }
  return {
    compact: false,
    label: 'text-sm text-gray-800',
    height: 'h-11',
    box: 'rounded-lg border text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-600',
    editable: 'border-gray-300 bg-white',
    locked: 'border-gray-200 bg-gray-50 text-gray-700',
    invalid: 'border-red-400 bg-white',
  }
}
