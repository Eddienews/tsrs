// Mounts the coding agents installed on this computer (cli.mjs) in the TSRS
// dev and preview servers, at /__tsrs/cli. Only TSRS itself may use them.
//   POST /status { agent, command? }   → { agent, ok, version?, error?, limit? }
//   POST /run    { agent, command?, model?, effort?, access?, chatId, turn, cwd?, prompt, transcript }
//        → text/event-stream: every line the agent prints, as `data: <line>`,
//          then `data: {"tsrs":"end","code","resumed","cwd","error"?}`

import { sameOrigin } from '../render/vite-plugin.mjs'
import { AGENTS, cliStatus, runCli } from './cli.mjs'

export const CLI_PATH = '/__tsrs/cli'
const MAX_BODY = 32 * 1024 * 1024

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

export function cliHandler(options = {}) {
  // The last usage window each agent reported, for the status (Mission Control).
  const limits = {}
  const onLimit = (agent, limit) => (limits[agent] = { ...limit, at: Date.now() })
  return async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://tsrs.local').pathname
    if (req.method !== 'POST') return false
    if (path === '/status') {
      const { agent, command } = await body(req)
      const status = await cliStatus(agent, command)
      return send(res, 200, { ...status, ...(limits[agent] ? { limit: limits[agent] } : {}) }), true
    }
    if (path !== '/run') return false
    const job = await body(req)
    if (!AGENTS[job.agent]) return send(res, 400, { error: `Unknown agent: ${job.agent}.` }), true
    if (typeof job.prompt !== 'string' || !job.prompt.trim()) return send(res, 400, { error: 'Nothing to send.' }), true
    // The browser's Stop closes the connection: the agent stops too.
    const gone = new AbortController()
    res.on('close', () => gone.abort())
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    const event = (data) => res.write(`data: ${data}\n\n`)
    try {
      const ended = await runCli(job, event, { ...options, signal: gone.signal, onLimit })
      const error = ended.code === 0 ? undefined : ended.stderr || `${AGENTS[job.agent].name} stopped (status ${ended.code}).`
      event(JSON.stringify({ tsrs: 'end', code: ended.code, resumed: ended.resumed, cwd: ended.cwd, ...(error ? { error } : {}) }))
    } catch (error) {
      event(JSON.stringify({ tsrs: 'end', code: -1, error: String(error?.message ?? error) }))
    }
    res.end()
    return true
  }
}

export function tsrsCli() {
  const mount = (server) => {
    const handle = cliHandler()
    server.middlewares.use(CLI_PATH, async (req, res, next) => {
      if (!sameOrigin(req)) return send(res, 403, { error: 'Only TSRS itself may start the coding agents.' })
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        if (res.headersSent) return res.end()
        send(res, 500, { error: String(error?.message ?? error) })
      }
    })
  }
  return { name: 'tsrs-cli', configureServer: mount, configurePreviewServer: mount }
}
