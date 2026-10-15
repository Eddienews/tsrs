// Mounts the project folders (projects.mjs) in the TSRS dev and preview
// servers, at /__tsrs/projects. Only TSRS itself may use them: a request that
// changes something must carry this server's own origin.

import { sameOrigin } from '../render/vite-plugin.mjs'
import { projectsHandler, projectsRoot } from './projects.mjs'

export const PROJECTS_PATH = '/__tsrs/projects'

export function tsrsProjects() {
  const mount = (server) => {
    const handle = projectsHandler(projectsRoot())
    server.middlewares.use(PROJECTS_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Only TSRS itself may use the project folders.' }))
      }
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return { name: 'tsrs-projects', configureServer: mount, configurePreviewServer: mount }
}
