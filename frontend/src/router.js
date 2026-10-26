import { createRouter, createWebHistory, START_LOCATION } from 'vue-router'
import { session, initialUserCheck } from '@/data/session'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/Login.vue'),
  },
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/pages/Home.vue'),
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/pages/Register.vue'),
  },
  {
    path: '/patients',
    name: 'PatientList',
    component: () => import('@/pages/PatientList.vue'),
  },
  {
    path: '/patients/:uhin',
    name: 'PatientView',
    component: () => import('@/pages/PatientView.vue'),
    props: true,
  },
  // Visits now live on the Patients page (OP visits / In-patients cards);
  // the old address and every "back to visits" link land there.
  {
    path: '/visits',
    name: 'VisitList',
    redirect: { name: 'PatientList', query: { view: 'op' } },
  },
  {
    path: '/visits/:name/admit',
    name: 'AdmitPatient',
    component: () => import('@/pages/AdmitPatient.vue'),
    props: true,
  },
  {
    path: '/visits/:name',
    name: 'VisitView',
    component: () => import('@/pages/VisitView.vue'),
    props: true,
  },
  {
    path: '/nurse',
    name: 'NurseList',
    component: () => import('@/pages/NurseList.vue'),
  },
  {
    path: '/nurse/:name',
    name: 'NurseForm',
    component: () => import('@/pages/NurseForm.vue'),
    props: true,
  },
  {
    path: '/doctor',
    name: 'DoctorDashboard',
    component: () => import('@/pages/DoctorDashboard.vue'),
  },
  {
    path: '/consultation/:name',
    name: 'ConsultationForm',
    component: () => import('@/pages/ConsultationForm.vue'),
    props: true,
  },
  {
    path: '/section/:section',
    name: 'SectionPage',
    component: () => import('@/pages/SectionPage.vue'),
    props: true,
  },
  // Logo, names and the two theme colours (System Manager saves).
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/pages/Settings.vue'),
  },
  // Generic form engine: any Desk form, from its own definition.
  {
    path: '/app/:doctype',
    name: 'DocList',
    component: () => import('@/pages/DocList.vue'),
    props: true,
  },
  {
    path: '/app/:doctype/:name',
    name: 'DocForm',
    component: () => import('@/pages/DocForm.vue'),
    props: true,
  },
  // Returning patient: registration happens once, every later visit is here.
  {
    path: '/visit/new/:uhin',
    name: 'NewVisit',
    component: () => import('@/pages/NewVisit.vue'),
    props: true,
  },
]

// Each module keeps its own routes in src/routes/<module>.js (default
// export: an array of routes), so modules can be added without editing
// this file.
const moduleRoutes = Object.values(import.meta.glob('./routes/*.js', { eager: true })).flatMap((m) => m.default || [])

const router = createRouter({
  history: createWebHistory('/hmis'),
  routes: [...routes, ...moduleRoutes],
})

router.beforeEach(async (to, from, next) => {
  // On the very first navigation the logged-in user isn't known yet - wait
  // for that check, otherwise a real session would be bounced to /login.
  if (from === START_LOCATION) {
    await initialUserCheck.catch(() => {})
  }

  if (to.name !== 'Login' && !session.user) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }
  if (to.name === 'Login' && session.user) {
    next({ name: 'Home' })
    return
  }
  next()
})

export default router
