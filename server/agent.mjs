// TSRS for agents: what the `tsrs` command (bin/tsrs.mjs) and its MCP server
// ask the running TSRS to do. Mounted inside the TSRS dev and preview servers
// at /__tsrs/agent (agent-plugin.mjs).
//
// Only someone who can read this computer's agent file may use it: each start
// writes a fresh token to <extensions folder>/.tsrs-agent.json, readable by its
// owner only, and every request must carry it. A web page cannot read that
// file, and requests from pages (they carry an Origin) are refused outright.
//
//   POST /run  { command, args, yes }  →  { ok, text, result } | { ok: false, code, error }
//     a render answers in lines of JSON: { frame, frames } … then the answer.
//
// The commands are listed in agent-commands.mjs. Each one reuses what the app
// itself uses on the server: project folders, the renderer, the board file,
// the schedule, the local image servers and the design check.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { checkArgs, findCommand } from './agent-commands.mjs'
import { readBoard, saveBoard } from './board.mjs'
import { extensionsRoot } from './extensions.mjs'
import { allowed, listFiles, openProject, projectFile, projectsRoot, readText, slug, writeFiles } from './projects.mjs'

export const AGENT_PATH = '/__tsrs/agent'
export const AGENT_FILE = '.tsrs-agent.json'

export function agentFile(root = extensionsRoot()) {
  return join(root, AGENT_FILE)
}

// A fresh token for this server, with its address, for the tsrs command to find.
export async function writeAgentFile(url, root = extensionsRoot()) {
  const token = randomBytes(32).toString('base64url')
  await mkdir(root, { recursive: true })
  const file = agentFile(root)
  await writeFile(`${file}.tmp`, JSON.stringify({ url, token, pid: process.pid, started: new Date().toISOString() }, null, 2), { mode: 0o600 })
  await rename(`${file}.tmp`, file)
  await chmod(file, 0o600).catch(() => {})
  return token
}

export function sameToken(given, token) {
  const a = Buffer.from(String(given ?? ''))
  const b = Buffer.from(String(token ?? ''))
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b)
}

class AgentError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const invalid = (message) => new AgentError('invalid', message)
const confirm = (message) => new AgentError('confirm', message)

// A local server answers when its status has no error (ComfyUI may lack the
// audio models and still make images).
const up = (status) => !!status && !status.error

const when = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '—')
const bytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)

