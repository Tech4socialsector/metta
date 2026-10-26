import { computed, reactive, ref, watch } from 'vue'
import { api, getValue, VISIT } from '@/data/api'
import { isAfterHours, istTimeNowStr, todayStr, flt, billingTotals } from '@/data/registrationRules'

// The OP Patient Visit rules from patient_visit.js, shared by the New
// registration screen (first visit) and the New OP visit screen (every
// visit after). One copy, so both screens always behave the same.
//
// getUhin: () => the patient's UHIN, or '' for a brand-new patient.
// getBillingCategory / getCompany: () => the visit's billing category and
// company (Desk fetches both from the patient, uhin_id.*).
export function useOpVisit({ getUhin, getBillingCategory, getCompany }) {
  function blank() {
    return {
      // Date default "Today"; Time from onload's ist_time_now_str().
      date: todayStr(),
      time: istTimeNowStr(),
      registration_type: '',
      department_name: '',
      doctor_name: '',
      fee_amount: 0,
      default_currency: 'INR',
      charity_percent: 0,
      adjustment_type: '',
      charity_amount: 0,
      payment_mode: '',
      corporate_customer: '',
    }
  }

  const visit = reactive(blank())
  const categoryAdjustment = ref(null)

  // suggest_registration_type: General or Emergency (after-hours cutoffs,
  // Emergency department, never downgraded once Emergency), × New Reg or
  // Revisit (has_prior_visit_of_type - a brand-new patient has none).
  let suggestSeq = 0
  async function suggestRegistrationType() {
    const alreadyEmergency = (visit.registration_type || '').startsWith('Emergency')
    const isEmergency = alreadyEmergency || visit.department_name === 'Emergency' || isAfterHours(visit.date, visit.time)
    const uhin = getUhin()
    let revisit = false
    const seq = ++suggestSeq
    if (uhin) {
      try {
        revisit = !!(await api(`${VISIT}.has_prior_visit_of_type`, { uhin_id: uhin, emergency: isEmergency ? 1 : 0 }))
      } catch {
        revisit = false
      }
    }
    // Only the latest call may write - an older, slower answer must not
    // overwrite a newer suggestion.
    if (seq !== suggestSeq) return
    visit.registration_type = `${isEmergency ? 'Emergency' : 'General'} ${revisit ? 'Revisit' : 'New Reg'}`
  }
  watch(() => [visit.date, visit.time], suggestRegistrationType)

  // department_name: re-suggest, clear doctor, auto-pick a lone doctor
  watch(
    () => visit.department_name,
    async (dept) => {
      suggestRegistrationType()
      if (visit.doctor_name) visit.doctor_name = ''
      if (!dept) return
      try {
        const doctors = (await api(`${VISIT}.get_doctors_by_department`, { department: dept })) || []
        if (doctors.length === 1) visit.doctor_name = doctors[0]
      } catch {
        // Doctor stays blank for Front Desk to pick.
      }
    },
  )

  // registration_type -> fee_amount (fetch_from registration_type.fee_amount)
  watch(
    () => visit.registration_type,
    async (type) => {
      if (!type) {
        visit.fee_amount = 0
        return
      }
      try {
        const r = await getValue('Registration type Master', type, 'fee_amount')
        visit.fee_amount = flt(r?.fee_amount)
      } catch {
        visit.fee_amount = 0
      }
    },
  )

  // Patient Visit billing_category handler. Called by the screen whenever
  // the visit's billing category changes.
  async function applyCategory(category) {
    if (category !== 'General' && visit.charity_amount) visit.charity_amount = 0
    if (!category) {
      categoryAdjustment.value = null
      visit.charity_percent = 0
      visit.adjustment_type = ''
      return null
    }
    try {
      const adj = (await api(`${VISIT}.get_category_adjustment`, { billing_category: category })) || null
      categoryAdjustment.value = adj
      visit.charity_percent = flt(adj?.charity_percent)
      visit.adjustment_type = adj?.adjustment_type || ''
      // charity_percent change -> sync_charity_amount_from_percent (General)
      if (category === 'General') visit.charity_amount = (flt(visit.fee_amount) * flt(visit.charity_percent)) / 100
      // Company patients normally go on their employer's credit account.
      if (getCompany() && !visit.payment_mode) visit.payment_mode = 'Credit - Corporate'
      return adj
    } catch {
      categoryAdjustment.value = null
      return null
    }
  }

  // sync_charity_amount_from_percent / sync_charity_percent_from_amount -
  // only for a General patient; other categories' percent is fixed.
  function onCharityPercentInput(value) {
    visit.charity_percent = value
    if (getBillingCategory() === 'General') visit.charity_amount = (flt(visit.fee_amount) * flt(value)) / 100
  }
  function onCharityAmountInput(value) {
    visit.charity_amount = value
    if (getBillingCategory() === 'General' && flt(visit.fee_amount)) visit.charity_percent = (flt(value) / flt(visit.fee_amount)) * 100
  }

  // calculate_billing_totals + update_charity_field_labels
  const totals = computed(() => billingTotals(visit, categoryAdjustment.value))
  const labels = computed(() =>
    totals.value.adjustmentType === 'Increase' ? { percent: 'TDS %', amount: 'TDS Amount' } : { percent: 'Charity %', amount: 'Charity Amount' },
  )

  // A hidden Payment Mode / Corporate Customer is cleared, never left to
  // block the save as a hidden mandatory field.
  watch(
    () => totals.value.net_amount,
    (net) => {
      if (net <= 0 && visit.payment_mode) visit.payment_mode = ''
    },
  )
  watch(
    () => visit.payment_mode,
    (mode) => {
      if (mode !== 'Credit - Corporate' && visit.corporate_customer) visit.corporate_customer = ''
      // On the employer's credit account the customer is the patient's own
      // company (Company Name) - filled in, still changeable, as in Desk.
      if (mode === 'Credit - Corporate' && !visit.corporate_customer && getCompany()) visit.corporate_customer = getCompany()
    },
  )

  // mandatory_depends_on
  const missing = computed(() => (visit.payment_mode === 'Credit - Corporate' && !visit.corporate_customer ? ['Corporate Customer'] : []))

  function payload() {
    return {
      ...visit,
      charity_percent: String(visit.charity_percent ?? ''),
      discount_amount: totals.value.discount_amount,
      net_amount: totals.value.net_amount,
    }
  }

  function reset() {
    Object.assign(visit, blank())
    categoryAdjustment.value = null
    suggestRegistrationType()
  }

  return { visit, totals, labels, missing, applyCategory, suggestRegistrationType, onCharityPercentInput, onCharityAmountInput, payload, reset }
}
