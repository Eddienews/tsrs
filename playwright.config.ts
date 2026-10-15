import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, defineConfig } from '@playwright/test'

const PORT = 5174
const EXT_PORT = 5175

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
  projects: [
    { name: 'app', testIgnore: /extensions\.spec/ },
    // Skills and plugins change what every request carries, so their tests get
    // a server and a folder of their own.
    { name: 'extensions', testMatch: /extensions\.spec/, use: { baseURL: `http://localhost:${EXT_PORT}` } },
  ],
  webServer: [PORT, EXT_PORT].map((port) => ({
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    // Videos, project folders and extensions made by the tests go to temporary folders.
    env: {
      TSRS_RENDERS: join(tmpdir(), 'tsrs-e2e-renders'),
      TSRS_PROJECTS: join(tmpdir(), 'tsrs-e2e-projects'),
      TSRS_EXTENSIONS: join(tmpdir(), port === PORT ? 'tsrs-e2e-no-extensions' : `tsrs-e2e-extensions-${process.pid}`),
    },
  })),
})
