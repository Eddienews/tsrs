import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { tsrsVersion } from './render/version-plugin.mjs'
import { tsrsRenderer } from './render/vite-plugin.mjs'
import { tsrsProjects } from './server/projects-plugin.mjs'
import { tsrsBackups } from './server/backups-plugin.mjs'
import { agendaForServer } from './server/agenda.mjs'
import { tsrsExtensions } from './server/extensions-plugin.mjs'

export default defineConfig({
  // tsrsRenderer: the "Gerar MP4" button's renderer, on npm run dev and vite preview.
  // tsrsVersion: the version and git commit shown in the interface.
  // tsrsProjects: the folders where conversations save their files.
  // tsrsExtensions: skills, plugins and the schedule, kept on disk.
  // tsrsBackups: a copy of conversations and settings on disk, made automatically.
  plugins: [react(), tailwindcss(), tsrsRenderer(), tsrsVersion(), tsrsProjects(), tsrsBackups(), tsrsExtensions(process.env.VITEST ? undefined : (server) => agendaForServer(server).handle)],
  // Imported only when a chat is exported as HTML; listed so the dev server
  // does not discover it mid-session and reload the page.
  optimizeDeps: { include: ['react-dom/server'] },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change less often than the app, so they get chunks of
        // their own that the browser keeps cached across releases.
        codeSplitting: {
          groups: [
            // The server renderer is only for HTML export, which loads it on demand.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/](?!.*server)/ },
            { name: 'ui', test: /node_modules[\\/](@radix-ui|lucide-react|react-resizable-panels)[\\/]/ },
          ],
        },
      },
    },
  },
  // Lets the tests import sample workbooks.
  assetsInclude: ['**/*.xlsx', '**/*.docx', '**/*.pptx'],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // The cached transform of i18n.test.ts keeps an old list of source files
    // (import.meta.glob), so a new file's strings looked unused.
    fsModuleCache: false,
    // Slow machines running every file at once took longer than the default 5 s.
    testTimeout: 15_000,
  },
})
