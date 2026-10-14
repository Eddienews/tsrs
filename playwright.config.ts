import { defineConfig } from '@playwright/test'

const PORT = 5174

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The interface follows the browser's language; the tests read Portuguese.
    locale: 'pt-BR',
    // Set CHROMIUM_PATH to use a system browser instead of Playwright's.
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      // A silent fake microphone, allowed without asking, for dictation.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
