import { existsSync } from 'node:fs'
import { chromium, defineConfig } from '@playwright/test'

const PORT = 5174

// CHROMIUM_PATH picks a browser by hand; without it, Playwright's own Chromium
// is used when installed (npx playwright install chromium), and otherwise the
// Chrome installed on the system, on Linux, Windows and macOS alike.
const browser = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : existsSync(chromium.executablePath())
    ? {}
    : { channel: 'chrome' }

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The interface follows the browser's language; the tests read Portuguese.
    locale: 'pt-BR',
    ...('channel' in browser ? browser : {}),
    launchOptions: {
      ...('executablePath' in browser ? browser : {}),
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
