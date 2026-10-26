import frappeUIPreset from 'frappe-ui/tailwind'

// Two-colour theme. The shades live as CSS variables (src/index.css), so a
// later Settings screen can swap the hospital's colours without a rebuild.
const scale = (name) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]),
  )

export default {
  presets: [frappeUIPreset],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/src/components/**/*.{vue,js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: scale('brand'),
        accent: scale('accent'),
      },
    },
  },
}
