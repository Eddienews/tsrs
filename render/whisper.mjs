// Whisper with word timestamps, on this computer and free: the same
// transformers.js and ONNX Runtime the app uses for dictation, run in the
// headless browser the renderer already has (Node has no ONNX Runtime here).
// The model files come through server/models.mjs: downloaded once from Hugging
// Face into modelos/ (TSRS_MODELS) and read from there afterwards.
//
// transcribeWords(files, { model, language }) → for each file, the words heard:
// [{ text, t, end }] in seconds.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchModelFile, modelsRoot, parseModelPath } from '../server/models.mjs'
import { launchBrowser } from './render.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED = [
  resolve(ROOT, 'node_modules', '@huggingface', 'transformers', 'dist'),
  resolve(ROOT, 'node_modules', 'onnxruntime-web', 'dist'),
]
export const DEFAULT_MODEL = 'onnx-community/whisper-base_timestamped'

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' }

const PAGE = (model) => `<!doctype html><meta charset="utf-8">
<script type="importmap">${JSON.stringify({
  imports: {
    'onnxruntime-web/webgpu': '/nm/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs',
    'onnxruntime-common': '/ort-common.mjs',
  },
})}</script>
<script type="module">
import { env, pipeline } from '/nm/@huggingface/transformers/dist/transformers.web.js'
env.allowLocalModels = false
env.remoteHost = location.origin + '/hf/'
env.remotePathTemplate = '{model}/resolve/{revision}/'
env.useBrowserCache = false
env.useWasmCache = false
env.backends.onnx.wasm.wasmPaths = {
  mjs: location.origin + '/nm/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',
  wasm: location.origin + '/nm/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',
}
window.hear = async (count, language) => {
  const asr = await pipeline('automatic-speech-recognition', ${JSON.stringify(model)}, { dtype: 'q8', device: 'wasm' })
  const out = []
  for (let i = 0; i < count; i++) {
    const audio = new Float32Array(await (await fetch('/audio/' + i)).arrayBuffer())
    const r = await asr(audio, { language: language || null, task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })
    out.push((r.chunks || []).map((c) => ({ text: c.text, t: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] })))
  }
  return out
}
window.ready = true
</script>`

// 16 kHz mono float samples, as Whisper hears.
function samples(file, ffmpeg) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1024 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}`)
  return r.stdout
}

export async function transcribeWords(files, { model = DEFAULT_MODEL, language = '', ffmpeg = 'ffmpeg', log = () => {} } = {}) {
  const audio = files.map((f) => samples(f, ffmpeg))
  const root = modelsRoot()
  const server = createServer(async (req, res) => {
    // Cross-origin isolation lets ONNX Runtime use several threads.
    const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' }
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    try {
      if (path === '/') return res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE(model))
      if (path === '/ort-common.mjs')
        return res
          .writeHead(200, { ...headers, 'Content-Type': 'text/javascript' })
          .end("export * from '/nm/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs'")
      const audioMatch = /^\/audio\/(\d+)$/.exec(path)
      if (audioMatch && audio[Number(audioMatch[1])])
        return res.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream' }).end(audio[Number(audioMatch[1])])
      if (path.startsWith('/nm/')) {
        const file = resolve(ROOT, 'node_modules', path.slice(4))
        if (!ALLOWED.some((dir) => file.startsWith(dir + sep)) || !existsSync(file)) return res.writeHead(404, headers).end()
        return res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file))
      }
      if (path.startsWith('/hf/')) {
        const target = parseModelPath(path)
        if (!target) return res.writeHead(403, headers).end()
        if (!(await fetchModelFile(root, target))) return res.writeHead(404, headers).end()
        const file = resolve(root, 'hf', target.repo, target.revision, target.file)
        if ((await stat(file)).size > 20 * 1024 * 1024) log(`Whisper: ${target.file}`)
        return res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file))
      }
      res.writeHead(404, headers).end()
    } catch (error) {
      res.writeHead(502, headers).end(String(error?.message ?? error))
    }
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.waitForFunction(() => window.ready === true || false, null, { timeout: 60_000 }).catch(() => {
      throw new Error(`the Whisper page did not start: ${errors.join('; ') || 'timeout'}`)
    })
    log(`Whisper (${model.split('/').pop()}): listening to ${files.length} file(s)…`)
    return await page.evaluate(([n, lang]) => window.hear(n, lang), [files.length, language])
  } finally {
    await browser.close()
    server.close()
  }
}
