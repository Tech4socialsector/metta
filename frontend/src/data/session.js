import { reactive } from 'vue'
import { createResource, setConfig, frappeRequest } from 'frappe-ui'
import router from '@/router'

// Set here, not in main.js - this module is imported (and its first fetch
// fires) before main.js's own statements run, and without this fetcher
// createResource would call the wrong URLs.
setConfig('resourceFetcher', frappeRequest)

export const session = reactive({
  user: window.user && window.user !== 'Guest' ? window.user : null,
  full_name: null,
  roles: [],
})

export const userResource = createResource({
  url: 'frappe.auth.get_logged_user',
  onError() {
    session.user = null
  },
  onSuccess(user) {
    session.user = user
    contextLoad = contextResource.reload()
  },
})

// Roles arrive in a second call after the user check; the landing screen
// depends on them, so the router waits for this before choosing it.
let contextLoad = Promise.resolve()
export function whenRolesReady() {
  return Promise.resolve(contextLoad).catch(() => {})
}

// The router's first navigation awaits this, so a hard reload doesn't treat
// "not checked yet" as "logged out".
export const initialUserCheck = userResource.fetch()

const contextResource = createResource({
  url: 'metta.api.get_session_context',
  onSuccess(data) {
    session.full_name = data?.full_name || null
    session.roles = data?.roles || []
  },
})

export function hasRole(...roles) {
  return session.roles.includes('System Manager') || roles.some((r) => session.roles.includes(r))
}

export const loginResource = createResource({
  url: 'login',
  makeParams({ email, password }) {
    return { usr: email, pwd: password }
  },
  onSuccess() {
    userResource.reload().then(() => {
      const redirect = router.currentRoute.value.query.redirect
      router.replace(redirect || { name: 'Landing' })
    })
  },
})

export const logoutResource = createResource({
  url: 'logout',
  onSuccess() {
    session.user = null
    window.location.reload()
  },
})
