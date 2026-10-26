// Lab module: worklist of Diagnostic Tests and the single-test screen
// ('/lab/new' opens a blank test, as Desk's "New" does).
export default [
  {
    path: '/lab',
    name: 'LabWorklist',
    component: () => import('@/pages/Lab/LabWorklist.vue'),
  },
  {
    path: '/lab/:name',
    name: 'LabTest',
    component: () => import('@/pages/Lab/LabTest.vue'),
    props: true,
  },
  // Lab Test Template keeps the generic list; its form has the parameters grid.
  {
    path: '/lab-test-template/:name',
    name: 'LabTemplateForm',
    component: () => import('@/pages/Lab/LabTemplateForm.vue'),
    props: true,
  },
]
