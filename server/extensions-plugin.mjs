// Mounts the extensions (extensions.mjs) and the schedule (agenda.mjs) in the
// TSRS dev and preview servers, at /__tsrs/ext. Only TSRS itself may use them.

import { sameOrigin } from '../render/vite-plugin.mjs'
import {
  extensionsRoot,
  installPlugin,
  installSkill,
  listPlugins,
  listSkills,
  readSkill,
  readSkillFile,
  removePlugin,
  removeSkill,
  runHttpTool,
  saveSkill,
  saveTool,
} from './extensions.mjs'
import { readPage, search } from './search.mjs'

export const EXTENSIONS_PATH = '/__tsrs/ext'
const MAX_BODY = 60 * 1024 * 1024

async function body(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('What was sent passes 60 MB.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

// Answers the extension routes, relative to where it is mounted; false for others.
// `extra` handles more routes (the schedule) with the same rules.
export function extensionsHandler(root = extensionsRoot(), extra = async () => false) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://tsrs.local')
    const path = url.pathname
    const q = (key) => url.searchParams.get(key) ?? ''
    try {
      if (req.method === 'GET') {
        if (path === '/health') return send(res, 200, { ok: true, root }), true
        if (path === '/skills') return send(res, 200, { skills: await listSkills(root) }), true
        if (path === '/skill') return send(res, 200, await readSkill(root, q('id'))), true
        if (path === '/skill-file') return send(res, 200, { content: await readSkillFile(root, q('id'), q('file')) }), true
        if (path === '/plugins') return send(res, 200, { plugins: await listPlugins(root) }), true
        return extra(req, res, url, null)
      }
      if (req.method !== 'POST') return false
      const job = await body(req)
      if (path === '/skills/install') return send(res, 200, await installSkill(root, job.files ?? [])), true
      if (path === '/skills/save') return send(res, 200, await saveSkill(root, job)), true
      if (path === '/skills/remove') return send(res, 200, { removed: await removeSkill(root, job.id) ?? job.id }), true
      if (path === '/plugins/install') return send(res, 200, await installPlugin(root, job.files ?? [])), true
      if (path === '/plugins/remove') return send(res, 200, { removed: await removePlugin(root, job.id) ?? job.id }), true
      if (path === '/tools/save') return send(res, 200, await saveTool(root, job.tool ?? {})), true
      if (path === '/tools/http') return send(res, 200, await runHttpTool(root, job.plugin, job.tool, job.input)), true
      if (path === '/search') return send(res, 200, { results: await search(job) }), true
      if (path === '/read') return send(res, 200, await readPage(String(job.url ?? ''))), true
      return extra(req, res, url, job)
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : String(error) }), true
    }
  }
}

export function tsrsExtensions(makeExtra) {
  const mount = (server) => {
    // The schedule runs the model with Vite's module loader, which only the dev server has.
    const extra = makeExtra && typeof server.ssrLoadModule === 'function' ? makeExtra(server) : undefined
    const handle = extensionsHandler(extensionsRoot(), extra)
    server.middlewares.use(EXTENSIONS_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Only TSRS itself may use the extensions.' }))
      }
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return { name: 'tsrs-extensions', configureServer: mount, configurePreviewServer: mount }
}
