import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://petar19.github.io/catan-live/ (a GitHub Pages project
// page, not a custom domain), so every asset/route needs this base prefix.
export default defineConfig({
  base: '/catan-live/',
  plugins: [react()],
})
