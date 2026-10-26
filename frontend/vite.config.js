import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import Components from 'unplugin-vue-components/vite'

// Same setup as the CHW app's frontend, minus its offline/PWA parts - HMIS
// runs on hospital desktops with a steady connection. frappeui() builds into
// ../metta/public/frontend (served at /assets/metta/frontend/) and copies the
// built page to ../metta/www/hmis.html, which Frappe serves at /hmis.
export default defineConfig({
  plugins: [
    frappeui({
      frontendRoute: '/hmis',
    }),
    vue(),
    Components({
      dirs: ['src/components', 'src/pages'],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
