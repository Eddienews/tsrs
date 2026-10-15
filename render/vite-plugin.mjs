// Puts the video renderer inside the TSRS dev and preview servers, at
// /__tsrs/render, so "Gerar MP4" works with npm run dev alone. Only pages of
// this same address may start a render: a POST must carry this server's own
// origin, which a page from another site, or a sandboxed preview frame, cannot.

import { defaultFolder, renderHandler } from './serve.mjs'

export const RENDER_PATH = '/__tsrs/render'

export function sameOrigin(req) {
  const origin = req.headers.origin
  const host = req.headers.host
  if (!origin) return req.method === 'GET'
  return !!host && (origin === `http://${host}` || origin === `https://${host}`)
}

export function tsrsRenderer() {
  const mount = (server) => {
    const handle = renderHandler({ folder: defaultFolder() }, (line) =>
      server.config.logger.info(`[render] ${line}`),
    )
    server.middlewares.use(RENDER_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Only TSRS itself may ask for a render.' }))
      }
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return {
    name: 'tsrs-renderer',
    configureServer: mount,
    configurePreviewServer: mount,
  }
}
