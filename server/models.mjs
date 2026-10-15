// Local models (Whisper to transcribe, Piper voices to read aloud) run in the
// browser, but their files are kept on disk: the first time a file is asked
// for, the TSRS server downloads it from Hugging Face into modelos/ (or
// TSRS_MODELS) and from then on serves it from there. So the models work
// without internet after the first use, and a browser cleanup does not make
// them download again.
//
// Mounted inside the TSRS dev server at /__tsrs/models (models-plugin.mjs):
//   GET|HEAD /hf/<org>/<repo>/resolve/<revision>/<path>   the file
//   GET /size?repo=<org>/<repo>&prefix=<path>              {"bytes","files"}
// Only the repositories in REPOS can be fetched.

import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// Whisper in ONNX for transformers.js, and the Piper voices.
export const REPOS = [/^onnx-community\/whisper-(tiny|base|small)$/, /^rhasspy\/piper-voices$/]
const MAX_FILE = 2 * 1024 * 1024 * 1024

const TYPES = {
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

export function modelsRoot() {
  return process.env.TSRS_MODELS ? resolve(process.env.TSRS_MODELS) : resolve(HERE, '..', 'modelos')
}

// Where files come from; the tests point it at a stand-in.
function hubBase() {
  return (process.env.TSRS_HF_BASE ?? 'https://huggingface.co').replace(/\/+$/, '')
}

const SEGMENT = /^[A-Za-z0-9._-]+$/

// The repository, revision and file of a request path, or null when it is
// not one this server may fetch.
export function parseModelPath(path) {
  const match = /^\/hf\/([^/]+)\/([^/]+)\/resolve\/([^/]+)\/(.+)$/.exec(path)
  if (!match) return null
  const [, org, name, revision, rest] = match
  const file = rest.split('/').map((s) => decodeURIComponent(s))
  const parts = [org, name, revision, ...file]
  if (!parts.every((s) => SEGMENT.test(s) && s !== '.' && s !== '..')) return null
  const repo = `${org}/${name}`
  if (!REPOS.some((re) => re.test(repo))) return null
  return { repo, revision, file: file.join('/') }
}

function localFile(root, { repo, revision, file }) {
  const path = resolve(root, 'hf', repo, revision, file)
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Outside the models folder.')
  return path
}

const downloads = new Map()

// Downloads a file once into the cache; several requests for the same file
// share the download. Resolves to false when the hub has no such file.
export function fetchModelFile(root, target, fetchImpl = fetch) {
  const path = localFile(root, target)
  if (existsSync(path)) return Promise.resolve(true)
  let job = downloads.get(path)
  if (!job) {
    job = (async () => {
      const url = `${hubBase()}/${target.repo}/resolve/${target.revision}/${target.file.split('/').map(encodeURIComponent).join('/')}`
      const res = await fetchImpl(url, { redirect: 'follow' })
      if (res.status === 404 || res.status === 401) return false
      if (!res.ok || !res.body) throw new Error(`Hugging Face ${res.status}`)
      if (Number(res.headers.get('content-length') ?? 0) > MAX_FILE) throw new Error('The file is too large.')
      await mkdir(dirname(path), { recursive: true })
      const part = `${path}.${process.pid}.part`
      try {
        await pipeline(Readable.fromWeb(res.body), createWriteStream(part))
        await rename(part, path)
      } catch (error) {
        await unlink(part).catch(() => {})
        throw error
      }
      return true
    })().finally(() => downloads.delete(path))
    downloads.set(path, job)
  }
  return job
}

// Bytes and files kept for a repository, below a path when given.
export async function cachedSize(root, repo, prefix = '') {
  let bytes = 0
  let files = 0
  const base = resolve(root, 'hf', repo)
  if (!base.startsWith(resolve(root) + sep)) return { bytes, files }
  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (!entry.name.endsWith('.part') && path.slice(base.length + 1).split(sep).slice(1).join('/').startsWith(prefix)) {
        bytes += (await stat(path)).size
        files++
      }
    }
  }
  await walk(base)
  return { bytes, files }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function modelsHandler(root, fetchImpl = fetch) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'GET' && url.pathname === '/size') {
      const repo = url.searchParams.get('repo') ?? ''
      if (!REPOS.some((re) => re.test(repo))) return send(res, 400, { error: 'Unknown repository.' }), true
      return send(res, 200, await cachedSize(root, repo, url.searchParams.get('prefix') ?? '')), true
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    const target = parseModelPath(url.pathname)
    if (!target) return url.pathname.startsWith('/hf/') ? (send(res, 403, { error: 'Not a model this server fetches.' }), true) : false
    let found
    try {
      found = await fetchModelFile(root, target, fetchImpl)
    } catch (error) {
      return send(res, 502, { error: error instanceof Error ? error.message : String(error) }), true
    }
    if (!found) return send(res, 404, { error: 'Not found.' }), true
    const path = localFile(root, target)
    const ext = /\.[^.]+$/.exec(path)?.[0] ?? ''
    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': (await stat(path)).size,
      'Cache-Control': 'no-cache',
    })
    if (req.method === 'HEAD') return res.end(), true
    createReadStream(path).pipe(res)
    return true
  }
}
