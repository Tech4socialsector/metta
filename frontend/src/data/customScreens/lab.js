// The sidebar's Lab section opens these screens instead of the generic form.
export default {
  'Diagnostic Test': {
    list: { name: 'LabWorklist' },
    view: (name) => ({ name: 'LabTest', params: { name } }),
    create: { name: 'LabTest', params: { name: 'new' } },
  },
  'Lab Test Template': {
    view: (name) => ({ name: 'LabTemplateForm', params: { name } }),
    create: { name: 'LabTemplateForm', params: { name: 'new' } },
  },
}