// `deps`: what the commands reach outside this file, so tests can stand in.
//   agenda       the server's schedule (agenda.mjs)
//   version()    { version, commit }
//   renderMotion, renderBusy   from render/serve.mjs
//   video        readSpec, checkVideo, describeCheck, runVideo from render/video.mjs
//   inspectPage  from design.mjs
//   comfy, sdcpp { status(), makeImage(job) }
//   renderFolder where videos outside a project go
export function createAgent(deps, root = projectsRoot()) {
  async function project(ref) {
    const name = String(ref ?? '').trim()
    if (!name) throw invalid('Name a project folder.')
    const path = isAbsolute(name) ? resolve(name) : join(root, name)
    if (!existsSync(path) || !(await allowed(root, path))) throw invalid(`No project folder named ${name}. See: tsrs projects list`)
    return path
  }

  async function notesFile(folder) {
    return existsSync(join(folder, 'NOTAS.md')) ? 'NOTAS.md' : 'NOTES.md'
  }

  async function note(folder, files) {
    const name = await notesFile(folder)
    await appendFile(join(folder, name), `- ${new Date().toLocaleString('en-US')} · ${files.join(', ')} · tsrs command\n`)
  }

  function findIn(list, ref, what, extra = () => []) {
    const want = String(ref ?? '').trim().toLowerCase()
    const hits = list.filter((item) => item.id.toLowerCase() === want || [item.title ?? item.name, ...extra(item)].some((v) => String(v ?? '').toLowerCase() === want))
    if (hits.length === 1) return hits[0]
    const loose = list.filter((item) => item.id.toLowerCase().startsWith(want) || String(item.title ?? item.name ?? '').toLowerCase().includes(want))
    if (!hits.length && loose.length === 1) return loose[0]
    if (hits.length > 1 || loose.length > 1) throw invalid(`More than one ${what} matches "${ref}": ${(hits.length ? hits : loose).map((i) => i.id).join(', ')}`)
    throw invalid(`No ${what} matches "${ref}".`)
  }

  async function changeBoard(change) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const board = await readBoard(root)
      const { next, text, result } = change(board)
      const saved = await saveBoard(next, board.version, root)
      if (saved.ok) return { text, result }
    }
    throw new Error('The board kept changing while saving; try again.')
  }

  const column = (board, ref) => findIn(board.columns.map((c) => ({ ...c, title: c.name })), ref, 'column')
  const cardFields = (args) => {
    const fields = {}
    for (const key of ['title', 'kind', 'series', 'language', 'due', 'notes']) if (args[key] !== undefined) fields[key] = String(args[key])
    if (fields.kind && !['episodio', 'ad', 'outro'].includes(fields.kind)) throw invalid('--kind is episodio, ad or outro.')
    if (fields.due && !/^\d{4}-\d{2}-\d{2}$/.test(fields.due)) throw invalid('--due is a date like 2026-11-07.')
    return fields
  }
  const cardLine = (card, board) =>
    `${card.title}  [${board.columns.find((c) => c.id === card.column)?.name ?? card.column}]${card.kind ? ` · ${card.kind}` : ''}${card.series ? ` · ${card.series}` : ''}${card.due ? ` · due ${card.due}` : ''}  (${card.id})`

  const run = {
    async status() {
      const [comfy, sdcpp] = await Promise.all([deps.comfy.status().catch(() => null), deps.sdcpp.status().catch(() => null)])
      const agenda = await deps.agenda.list()
      const v = deps.version()
      const result = {
        version: v.version,
        commit: v.commit,
        projects: root,
        rendering: deps.renderBusy(),
        comfy: up(comfy),
        sdcpp: up(sdcpp) && !!sdcpp.ok,
        tasks: agenda.tasks.length,
        pendingAnswers: agenda.pending,
      }
      const text = [
        `TSRS ${result.version}${result.commit ? ` (${result.commit})` : ''}`,
        `Projects folder: ${root}`,
        `Renderer: ${result.rendering ? 'rendering now' : 'ready'}`,
        `ComfyUI: ${result.comfy ? 'running' : 'not running'} · sd-server: ${result.sdcpp ? 'running' : 'not running'}`,
        `Schedule: ${result.tasks} task(s), ${result.pendingAnswers} answer(s) waiting in TSRS`,
      ].join('\n')
      return { text, result }
    },

    async 'projects list'() {
      const projects = []
      let names = []
      try {
        names = await readdir(root, { withFileTypes: true })
      } catch {
        names = []
      }
      for (const entry of names) {
        if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue
        const path = join(root, entry.name)
        projects.push({ name: entry.name, path, modified: Math.round((await stat(path)).mtimeMs) })
      }
      projects.sort((a, b) => b.modified - a.modified)
      const text = projects.length ? projects.map((p) => `${p.name}  ${when(p.modified)}`).join('\n') : `No projects yet in ${root}.`
      return { text, result: projects }
    },

    async 'projects files'(args) {
      const folder = await project(args.project)
      const files = await listFiles(folder)
      const text = files.length ? files.map((f) => `${f.name}  ${bytes(f.size)}  ${when(f.modified)}`).join('\n') : 'The folder is empty.'
      return { text, result: { project: folder, files } }
    },

    async 'projects read'(args) {
      const folder = await project(args.project)
      const content = await readText(folder, args.file).catch((error) => {
        throw invalid(error.message)
      })
      const all = content.split('\n')
      let from = 1
      let to = all.length
      if (args.lines) {
        const m = /^(\d+)(?::(\d+))?$/.exec(String(args.lines))
        if (!m) throw invalid('--lines is a range like 1:80.')
        from = Math.max(1, Number(m[1]))
        to = Math.min(all.length, m[2] ? Number(m[2]) : from)
      }
      const text = all.slice(from - 1, to).join('\n')
      return { text, result: { project: folder, file: args.file, from, to, lines: all.length, text } }
    },

    async 'projects new'(args) {
      const name = String(args.name).trim()
      if (existsSync(join(root, slug(name)))) {
        throw invalid(`A project folder named ${slug(name)} already exists. Use it, or pick another name.`)
      }
      const notes = `# ${name}\n\nProject created by the tsrs command on ${new Date().toLocaleString('en-US')}.\n\n## History\n\n`
      const made = await openProject(root, { name, notes, notesName: 'NOTES.md' })
      return { text: `Created ${made.path}`, result: made }
    },

    async 'projects write'(args, yes) {
      const folder = await project(args.project)
      const target = projectFile(folder, args.file)
      if (!target) throw invalid(`${args.file} is not a file name inside the project.`)
      const content = args.base64 !== undefined ? String(args.base64) : args.text !== undefined ? String(args.text) : null
      if (content === null) throw invalid('Give the content: --from <file> or --text "…".')
      const rel = relative(folder, target).split('\\').join('/')
      if (existsSync(target) && !yes) throw confirm(`Would replace ${rel} in ${basename(folder)}. Add --yes to replace it.`)
      await writeFiles(folder, [{ name: rel, content, ...(args.base64 !== undefined ? { encoding: 'base64' } : {}) }])
      if (!/^NOT[AE]S\.md$/.test(rel)) await note(folder, [rel])
      return { text: `Wrote ${rel} in ${basename(folder)}.`, result: { project: folder, file: rel, path: target } }
    },

    async 'render motion'(args, _yes, progress) {
      const folder = await project(args.project)
      const html = await readText(folder, args.file).catch((error) => {
        throw invalid(error.message)
      })
      let audio
      if (args.audio) {
        const file = projectFile(folder, args.audio)
        if (!file || !existsSync(file)) throw invalid(`No file named ${args.audio} in the project.`)
        audio = { name: basename(file), data: (await readFile(file)).toString('base64') }
      }
      if (deps.renderBusy()) throw new AgentError('busy', 'A video is already being rendered. Try again when it ends.')
      const name = String(args.name || basename(String(args.file)).replace(/\.html?$/i, ''))
      const path = await deps.exclusiveRender(() =>
        deps.renderMotion({ html, name, audio, project: folder }, deps.renderFolder, deps.log, (frame, frames) => progress?.({ frame, frames })),
      )
      const rel = relative(folder, path).split('\\').join('/')
      await note(folder, [rel])
      return { text: `Rendered ${rel} in ${basename(folder)}.`, result: { project: folder, file: rel, path } }
    },

    async 'video check'(args) {
      const folder = await project(args.project)
      const { spec } = await deps.video.readSpec(folder, args.spec ?? 'video.json').catch((error) => {
        throw invalid(error.message)
      })
      const report = await deps.video.checkVideo(folder, spec)
      return { text: deps.video.describeCheck(report), result: report }
    },

    async 'video run'(args, yes, progress) {
      const folder = await project(args.project)
      const { spec, path } = await deps.video.readSpec(folder, args.spec ?? 'video.json').catch((error) => {
        throw invalid(error.message)
      })
      if (deps.renderBusy()) throw new AgentError('busy', 'A video is already being rendered. Try again when it ends.')
      let made
      try {
        made = await deps.exclusiveRender(() =>
          deps.video.runVideo(folder, spec, { yes, log: deps.log, specPath: path, onFrame: (frame, frames) => progress?.({ frame, frames }) }),
        )
      } catch (error) {
        if (error?.code === 'confirm') throw confirm(error.message)
        if (error?.code === 'invalid') throw invalid(error.message)
        throw error
      }
      const files = [made.video, made.vertical].filter(Boolean).map((f) => relative(folder, f).split('\\').join('/'))
      await note(folder, files)
      return {
        text: `Made ${files.join(' and ')} in ${basename(folder)} (${made.total.toFixed(1)} s, words from ${made.words}${made.made.length ? `, voice made for ${made.made.length} line(s)` : ''}).`,
        result: { project: folder, files, timing: relative(folder, made.timing).split('\\').join('/'), seconds: made.total, words: made.words, voiceMade: made.made },
      }
    },

    async 'design check'(args) {
      const folder = await project(args.project)
      const widths = (args.widths ?? []).map(Number)
      const report = await deps.inspectPage(folder, { file: args.file, widths })
      const pictures = report.images.map((i) => i.label)
      const text = `${report.text}${pictures.length ? `\n\nPictures: ${pictures.join(', ')}` : ''}`
      return { text, result: { project: folder, findings: report.findings, pictures } }
    },

    async 'board list'(args) {
      const board = await readBoard(root)
      const only = args.column ? column(board, args.column).id : null
      const cards = board.cards.filter((c) => !only || c.column === only)
      const text = board.columns
        .filter((c) => !only || c.id === only)
        .map((c) => {
          const here = cards.filter((card) => card.column === c.id)
          return [`${c.name} (${here.length})`, ...here.map((card) => `  ${cardLine(card, board).replace(/ {2}\[[^\]]*\]/, '')}`)].join('\n')
        })
        .join('\n')
      return { text, result: { columns: board.columns, cards } }
    },

    async 'board add'(args) {
      const fields = cardFields(args)
      const projectPath = args.project ? await project(args.project) : undefined
      return changeBoard((board) => {
        const now = Date.now()
        const at = args.column ? column(board, args.column).id : board.columns[0].id
        const card = { kind: 'episodio', ...fields, id: crypto.randomUUID(), column: at, ...(projectPath ? { projectPath } : {}), createdAt: now, updatedAt: now }
        return { next: { ...board, cards: [...board.cards, card] }, text: `Added: ${cardLine(card, board)}`, result: card }
      })
    },

    async 'board move'(args) {
      return changeBoard((board) => {
        const card = findIn(board.cards, args.card, 'card')
        const to = column(board, args.column)
        const moved = { ...card, column: to.id, updatedAt: card.column === to.id ? card.updatedAt : Date.now() }
        const cards = [...board.cards.filter((c) => c.id !== card.id), moved]
        return { next: { ...board, cards }, text: `Moved: ${cardLine(moved, board)}`, result: moved }
      })
    },

    async 'board update'(args) {
      const fields = cardFields(args)
      const projectPath = args.project ? await project(args.project) : undefined
      if (!Object.keys(fields).length && !projectPath) throw invalid('Say what to change: --title, --due, --series…')
      return changeBoard((board) => {
        const card = findIn(board.cards, args.card, 'card')
        const next = { ...card, ...fields, ...(projectPath ? { projectPath } : {}), id: card.id, updatedAt: Date.now() }
        return { next: { ...board, cards: board.cards.map((c) => (c.id === card.id ? next : c)) }, text: `Updated: ${cardLine(next, board)}`, result: next }
      })
    },

    async 'board remove'(args) {
      return changeBoard((board) => {
        const card = findIn(board.cards, args.card, 'card')
        return {
          next: { ...board, cards: board.cards.filter((c) => c.id !== card.id), removed: [...board.removed, { ...card, removedAt: Date.now() }] },
          text: `Removed "${card.title}"; it stays with the removed cards on the board, to bring back.`,
          result: card,
        }
      })
    },

    async 'agenda list'() {
      const { tasks, pending } = await deps.agenda.list()
      const describe = (s) =>
        s?.kind === 'daily' ? `daily at ${s.time}` : s?.kind === 'interval' ? `every ${s.hours} h` : s?.kind === 'once' ? `once, ${s.at}` : '—'
      const result = tasks.map((t) => ({
        id: t.id,
        name: t.name,
        model: `${t.providerId}/${t.model}`,
        schedule: t.schedule,
        enabled: t.enabled,
        nextRun: t.nextRun,
        lastRun: t.lastRun,
        lastError: t.lastError,
      }))
      const text = result.length
        ? [
            ...result.map((t) => `${t.name}  ${describe(t.schedule)} · ${t.model}${t.enabled ? '' : ' · paused'} · next ${when(t.nextRun)}${t.lastError ? ` · last error: ${t.lastError}` : ''}  (${t.id})`),
            ...(pending ? [`${pending} answer(s) waiting in TSRS.`] : []),
          ].join('\n')
        : 'No scheduled tasks.'
      return { text, result }
    },

    async 'agenda run'(args, yes) {
      const { tasks } = await deps.agenda.list()
      const task = findIn(tasks, args.task, 'task', (t) => [t.name])
      if (!yes) throw confirm(`Would run "${task.name}" now with ${task.providerId}/${task.model}, a paid call. Add --yes to run it.`)
      await deps.agenda.runNow(task.id)
      const after = (await deps.agenda.list()).tasks.find((t) => t.id === task.id)
      if (after?.lastError) throw new Error(`"${task.name}" failed: ${after.lastError}`)
      return { text: `Ran "${task.name}"; its answer waits in TSRS.`, result: { id: task.id, name: task.name } }
    },

    async 'image local'(args) {
      const folder = await project(args.project)
      const [comfy, sdcpp] = await Promise.all([deps.comfy.status().catch(() => null), deps.sdcpp.status().catch(() => null)])
      const engine = args.engine ?? (up(sdcpp) && sdcpp.ok ? 'sdcpp' : up(comfy) ? 'comfy' : null)
      if (!engine) throw invalid('Neither ComfyUI nor sd-server is running on this computer.')
      if (!['comfy', 'sdcpp'].includes(engine)) throw invalid('--engine is comfy or sdcpp.')
      const made = await deps[engine].makeImage({ prompt: args.prompt, width: args.width, height: args.height })
      const stem = slug(args.name || args.prompt).slice(0, 40)
      let rel = `midia/${stem}.png`
      for (let n = 2; existsSync(join(folder, rel)); n++) rel = `midia/${stem}-${n}.png`
      await writeFiles(folder, [{ name: rel, content: made.data, encoding: 'base64' }])
      await note(folder, [rel])
      return { text: `Made ${rel} in ${basename(folder)} with ${made.model} (seed ${made.seed}).`, result: { project: folder, file: rel, model: made.model, seed: made.seed } }
    },
  }

  // Runs one command; errors carry a code: invalid, confirm, busy or failed.
  return async function runCommand(name, args = {}, yes = false, progress) {
    const command = findCommand(name)
    if (!command) throw invalid(`No command "${name}". See: tsrs --help`)
    checkArgs(command, args)
    // destructive and cost commands check `yes` themselves, after saying
    // exactly what they would do.
    return run[name](args, yes, progress)
  }
}

