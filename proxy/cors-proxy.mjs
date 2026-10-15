#!/usr/bin/env node
// Local CORS proxy for providers whose APIs do not accept calls from a browser,
// and for WebDAV servers and buckets used for syncing.
//
//   npm run proxy [-- --port 8787 --origin http://localhost:5173 --allow api.example.com]
//
// The app sends `http://localhost:8787/<full URL>`; the proxy forwards
// the request and streams the answer back with CORS headers. It listens only on
// this machine, answers only the allowed origins and reaches only the allowed
// hosts, so a page on another site cannot use it to send your keys elsewhere.

import { createServer } from 'node:http'
import { Readable } from 'node:stream'

// OpenCode's gateways and the Higgsfield and Replicate APIs refuse browsers;
// they are reached through here.
const DEFAULT_HOSTS = ['opencode.ai', 'api.higgsfield.ai', 'api.replicate.com']
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173']
// Hop-by-hop and browser-only headers that must not be forwarded.
const DROPPED = new Set([
  'host',
  'origin',
  'referer',
  'connection',
  'content-length',
  'accept-encoding',
  'cookie',
])

function options(argv) {
  const out = { port: 8787, origins: [], hosts: [] }
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1]
    if (argv[i] === '--port') out.port = Number(value)
    else if (argv[i] === '--origin') out.origins.push(value.replace(/\/+$/, ''))
    else if (argv[i] === '--allow') out.hosts.push(value)
    else continue
    i++
  }
  if (!out.origins.length) out.origins = DEFAULT_ORIGINS
  out.hosts = [...DEFAULT_HOSTS, ...out.hosts]
  return out
}

const config = options(process.argv.slice(2))

// The wildcard in allow-headers does not cover Authorization, so the headers
// the browser asks about are named back.
function cors(origin, requested) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, DELETE, PROPFIND, MKCOL, OPTIONS',
    'access-control-allow-headers': requested || '*',
    'access-control-expose-headers': '*',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

function fail(res, status, message, origin) {
  res.writeHead(status, { 'content-type': 'application/json', ...(origin ? cors(origin) : {}) })
  res.end(JSON.stringify({ error: { message } }))
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (!origin || !config.origins.includes(origin)) {
    return fail(res, 403, `Origin ${origin ?? '(none)'} is not allowed; start the proxy with --origin.`)
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(origin, req.headers['access-control-request-headers']))
    return res.end()
  }

  let target
  try {
    target = new URL(req.url.slice(1))
  } catch {
    return fail(res, 400, 'Expected /<full provider URL>.', origin)
  }
  if (target.protocol !== 'https:' || !config.hosts.includes(target.hostname)) {
    return fail(res, 403, `${target.host} is not allowed; start the proxy with --allow ${target.hostname}.`, origin)
  }

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (!DROPPED.has(key) && !key.startsWith('sec-') && value !== undefined) headers[key] = value
  }
  const abort = new AbortController()
  res.on('close', () => abort.abort())
  // Read whole, so that a request without a body (MKCOL, DELETE) is sent without one.
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: abort.signal,
    })
    const out = { ...cors(origin) }
    for (const key of ['content-type', 'retry-after', 'cache-control', 'etag']) {
      const value = upstream.headers.get(key)
      if (value) out[key] = value
    }
    res.writeHead(upstream.status, out)
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res)
    else res.end()
  } catch (err) {
    if (!abort.signal.aborted) fail(res, 502, `Could not reach ${target.host}: ${err.message}`, origin)
  }
})

server.listen(config.port, '127.0.0.1', () => {
  console.log(`TSRS proxy on http://localhost:${config.port}`)
  console.log(`  origins: ${config.origins.join(', ')}`)
  console.log(`  hosts:   ${config.hosts.join(', ')}`)
})
