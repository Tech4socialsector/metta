// Doctypes whose Desk script has real logic, opened in their own Vue screens.
export default {
  'Discharge Summary': {
    list: { name: 'WardDischargeSummaryList' },
    view: (name) => ({ name: 'WardDischargeSummaryForm', params: { name } }),
    create: { name: 'WardDischargeSummaryForm', params: { name: 'new' } },
  },
  Appointment: {
    list: { name: 'WardAppointmentList' },
    view: (name) => ({ name: 'WardAppointmentForm', params: { name } }),
    create: { name: 'WardAppointmentForm', params: { name: 'new' } },
  },
}
