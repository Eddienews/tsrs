import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { tsrsVersion } from './render/version-plugin.mjs'
import { tsrsRenderer } from './render/vite-plugin.mjs'
import { tsrsProjects } from './server/projects-plugin.mjs'
import { tsrsBackups } from './server/backups-plugin.mjs'
import { tsrsModels } from './server/models-plugin.mjs'
import { agendaForServer } from './server/agenda.mjs'
import { tsrsExtensions } from './server/extensions-plugin.mjs'
import { tsrsComfy } from './server/comfy-plugin.mjs'
import { tsrsSdcpp } from './server/sdcpp-plugin.mjs'
import { tsrsCli } from './server/cli-plugin.mjs'
import { tsrsBoard } from './server/board-plugin.mjs'

export default defineConfig({
  // tsrsRenderer: the "Gerar MP4" button's renderer, on npm run dev and vite preview.
  // tsrsVersion: the version and git commit shown in the interface.
  // tsrsProjects: the folders where conversations save their files.
  // tsrsExtensions: skills, plugins and the schedule, kept on disk.
  // tsrsBackups: a copy of conversations and settings on disk, made automatically.
  // tsrsModels: Whisper and Piper files, downloaded once and kept on disk.
  // tsrsComfy: music and sound effects from the local ComfyUI (Stable Audio 3).
  // tsrsSdcpp: images from the local stable-diffusion.cpp server (sd-server).
  // tsrsCli: Claude Code and Codex, installed on this computer, answering in a conversation.
  // tsrsBoard: the production board, kept in the projects folder.
  plugins: [react(), tailwindcss(), tsrsRenderer(), tsrsVersion(), tsrsProjects(), tsrsBackups(), tsrsModels(), tsrsComfy(), tsrsSdcpp(), tsrsCli(), tsrsBoard(), tsrsExtensions(process.env.VITEST ? undefined : (server) => agendaForServer(server).handle)],
  // Imported only when a chat is exported as HTML; listed so the dev server
  // does not discover it mid-session and reload the page.
  // The local voices' libraries, listed for the same reason: found only when
  // their workers first start, they would reload the page mid-session.
  optimizeDeps: {
    include: [
      'react-dom/server',
      '@huggingface/transformers',
      'onnxruntime-web/wasm',
      '@diffusionstudio/piper-wasm/build/piper_phonemize.js',
    ],
  },
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
