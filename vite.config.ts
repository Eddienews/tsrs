import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Imported only when a chat is exported as HTML; listed so the dev server
  // does not discover it mid-session and reload the page.
  optimizeDeps: { include: ['react-dom/server'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // The cached transform of i18n.test.ts keeps an old list of source files
    // (import.meta.glob), so a new file's strings looked unused.
    fsModuleCache: false,
  },
})
