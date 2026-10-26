import './index.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadTheme } from './data/theme'

// The hospital's saved logo / colours (Settings screen), before first paint.
loadTheme()

// A page restored from the browser's back/forward cache skips the router's
// login check and could show a logged-in screen after logout elsewhere -
// reloading makes the check run again against the real session.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload()
  }
})

createApp(App).use(router).mount('#app')
