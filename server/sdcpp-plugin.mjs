// Mounts the local stable-diffusion.cpp image maker (sdcpp.mjs) in the TSRS
// dev and preview servers, at /__tsrs/sdcpp. Only TSRS itself may use it.
//   GET  /status  → { ok, url, model?, modes?, error? }
//   POST /image   { prompt, width?, height?, seed?, images?: [{ mime, data }] } → { mime, data, seed, model }

import { sameOrigin } from '../render/vite-plugin.mjs'
import { makeImage, sdcppStatus } from './sdcpp.mjs'

export const SDCPP_PATH = '/__tsrs/sdcpp'
// Up to 3 reference images, as base64.
const MAX_BODY = 64 * 1024 * 1024

async function body(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('What was sent is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function tsrsSdcpp() {
  const mount = (server) => {
    server.middlewares.use(SDCPP_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) return send(res, 403, { error: 'Only TSRS itself may use sd-server.' })
      const path = new URL(req.url ?? '/', 'http://tsrs.local').pathname
      try {
        if (req.method === 'GET' && path === '/status') return send(res, 200, await sdcppStatus())
        if (req.method === 'POST' && path === '/image') return send(res, 200, await makeImage(await body(req)))
        next()
      } catch (error) {
        send(res, 502, { error: error instanceof Error ? error.message : String(error) })
      }
    })
  }
  return { name: 'tsrs-sdcpp', configureServer: mount, configurePreviewServer: mount }
}
