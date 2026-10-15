// Mounts the local model files (models.mjs) in the TSRS dev and preview
// servers, at /__tsrs/models. Only TSRS itself may use them.

import { sameOrigin } from '../render/vite-plugin.mjs'
import { modelsHandler, modelsRoot } from './models.mjs'

export const MODELS_PATH = '/__tsrs/models'

export function tsrsModels() {
  const mount = (server) => {
    const handle = modelsHandler(modelsRoot())
    server.middlewares.use(MODELS_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Only TSRS itself may use the local models.' }))
      }
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return { name: 'tsrs-models', configureServer: mount, configurePreviewServer: mount }
}
