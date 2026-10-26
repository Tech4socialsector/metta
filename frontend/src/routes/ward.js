// IP / ward / front-desk extras: editing visits and patients, the bed
// board, Discharge Summary and Appointment.
export default [
  // Bed board: every ward/room and who is in each bed.
  {
    path: '/wards',
    name: 'WardBoard',
    component: () => import('@/pages/Ward/WardBoard.vue'),
  },
  {
    path: '/visits/:name/edit',
    name: 'WardVisitEdit',
    component: () => import('@/pages/Ward/VisitEdit.vue'),
    props: true,
  },
  {
    path: '/patients/:uhin/edit',
    name: 'WardPatientEdit',
    component: () => import('@/pages/Ward/PatientEdit.vue'),
    props: true,
  },
  {
    path: '/discharge-summaries',
    name: 'WardDischargeSummaryList',
    component: () => import('@/pages/Ward/DischargeSummaryList.vue'),
  },
  {
    path: '/discharge-summaries/:name',
    name: 'WardDischargeSummaryForm',
    component: () => import('@/pages/Ward/DischargeSummaryForm.vue'),
    props: true,
  },
  {
    path: '/appointments',
    name: 'WardAppointmentList',
    component: () => import('@/pages/Ward/AppointmentList.vue'),
  },
  {
    path: '/appointments/:name',
    name: 'WardAppointmentForm',
    component: () => import('@/pages/Ward/AppointmentForm.vue'),
    props: true,
  },
  {
    path: '/appointments/:name/check-in',
    name: 'WardAppointmentCheckIn',
    component: () => import('@/pages/Ward/AppointmentCheckIn.vue'),
    props: true,
  },
]
