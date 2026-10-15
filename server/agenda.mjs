// The schedule: prompts the TSRS server sends to a model at set times, while
// npm run dev is running, even with no TSRS tab open. Kept in
// extensoes/agenda/:
//   tarefas.json            the tasks
//   chaves.json             API keys the user chose to keep on this computer
//                           for them (TSRS_KEY_<PROVIDER> in the environment works too)
//   fila.json               results waiting for TSRS to put them in conversations
//   resultados/<task>/…md   every result, as a Markdown file
//
// A task runs `once` at a time, `daily` at a time of day (on chosen weekdays),
// or every `hours`. One missed while the server was off runs when it starts.

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extensionsRoot } from './extensions.mjs'

const folder = (root) => join(root, 'agenda')

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(file, value, secret = false) {
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2), secret ? { mode: 0o600 } : undefined)
}

// When a schedule next fires after `from` (ms), or null when it never will.
export function nextRun(schedule, from) {
  const after = new Date(from)
  if (schedule.kind === 'once') {
    const at = Date.parse(schedule.at)
    return Number.isFinite(at) && at > from ? at : null
  }
  if (schedule.kind === 'interval') {
    const hours = Number(schedule.hours)
    return hours > 0 ? from + hours * 3_600_000 : null
  }
  if (schedule.kind === 'daily') {
    const [h, m] = String(schedule.time ?? '').split(':').map(Number)
    if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) return null
    const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days.map(Number) : [0, 1, 2, 3, 4, 5, 6]
    for (let add = 0; add <= 7; add++) {
      const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + add, h, m, 0, 0)
      if (day.getTime() > from && days.includes(day.getDay())) return day.getTime()
    }
  }
  return null
}

function publicTask(task) {
  return task
}