async function body(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024 * 1024) throw invalid('The request is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export function agentHandler(runCommand, token) {
  return async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(value))
      return true
    }
    // Pages always say where they come from; the tsrs command never does.
    if (req.headers.origin) return json(403, { ok: false, code: 'refused', error: 'Web pages may not use the agent commands.' })
    const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!sameToken(given, token())) return json(401, { ok: false, code: 'refused', error: 'Wrong or missing agent token. Run tsrs from the same computer and TSRS folder.' })
    const path = new URL(req.url ?? '/', 'http://tsrs.local').pathname
    if (req.method !== 'POST' || path !== '/run') return false
    let job
    try {
      job = await body(req)
    } catch (error) {
      return json(400, { ok: false, code: 'invalid', error: error.message })
    }
    const streaming = job.command === 'render motion' || job.command === 'video run'
    if (streaming) res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' })
    const finish = (value) => (streaming ? (res.end(JSON.stringify(value) + '\n'), true) : json(200, value))
    try {
      const progress = streaming ? (line) => res.write(JSON.stringify(line) + '\n') : undefined
      const { text, result } = await runCommand(String(job.command ?? ''), job.args ?? {}, job.yes === true, progress)
      return finish({ ok: true, text, result })
    } catch (error) {
      const code = ['invalid', 'confirm', 'busy'].includes(error?.code) ? error.code : 'failed'
      return finish({ ok: false, code, error: error instanceof Error ? error.message : String(error) })
    }
  }
}
