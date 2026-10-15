#!/usr/bin/env node
// Local video renderer for the preview's "Gerar MP4" button. The browser
// cannot photograph a page frame by frame or run ffmpeg, so this small server
// does it on the same machine with render.mjs, and hands the MP4 back.
//
//   npm run render:serve [-- --port 8788 --origin http://localhost:5173 --out renders]
//
// It listens only on 127.0.0.1 and answers only the allowed origins, like the
// CORS proxy. Videos are kept in the output folder (renders/ in the TSRS
// folder by default) and never overwritten.
//
//   GET  /health        {"ok":true,"renders":"<folder>"}
//   POST /render        {"html","name","audio":{"name","data"(base64)}?,"lufs"?}
//                       answers NDJSON lines: {"frame","frames"}..., then
//                       {"done":true,"id","name","path"} or {"error"}
//   GET  /video/<id>    the MP4

import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freeName, render } from './render.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173']
// A composition plus a few minutes of WAV, in base64.
const MAX_BODY = 120 * 1024 * 1024
const AUDIO_TYPES = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.webm'])

export function serveOptions(argv) {
  const out = { port: 8788, origins: [], folder: resolve(HERE, '..', 'renders') }
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1]
    if (argv[i] === '--port') out.port = Number(value)
    else if (argv[i] === '--origin') out.origins.push(String(value).replace(/\/+$/, ''))
    else if (argv[i] === '--out') out.folder = resolve(String(value))
    else continue
    i++
  }
  if (!out.origins.length) out.origins = DEFAULT_ORIGINS
  return out
}

// A name safe for a file on Windows, macOS and Linux, without its extension.
export function safeStem(name) {
  const stem = basename(String(name ?? ''))
    .replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 80)
  return stem || 'motion'
}

export function audioExtension(name) {
  const extension = extname(String(name ?? '')).toLowerCase()
  return AUDIO_TYPES.has(extension) ? extension : null
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  }
}

async function body(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('the composition and the audio pass 120 MB')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function startRenderServer(config, log = console.log) {
  const videos = new Map()
  let busy = false

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (!origin || !config.origins.includes(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      return res.end(
        JSON.stringify({ error: `Origin ${origin ?? '(none)'} is not allowed; start with --origin.` }),
      )
    }
    const headers = cors(origin)
    if (req.method === 'OPTIONS') return res.writeHead(204, headers).end()
    const url = req.url ?? '/'

    if (req.method === 'GET' && url === '/health') {
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, renders: config.folder, busy }))
    }

    const video = /^\/video\/([\w-]+)$/.exec(url)
    if (req.method === 'GET' && video) {
      const path = videos.get(video[1])
      if (!path) return res.writeHead(404, headers).end()
      res.writeHead(200, { ...headers, 'Content-Type': 'video/mp4' })
      return res.end(await readFile(path))
    }

    if (req.method !== 'POST' || url !== '/render') return res.writeHead(404, headers).end()
    if (busy) {
      res.writeHead(409, { ...headers, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'A video is already being rendered.' }))
    }
    busy = true
    res.writeHead(200, { ...headers, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' })
    const send = (line) => res.write(JSON.stringify(line) + '\n')
    let work
    try {
      const job = await body(req)
      if (typeof job.html !== 'string' || !job.html.trim()) throw new Error('nothing to render')
      const stem = safeStem(job.name)
      work = await mkdtemp(join(tmpdir(), 'tsrs-render-'))
      const input = join(work, `${stem}.html`)
      await writeFile(input, job.html)
      let audio = null
      if (job.audio?.data) {
        const extension = audioExtension(job.audio.name)
        if (!extension) throw new Error(`${job.audio.name} is not an audio file this renderer reads`)
        audio = join(work, `track${extension}`)
        await writeFile(audio, Buffer.from(job.audio.data, 'base64'))
      }
      await mkdir(config.folder, { recursive: true })
      const lufs = Number.isFinite(job.lufs) ? Math.min(-5, Math.max(-40, job.lufs)) : -14
      log(`rendering ${stem}${audio ? ` with ${job.audio.name}` : ''}`)
      let last = 0
      const path = await render(
        {
          input,
          out: freeName(join(config.folder, `${stem}.mp4`)),
          audio,
          fps: null,
          crf: 18,
          lufs,
          online: false,
          onFrame: (frame, frames) => {
            if (frame === frames || Date.now() - last > 250) {
              last = Date.now()
              send({ frame, frames })
            }
          },
        },
        log,
      )
      const id = randomUUID()
      videos.set(id, path)
      send({ done: true, id, name: basename(path), path })
    } catch (error) {
      log(`failed: ${error.message}`)
      send({ error: error.message })
    } finally {
      busy = false
      res.end()
      if (work) await rm(work, { recursive: true, force: true }).catch(() => {})
    }
  })

  return new Promise((ok) => server.listen(config.port, '127.0.0.1', () => ok(server)))
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const config = serveOptions(process.argv.slice(2))
  await startRenderServer(config)
  console.log(`TSRS video renderer on http://127.0.0.1:${config.port}`)
  console.log(`  origins: ${config.origins.join(', ')}`)
  console.log(`  videos:  ${config.folder}`)
}
