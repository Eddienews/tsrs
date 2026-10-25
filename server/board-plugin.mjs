// Mounts the production board (board.mjs) in the TSRS dev and preview servers,
// at /__tsrs/board. Only TSRS itself may change it.

import { sameOrigin } from '../render/vite-plugin.mjs'
import { boardHandler } from './board.mjs'
import { projectsRoot } from './projects.mjs'

export const BOARD_PATH = '/__tsrs/board'

export function tsrsBoard() {
  const mount = (server) => {
    const handle = boardHandler(projectsRoot())
    server.middlewares.use(BOARD_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Only TSRS itself may use the production board.' }))
      }
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return { name: 'tsrs-board', configureServer: mount, configurePreviewServer: mount }
}
