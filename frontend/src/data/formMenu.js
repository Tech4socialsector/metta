import { ref } from 'vue'
import { call } from 'frappe-ui'

// Forms the user may open (metta.api.get_form_menu), loaded once.
export const formMenu = ref([])
let loading = null

export function loadFormMenu() {
  if (!loading) {
    loading = call('metta.api.get_form_menu')
      .then((rows) => (formMenu.value = rows || []))
      .catch(() => (loading = null))
  }
  return loading
}

export function formInfo(doctype) {
  return formMenu.value.find((f) => f.doctype === doctype) || null
}

// Forms whose Desk client script has real logic get their own Vue screen;
// the generic engine hands over to it. Each module registers its screens in
// src/data/customScreens/<module>.js (default export: { Doctype: { list,
// view(name), create } }), merged here.
const BUILT_IN = {
  'Patient Registration': { list: { name: 'PatientList' }, view: (name) => ({ name: 'PatientView', params: { uhin: name } }), create: { name: 'Register' } },
  'Patient Visit': { list: { name: 'VisitList' }, view: (name) => ({ name: 'VisitView', params: { name } }), create: { name: 'Home' } },
  'Nurse Interventions': { list: { name: 'NurseList' }, view: (name) => ({ name: 'NurseForm', params: { name } }) },
  'Doctor Consultation': { view: (name) => ({ name: 'ConsultationForm', params: { name } }), create: { name: 'ConsultationForm', params: { name: 'new' } } },
}
const FROM_MODULES = Object.values(import.meta.glob('./customScreens/*.js', { eager: true })).reduce((all, m) => ({ ...all, ...(m.default || {}) }), {})
export const CUSTOM = { ...BUILT_IN, ...FROM_MODULES }

export function viewRoute(doctype, name) {
  return CUSTOM[doctype]?.view?.(name) || { name: 'DocForm', params: { doctype, name } }
}

export function createRoute(doctype) {
  return CUSTOM[doctype]?.create || { name: 'DocForm', params: { doctype, name: 'new' } }
}

export function listRoute(doctype) {
  return CUSTOM[doctype]?.list || { name: 'DocList', params: { doctype } }
}
