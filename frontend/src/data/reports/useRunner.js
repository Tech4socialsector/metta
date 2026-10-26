import { ref } from 'vue'
import { api, errorText } from '@/data/api'

// Loading/error state around one whitelisted call - every report page calls
// the exact Desk page method with the exact Desk arguments through this.
export function useRunner() {
  const loading = ref(false)
  const error = ref('')

  async function run(method, args = {}) {
    loading.value = true
    error.value = ''
    try {
      return await api(method, args)
    } catch (err) {
      error.value = errorText(err) || 'Could not load the report.'
      return null
    } finally {
      loading.value = false
    }
  }

  // Desk's frappe.msgprint for a missing required filter.
  function warn(message) {
    error.value = message
  }

  return { loading, error, run, warn }
}
