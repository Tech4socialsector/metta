import { session } from '@/data/session'

// Where /hmis opens for each role (user, 2026-11-02): Admin and Management
// get the Hospital Dashboard, everyone else their own main screen. With two
// roles, the one higher in this list wins.
const LANDING = [
  { roles: ['Management'], to: { name: 'HospitalDashboard' } },
  { roles: ['Front Desk'], to: { name: 'Home' } },
  { roles: ['Doctor'], to: { name: 'DoctorDashboard' } },
  { roles: ['Nurse'], to: { name: 'NurseList' } },
  { roles: ['Lab Staff', 'Lab Verifier'], to: { name: 'LabWorklist' } },
  { roles: ['Billing Staff'], to: { name: 'SectionPage', params: { section: 'billing' } } },
  { roles: ['Pharmacy Staff'], to: { name: 'PharmacyHome' } },
  { roles: ['Store Staff', 'Purchase Approver'], to: { name: 'SectionPage', params: { section: 'store' } } },
  { roles: ['Warehouse Staffs'], to: { name: 'SectionPage', params: { section: 'warehouse' } } },
  { roles: ['Account Staff'], to: { name: 'SectionPage', params: { section: 'accounts' } } },
]

export function landingRoute() {
  // Admin (System Manager) passes every role check, so lands on the first entry.
  const admin = session.roles.includes('System Manager')
  const hit = LANDING.find((l) => admin || l.roles.some((r) => session.roles.includes(r)))
  return hit ? hit.to : { name: 'Home' }
}