export function createAgenda(root = extensionsRoot(), { complete, log = console.log, now = () => Date.now() } = {}) {
  const tasksFile = join(folder(root), 'tarefas.json')
  const keysFile = join(folder(root), 'chaves.json')
  const queueFile = join(folder(root), 'fila.json')
  let running = false

  const tasks = () => readJson(tasksFile, [])
  const keys = () => readJson(keysFile, {})

  async function keyFor(providerId) {
    const stored = (await keys())[providerId]
    const env = process.env[`TSRS_KEY_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`]
    return { apiKey: stored?.apiKey ?? env ?? '' }
  }

  async function save(job) {
    const list = await tasks()
    const task = job.task ?? {}
    if (!String(task.prompt ?? '').trim()) throw new Error('A task needs a prompt.')
    if (!task.providerId || !task.model) throw new Error('A task needs a provider and a model.')
    const next = nextRun(task.schedule ?? {}, now())
    if (next === null && task.schedule?.kind !== 'once') throw new Error('That schedule never fires.')
    const saved = {
      id: task.id || randomUUID(),
      name: String(task.name || task.prompt).slice(0, 80),
      prompt: String(task.prompt),
      system: String(task.system ?? ''),
      providerId: String(task.providerId),
      model: String(task.model),
      // The provider's address as the user set it (a custom or local server).
      baseUrl: String(task.baseUrl ?? ''),
      schedule: task.schedule,
      enabled: task.enabled !== false,
      nextRun: next,
      lastRun: list.find((t) => t.id === task.id)?.lastRun ?? null,
      lastError: null,
    }
    if (job.key?.apiKey) {
      const all = await keys()
      all[saved.providerId] = { apiKey: String(job.key.apiKey) }
      await writeJson(keysFile, all, true)
    }
    await writeJson(tasksFile, [...list.filter((t) => t.id !== saved.id), saved])
    return publicTask(saved)
  }

  async function remove(id) {
    await writeJson(tasksFile, (await tasks()).filter((t) => t.id !== id))
  }

  async function forgetKey(providerId) {
    const all = await keys()
    delete all[providerId]
    await writeJson(keysFile, all, true)
  }

  async function update(id, fields) {
    const list = await tasks()
    await writeJson(tasksFile, list.map((t) => (t.id === id ? { ...t, ...fields } : t)))
  }

  // Sends one task's prompt now and queues the answer for TSRS.
  // `manual`: run by the user, which leaves the schedule as it is.
  async function run(task, manual = false) {
    const started = now()
    const key = await keyFor(task.providerId)
    let text = ''
    let error = null
    try {
      if (!key.apiKey && !/^(ollama|lmstudio|custom)$/.test(task.providerId))
        throw new Error(`No key for ${task.providerId} on this computer: save the task again and allow keeping the key.`)
      text = await complete({ ...task, ...key })
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
    const at = new Date(started)
    const stamp = at.toISOString().replace(/[:.]/g, '-')
    const results = join(folder(root), 'resultados', task.id)
    await mkdir(results, { recursive: true })
    await writeFile(
      join(results, `${stamp}.md`),
      `# ${task.name}\n\n${at.toLocaleString('pt-BR')} · ${task.model}\n\n## Pedido\n\n${task.prompt}\n\n## ${error ? 'Erro' : 'Resposta'}\n\n${error ?? text}\n`,
    )
    const queue = await readJson(queueFile, [])
    queue.push({
      id: randomUUID(),
      taskId: task.id,
      name: task.name,
      prompt: task.prompt,
      providerId: task.providerId,
      model: task.model,
      text,
      error,
      at: started,
    })
    await writeJson(queueFile, queue)
    const once = task.schedule?.kind === 'once'
    await update(task.id, {
      lastRun: started,
      lastError: error,
      ...(manual ? {} : { nextRun: once ? null : nextRun(task.schedule, now()) }),
      ...(once && !manual ? { enabled: false } : {}),
    })
    log(`[agenda] ${task.name}: ${error ? `failed (${error})` : 'done'}`)
  }

  // Runs what is due, one task at a time.
  async function tick() {
    if (running) return
    running = true
    try {
      for (const task of await tasks()) {
        if (task.enabled && task.nextRun !== null && task.nextRun <= now()) await run(task)
      }
    } finally {
      running = false
    }
  }

  async function runNow(id) {
    const task = (await tasks()).find((t) => t.id === id)
    if (!task) throw new Error('No such task.')
    await run(task, true)
  }

  async function queue() {
    return readJson(queueFile, [])
  }

  async function ack(ids) {
    const set = new Set(ids ?? [])
    await writeJson(queueFile, (await queue()).filter((item) => !set.has(item.id)))
  }

  async function list() {
    const stored = await keys()
    const all = await tasks()
    const envKeys = all
      .map((t) => t.providerId)
      .filter((id) => process.env[`TSRS_KEY_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`])
    return {
      tasks: all.map(publicTask),
      keys: [...new Set([...Object.keys(stored), ...envKeys])],
      keysFile,
      pending: (await queue()).length,
    }
  }

  // The routes, for the extensions handler.
  async function handle(req, res, url, job) {
    const send = (value) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(value))
      return true
    }
    const path = url.pathname
    if (req.method === 'GET' && path === '/agenda') return send(await list())
    if (req.method === 'GET' && path === '/agenda/queue') return send({ results: await queue() })
    if (req.method !== 'POST' || !job) return false
    if (path === '/agenda/save') return send(await save(job))
    if (path === '/agenda/remove') return send((await remove(job.id), { removed: job.id }))
    if (path === '/agenda/run') return send((await runNow(job.id), { ran: job.id }))
    if (path === '/agenda/ack') return send((await ack(job.ids), { acked: job.ids?.length ?? 0 }))
    if (path === '/agenda/forget-key') return send((await forgetKey(job.providerId), { forgot: job.providerId }))
    return false
  }

  return { save, remove, run, runNow, tick, queue, ack, list, handle, nextRun, exists: () => existsSync(tasksFile) }
}

// In the dev server: the model is reached with TSRS's own code (src/stream.ts),
// loaded by Vite, so the server talks to providers exactly as the app does.
export function agendaForServer(server) {
  const agenda = createAgenda(extensionsRoot(), {
    log: (line) => server.config.logger.info(line),
    async complete(task) {
      const stream = await server.ssrLoadModule('/src/stream.ts')
      const { getProvider } = await server.ssrLoadModule('/src/providers.ts')
      const provider = getProvider(task.providerId)
      return stream.completeText({
        provider,
        baseUrl: task.baseUrl || provider.baseUrl,
        apiKey: task.apiKey,
        model: task.model,
        system: task.system,
        messages: [{ role: 'user', content: task.prompt }],
      })
    },
  })
  const timer = setInterval(() => agenda.tick().catch((err) => server.config.logger.error(String(err))), 30_000)
  timer.unref?.()
  server.httpServer?.once('close', () => clearInterval(timer))
  // What was missed while the server was off runs once it is up.
  setTimeout(() => agenda.tick().catch(() => {}), 3000).unref?.()
  return agenda
}
