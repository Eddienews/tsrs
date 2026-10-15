// Mounts the automatic backups (backups.mjs) in the TSRS dev and preview
// servers, at /__tsrs/backups. Only TSRS itself may use them.

import { sameOrigin } from '../render/vite-plugin.mjs'
import { backupsHandler, backupsRoot } from './backups.mjs'

export const BACKUPS_PATH = '/__tsrs/backups'

export function tsrsBackups() {
  const mount = (server) => {
    const handle = backupsHandler(backupsRoot())
    server.middlewares.use(BACKUPS_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Only TSRS itself may use the backups.' }))
      }
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return { name: 'tsrs-backups', configureServer: mount, configurePreviewServer: mount }
}
