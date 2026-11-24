/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Lessons, explainers, quizzes and study notes live at the repo root (../lessons, ../explainers, ../quizzes, ../docs/study-notes.md). The dev server only
  // serves files inside frontend/ unless they're listed here.
  server: { fs: { allow: ['.', '../lessons', '../explainers', '../quizzes', '../docs/study-notes.md'] } },
  // Vitest blanks CSS imports by default; registry.test.ts reads tokens.css (?raw) to check the tokens exist.
  test: { css: { include: [/tokens\.css/] } },
})
