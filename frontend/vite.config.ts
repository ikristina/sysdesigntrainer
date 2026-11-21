import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Lessons and explainers live at the repo root (../lessons, ../explainers). The dev server only
  // serves files inside frontend/ unless they're listed here.
  server: { fs: { allow: ['.', '../lessons', '../explainers'] } },
})
