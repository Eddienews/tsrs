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

import { spawnSync } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { checkArgs, findCommand } from './agent-commands.mjs'
import { readBoard, saveBoard } from './board.mjs'
import { extensionsRoot } from './extensions.mjs'
import { checkFilm, describeFilm, FILM_FILE, filmShots } from './film.mjs'
import { checkShot, composeShot, findNegations, framesFor, MAX_CHARS, secondsOf, STARTS } from './h3prompt.mjs'
import { WAIT_MAX } from './jobs.mjs'
import { edl, fcpxml, probe, resolveZip } from './nle.mjs'
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
//   comfy, sdcpp { status(), makeImage(job) }; comfy also h3Models(), makeTake(job),
//                turnaroundModels(), makeTurnaround(job)
//   jobs         the GPU queue (jobs.mjs)
//   checkTake(file, { script, first, last })   the take checks (takecheck.mjs)
//   ffmpeg       the ffmpeg command
//   night        the night shift (nightshift.mjs)
//   access       { info(), rotate() } the phone access (access.mjs)
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

  const PICTURES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
  async function picture(folder, rel) {
    const file = projectFile(folder, rel)
    if (!file || !existsSync(file)) throw invalid(`No picture named ${rel} in the project.`)
    const mime = PICTURES[(/\.[^.]+$/.exec(file)?.[0] ?? '').toLowerCase()]
    if (!mime) throw invalid(`${rel}: a frame or reference is a PNG, JPEG or WebP picture.`)
    return { rel: relative(folder, file).split('\\').join('/'), mime, data: (await readFile(file)).toString('base64') }
  }

  async function readShot(folder, rel) {
    const text = await readText(folder, rel).catch((error) => {
      throw invalid(error.message)
    })
    try {
      const shot = JSON.parse(text.replace(/^\uFEFF/, ''))
      if (!shot || typeof shot !== 'object' || Array.isArray(shot)) throw new Error('not an object')
      return shot
    } catch (error) {
      throw invalid(`${rel} is not a shot (a JSON object): ${error.message}`)
    }
  }

  const checkLines = (checks) => checks.map((c) => `${c.level === 'error' ? '✗' : '!'} ${c.text}`)

  const jobLine = (j) => {
    const when = j.status === 'queued' ? `#${j.position} in the queue` : j.status
    const made = j.result?.file ? ` → ${j.result.file}${j.result.checks ? ` (${checkLine(j.result.checks)})` : ''}` : ''
    return `${j.id}  ${j.kind} "${j.title}"  ${when}${made}${j.error ? ` · ${j.error}` : ''}`
  }

  function queue() {
    if (!deps.jobs) throw new AgentError('failed', 'This TSRS has no GPU queue.')
    return deps.jobs
  }

  // ---- films ----
  async function readFilm(folder, file = FILM_FILE) {
    const text = await readText(folder, file).catch(() => {
      throw invalid(`No ${file} in ${basename(folder)}. Write the film plan there first (see the tsrs skill: film.json).`)
    })
    try {
      return { film: JSON.parse(text.replace(/^\uFEFF/, '')) } // a BOM: Windows editors write one
    } catch (error) {
      throw invalid(`${file} is not valid JSON: ${error.message}`)
    }
  }
  async function writeShots(folder, shots, yes) {
    const theirs = []
    for (const s of shots) {
      const path = join(folder, s.file)
      if (!existsSync(path)) continue
      try {
        if (JSON.parse(await readFile(path, 'utf8')).from !== FILM_FILE) theirs.push(s.file)
      } catch {
        theirs.push(s.file)
      }
    }
    if (theirs.length && !yes) throw confirm(`Would replace shot files not made from the film: ${theirs.join(', ')}. Add --yes to replace them.`)
    await writeFiles(folder, shots.map((s) => ({ name: s.file, content: JSON.stringify(s.shot, null, 2) + '\n' })))
  }

  // What the commands made, for `tsrs ledger`: a bot reports from this, not from memory.
  const made = []
  const remember = (command, args, out) => {
    const r = out?.result ?? {}
    const files = [r.file, ...(r.files ?? []), r.notes, r.path].filter(Boolean).map(String)
    const what = [
      args.project ? `[${args.project}]` : '',
      files.length ? files.join(', ') : '',
      r.id ? `job ${r.id}` : '',
      r.jobs ? `jobs ${r.jobs.map((j) => j.job).join(', ')}` : '',
      r.take ? `take ${r.take}${r.status ? ` → ${r.status}` : ''}` : '',
      r.title && !r.id ? `"${r.title}"` : '',
    ].filter(Boolean).join(' ')
    made.push({ at: Date.now(), command, what: what || '(done)' })
    if (made.length > 200) made.shift()
  }

  // ---- takes ----
  const TAKE_STATUS = ['approved', 'redo', 'pending']
  async function readTakes(folder) {
    let names = []
    try {
      names = (await readdir(join(folder, 'takes'))).filter((n) => n.endsWith('.json'))
    } catch {
      return []
    }
    const out = []
    for (const n of names) {
      try {
        const take = JSON.parse(await readFile(join(folder, 'takes', n), 'utf8'))
        out.push({ ...take, name: take.name ?? n.replace(/\.json$/, ''), notes: `takes/${n}`, video: take.video ?? `takes/${n.replace(/\.json$/, '.mp4')}`, at: Date.parse(take.made ?? '') || (await stat(join(folder, 'takes', n))).mtimeMs })
      } catch {
        // A file being written, or not a take.
      }
    }
    return out
  }
  const shotOf = (t) => t.shot ?? t.name.replace(/-\d+$/, '')
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true })
  // The best take of each shot: approved (the newest), else one whose checks
  // passed, else the newest not marked redo. Shots in name order.
  function bestTakes(takes) {
    const shots = new Map()
    for (const t of takes) shots.set(shotOf(t), [...(shots.get(shotOf(t)) ?? []), t])
    const rank = (t) => (t.status === 'approved' ? 3 : t.status === 'redo' ? 0 : t.checks?.passed === true ? 2 : t.checks?.passed === false ? 0.5 : 1)
    return [...shots.keys()].sort(natural).map((shot) => ({ shot, take: [...shots.get(shot)].filter((t) => rank(t) > 0.5).sort((a, b) => rank(b) - rank(a) || b.at - a.at)[0] ?? null }))
  }
  const linesOf = (prompt) => [...String(prompt ?? '').matchAll(/<d>\[([^\]]+)\]\s*([\s\S]*?)<\/d>/g)].map((m) => ({ language: m[1], text: m[2].trim() }))
  const checkLine = (c) => (!c ? 'not checked' : c.passed ? `checks passed${c.words ? ` (${c.words.matched}/${c.words.words} words)` : ''}` : `checks: ${c.reason}`)

  async function runChecks(folder, take) {
    if (!deps.checkTake) return null
    const pics = take.pictures ?? []
    const at = (rel) => (rel ? projectFile(folder, rel) : undefined)
    const first = ['first', 'first-last'].includes(take.start) ? at(pics[0]) : undefined
    const last = take.start === 'first-last' ? at(pics[1]) : take.start === 'last' ? at(pics[0]) : undefined
    return deps.checkTake(join(folder, take.video), { script: linesOf(take.prompt), first, last })
  }
  async function saveTake(folder, take) {
    const { notes, at: _at, ...rest } = take
    await writeFiles(folder, [{ name: notes, content: JSON.stringify(rest, null, 2) + '\n' }])
  }
  async function findTake(folder, ref) {
    const takes = await readTakes(folder)
    const want = String(ref ?? '').replace(/\.(json|mp4)$/i, '').replace(/^takes\//, '')
    const take = takes.find((t) => t.name === want)
    if (!take) throw invalid(`No take ${ref} in ${basename(folder)}. See: tsrs takes list ${basename(folder)}`)
    return take
  }

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
        gpuQueue: deps.jobs ? deps.jobs.list().filter((j) => ['queued', 'running', 'canceling'].includes(j.status)).length : 0,
      }
      const text = [
        `TSRS ${result.version}${result.commit ? ` (${result.commit})` : ''}`,
        `Projects folder: ${root}`,
        `Renderer: ${result.rendering ? 'rendering now' : 'ready'}`,
        `ComfyUI: ${result.comfy ? 'running' : 'not running'} · sd-server: ${result.sdcpp ? 'running' : 'not running'}`,
        `Schedule: ${result.tasks} task(s), ${result.pendingAnswers} answer(s) waiting in TSRS`,
        `GPU queue: ${result.gpuQueue ? `${result.gpuQueue} job(s) waiting or running (tsrs jobs list)` : 'empty'}`,
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

    async 'h3 prompt'(args) {
      const folder = await project(args.project)
      const shot = await readShot(folder, args.shot)
      const made = composeShot(shot)
      const checks = checkShot(shot, made.prompt)
      const text = [
        `${made.frames} frames (${made.seconds} s at 24 fps) · start: ${made.form} · ${made.prompt.length} characters`,
        '',
        made.prompt,
        ...(checks.length ? ['', ...checkLines(checks)] : ['', 'Nothing to fix.']),
      ].join('\n')
      return { text, result: { ...made, checks } }
    },

    async take(args, _yes, progress) {
      const folder = await project(args.project)
      const shot = args.shot ? await readShot(folder, args.shot) : {}
      if (!args.shot && !args.prompt) throw invalid('Give a shot file or --prompt "…".')
      const refs = args.refs ?? shot.refs ?? []
      const first = args.image ?? shot.image
      const last = args.last ?? shot.last
      // Opens on the last frame of the shot before: found when the take runs,
      // so the one before (earlier in the queue) has been made by then.
      const after = !first && !refs.length && shot.after ? String(shot.after) : null
      if (refs.length && (first || last)) throw invalid('Reference pictures do not combine with a first or last frame: give one or the other.')
      const start = refs.length ? 'reference' : (first || after) && last ? 'first-last' : first || after ? 'first' : last ? 'last' : STARTS.includes(shot.start) && !['first', 'last', 'first-last', 'reference'].includes(shot.start) ? shot.start : 'text'
      if (args.seconds !== undefined) shot.seconds = args.seconds
      let prompt
      let frames
      let checks
      if (args.prompt) {
        prompt = String(args.prompt).trim()
        frames = framesFor(shot.seconds ?? 5)
        checks = [
          ...(prompt.length > MAX_CHARS ? [{ level: 'error', text: `The prompt is ${prompt.length} characters; H3 reads at most ${MAX_CHARS}.` }] : []),
          ...findNegations(prompt).map((p) => ({ level: 'warn', text: `"${p}": H3 has no negative prompt, so naming a thing tends to bring it.` })),
        ]
      } else {
        const made = composeShot({ ...shot, start, subjects: shot.subjects ?? (refs.length ? refs.map(() => '') : undefined) })
        prompt = made.prompt
        frames = made.frames
        checks = checkShot({ ...shot, start }, prompt)
      }
      const errors = checks.filter((c) => c.level === 'error')
      if (errors.length) throw invalid(`Fix the shot first:\n${checkLines(errors).join('\n')}`)
      const resolution = String(args.resolution ?? shot.resolution ?? '540P').toUpperCase()
      const aspect = String(args.aspect ?? shot.aspect ?? '16:9')
      const pictures = []
      for (const rel of refs.length ? refs : [first, last].filter(Boolean)) pictures.push(await picture(folder, rel))
      if (pictures.length > 9) throw invalid('At most 9 reference pictures.')

      const h3 = await deps.comfy.h3Models().catch((error) => {
        throw invalid(error.message)
      })
      if (!h3.ok) throw invalid(`ComfyUI cannot make H3 takes yet: missing ${h3.missing.join(', ')}.`)

      const stem = slug(args.name || (args.shot ? basename(String(args.shot)).replace(/\.json$/i, '') : 'take')).slice(0, 48) || 'take'
      const reserved = new Set(queue().list().filter((j) => j.kind === 'take' && j.project === folder).map((j) => j.params?.name))
      let name = stem
      for (let n = 2; existsSync(join(folder, 'takes', `${name}.mp4`)) || reserved.has(name); n++) name = `${stem}-${n}`
      const params = { name, frames, seconds: secondsOf(frames), start, resolution, aspect, shot: args.shot ?? null, pictures: pictures.map((p) => p.rel), after }

      const job = queue().submit({ kind: 'take', title: name, project: folder, params }, async (_job, { signal, progress }) => {
        if (after) {
          const before = bestTakes((await readTakes(folder)).filter((t) => t.shot === after))[0]?.take
          if (!before) throw new Error(`The shot before (${after}) has no usable take: make it first, or give --image.`)
          const rel = `midia/frames/${before.name}-last.png`
          const out = projectFile(folder, rel)
          await mkdir(join(folder, 'midia', 'frames'), { recursive: true })
          const r = spawnSync(deps.ffmpeg ?? 'ffmpeg', ['-v', 'error', '-y', '-sseof', '-0.1', '-i', join(folder, before.video), '-frames:v', '1', '-update', '1', out])
          if (r.status !== 0 || !existsSync(out)) throw new Error(`Could not take the last frame of ${before.video}.`)
          pictures.unshift(await picture(folder, rel))
          params.pictures = pictures.map((p) => p.rel)
        }
        const made = await deps.comfy.makeTake({
          prompt, frames, mode: start === 'reference' ? 'reference' : 'image', role: start === 'last' ? 'last' : 'first',
          images: pictures, resolution, aspect, seed: args.seed ?? shot.seed, steps: args.steps ?? shot.steps, signal,
          onStart: (id) => progress({ comfy: id }),
        })
        const video = `takes/${name}.mp4`
        const notes = `takes/${name}.json`
        await writeFiles(folder, [
          { name: video, content: made.bytes.toString('base64'), encoding: 'base64' },
          {
            name: notes,
            content: JSON.stringify({
              status: 'pending', name, video, shot: args.shot ?? null, start, frames, seconds: secondsOf(frames), resolution, aspect,
              pictures: params.pictures, seed: made.seed, steps: made.steps, models: made.models, prompt, warnings: checks, job: _job.id,
              made: new Date().toISOString(), engine: 'MiniMax H3 (ComfyUI)',
            }, null, 2) + '\n',
          },
        ])
        await note(folder, [video, notes])
        let verdict = null
        if (String(args.check ?? 'yes') !== 'no') {
          progress({ checking: true })
          const take = (await readTakes(folder)).find((t) => t.name === name)
          try {
            verdict = take ? await runChecks(folder, take) : null
            if (verdict) await saveTake(folder, { ...take, checks: verdict, status: verdict.passed ? take.status : 'redo' })
          } catch (error) {
            verdict = { passed: null, reason: `the checks could not run: ${error.message}` }
          }
        }
        return { file: video, notes, seed: made.seed, steps: made.steps, checks: verdict }
      })

      const head = `Queued take ${job.id}: "${name}" in ${basename(folder)}, ${frames} frames (${secondsOf(frames)} s), ${resolution} ${aspect}, start ${start}.`
      const warns = checks.length ? `\n${checkLines(checks).join('\n')}` : ''
      if (Number(args.wait) > 0) {
        const tick = progress ? setInterval(() => progress({ waiting: true }), 20_000) : null
        const [after] = await queue()
          .wait([job.id], Math.min(WAIT_MAX, Number(args.wait)))
          .finally(() => tick && clearInterval(tick))
        return { text: `${head}${warns}\n${jobLine(after)}`, result: after }
      }
      return { text: `${head}${job.position > 1 ? ` #${job.position} in the queue.` : ''}${warns}\nFollow it with: tsrs jobs wait ${job.id}`, result: job }
    },

    async 'film check'(args) {
      const folder = await project(args.project)
      const { film } = await readFilm(folder, args.file)
      const report = checkFilm(film, { exists: (rel) => { const f = projectFile(folder, rel); return !!f && existsSync(f) } })
      return { text: describeFilm(report), result: report }
    },

    async 'film shots'(args, yes) {
      const folder = await project(args.project)
      const { film } = await readFilm(folder, args.file)
      const shots = filmShots(film, { scenes: args.scenes, shots: args.shots })
      if (!shots.length) throw invalid('No shots match. See: tsrs film check ' + basename(folder))
      await writeShots(folder, shots, yes)
      return { text: `Wrote ${shots.length} shot file(s): ${shots.map((s) => s.file).join(', ')}`, result: { files: shots.map((s) => s.file) } }
    },

    async 'film take'(args, yes) {
      const folder = await project(args.project)
      const { film } = await readFilm(folder, args.file)
      const report = checkFilm(film, { exists: (rel) => { const f = projectFile(folder, rel); return !!f && existsSync(f) } })
      if (!report.ok) throw invalid(`Fix film.json first:\n${describeFilm(report)}`)
      const shots = filmShots(film, { scenes: args.scenes, shots: args.shots })
      if (!shots.length) throw invalid('No shots match. See: tsrs film check ' + basename(folder))
      await writeShots(folder, shots, yes)
      const jobs = []
      for (const s of shots) {
        const queued = await run.take({ project: args.project, shot: s.file })
        jobs.push({ shot: s.file, job: queued.result.id, name: queued.result.params?.name })
      }
      return {
        text: `Queued ${jobs.length} take(s):\n${jobs.map((j) => `${j.job}  ${j.shot} → takes/${j.name}.mp4`).join('\n')}\nFollow them with: tsrs jobs wait ${jobs.map((j) => j.job).join(',')}`,
        result: { jobs },
      }
    },

    async 'night plan'(args) {
      if (!deps.night) throw new AgentError('failed', 'This TSRS has no night shift.')
      const folder = await project(args.project)
      let shots
      const named = (args.shots ?? []).filter((s) => /\.json$/i.test(s))
      if (named.length && named.length === (args.shots ?? []).length) {
        for (const rel of named) await readShot(folder, rel)
        shots = named
      } else {
        const { film } = await readFilm(folder)
        const report = checkFilm(film, { exists: (rel) => { const f = projectFile(folder, rel); return !!f && existsSync(f) } })
        if (!report.ok) throw invalid(`Fix film.json first:\n${describeFilm(report)}`)
        const made = filmShots(film, { scenes: args.scenes, shots: args.shots })
        if (!made.length) throw invalid('No shots match.')
        await writeShots(folder, made, false)
        shots = made.map((m) => m.file)
      }
      const plan = await deps.night.plan({ project: basename(folder), folder, shots, start: String(args.start ?? 'idle') }).catch((error) => {
        throw invalid(error.message)
      })
      const when = plan.start === 'now' ? 'now' : plan.start === 'idle' ? 'when the computer has been idle for 2 minutes' : `at ${plan.start}`
      return { text: `Night shift ${plan.id}: ${shots.length} shot(s) of ${basename(folder)}, starting ${when}. The dailies will be in dailies/.\nSee: tsrs night status`, result: plan }
    },

    async 'night status'() {
      if (!deps.night) throw new AgentError('failed', 'This TSRS has no night shift.')
      const plan = await deps.night.read()
      if (!plan) return { text: 'No night shift planned.', result: null }
      const head = plan.canceled
        ? `Night shift ${plan.id} (${plan.project}): canceled.`
        : plan.ended
          ? `Night shift ${plan.id} (${plan.project}): ended ${plan.ended.slice(0, 16).replace('T', ' ')}.`
          : plan.started
            ? `Night shift ${plan.id} (${plan.project}): running since ${plan.started.slice(0, 16).replace('T', ' ')}.`
            : `Night shift ${plan.id} (${plan.project}): waiting to start (${plan.start}).`
      const rows = plan.items.map((i) => `  ${i.shot}  ${i.state}${i.take ? ` → takes/${i.take}.mp4` : ''}${i.passed === false ? ` · ${i.reason ?? 'checks failed'}` : i.passed ? ' · passed' : ''}${i.error ? ` · ${i.error}` : ''}`)
      const dailies = plan.dailies?.reel || plan.dailies?.notes ? `\nDailies: ${[plan.dailies.reel, plan.dailies.notes].filter(Boolean).join(', ')}` : plan.dailies?.error ? `\nThe dailies failed: ${plan.dailies.error}` : ''
      return { text: `${head}\n${rows.join('\n')}${dailies}`, result: plan }
    },

    async 'night cancel'() {
      if (!deps.night) throw new AgentError('failed', 'This TSRS has no night shift.')
      const plan = await deps.night.cancel()
      return { text: plan ? `Canceled the night shift ${plan.id}.` : 'No night shift was running.', result: plan }
    },

    async access() {
      if (!deps.access) throw new AgentError('failed', 'This TSRS has no phone access.')
      const a = await deps.access.info()
      const lines = [
        a.tailscale
          ? `1. On this computer, once: tailscale serve --bg ${a.port}`
          : `1. Install Tailscale on this computer and the phone, signed in to the same account; then, once: tailscale serve --bg ${a.port}`,
        `2. On the phone (in Tailscale), open once: https://${a.tailscale ?? '<this computer>.<your tailnet>.ts.net'}/?key=${a.key}`,
        '   The key is kept by the phone after that. Keep the link to yourself; tsrs access rotate makes a new one.',
        `Notifications: on the phone, TSRS > Settings > Security > "Notify me on this device" (${a.devices} device(s) so far).`,
      ]
      return { text: lines.join('\n'), result: a }
    },

    async 'access rotate'(_args, yes) {
      if (!deps.access) throw new AgentError('failed', 'This TSRS has no phone access.')
      if (!yes) throw confirm('Would make a new key: every phone opened with the old link is signed out. Add --yes to do it.')
      await deps.access.rotate()
      return { text: 'New key made. See the new link with: tsrs access', result: { rotated: true } }
    },

    async ledger(args) {
      const since = Date.now() - Math.max(1, Number(args.minutes ?? 120)) * 60_000
      const rows = made.filter((m) => m.at >= since)
      const text = rows.length
        ? rows.map((m) => `${new Date(m.at).toISOString().slice(11, 19)}  ${m.command}  ${m.what}`).join('\n')
        : 'Nothing was made or changed by the commands in that time.'
      return { text: `What TSRS's records say was made:\n${text}`, result: rows }
    },

    async turnaround(args) {
      const folder = await project(args.project)
      const pic = await picture(folder, args.picture)
      if (!deps.comfy.turnaroundModels) throw new AgentError('failed', 'This TSRS cannot make turnarounds.')
      const ready = await deps.comfy.turnaroundModels().catch((error) => {
        throw invalid(error.message)
      })
      if (!ready.ok) throw invalid(`ComfyUI cannot make turnarounds yet. Install, then restart ComfyUI:\n- ${ready.missing.join('\n- ')}`)
      const stem = slug(args.name || basename(String(args.picture)).replace(/\.[^.]+$/, '')).slice(0, 40) || 'turnaround'
      const job = queue().submit({ kind: 'turnaround', title: stem, project: folder, params: { name: stem, picture: pic.rel } }, async (_job, { signal }) => {
        const made = await deps.comfy.makeTurnaround({ image: pic, size: args.size, strength: args.strength, seed: args.seed, signal })
        const files = [
          { name: `midia/${stem}-sheet.png`, content: made.sheet.toString('base64'), encoding: 'base64' },
          ...made.views.map((v, i) => ({ name: `midia/${stem}-view${i + 1}.png`, content: v.toString('base64'), encoding: 'base64' })),
        ]
        await writeFiles(folder, files)
        await note(folder, files.map((f) => f.name))
        return { file: files[0].name, files: files.map((f) => f.name), seed: made.seed }
      })
      return {
        text: `Queued turnaround ${job.id}: five views of ${pic.rel}, into midia/${stem}-view1..5.png and midia/${stem}-sheet.png.\nThen add the views you like to the character's pictures in film.json.\nFollow it with: tsrs jobs wait ${job.id}`,
        result: job,
      }
    },

    async 'takes list'(args) {
      const folder = await project(args.project)
      const takes = (await readTakes(folder)).sort((a, b) => natural(a.name, b.name))
      if (!takes.length) return { text: `No takes yet in ${basename(folder)}.`, result: { takes: [], best: [] } }
      const best = bestTakes(takes)
      const chosen = new Set(best.map((b) => b.take?.name).filter(Boolean))
      const text = takes
        .map((t) => `${chosen.has(t.name) ? '★' : ' '} ${t.name}  ${t.status ?? 'pending'} · ${t.seconds ?? '?'} s · seed ${t.seed ?? '?'} · ${checkLine(t.checks)}`)
        .join('\n')
      return { text: `${text}\n★ best take of its shot`, result: { takes, best: best.map((b) => ({ shot: b.shot, take: b.take?.name ?? null })) } }
    },

    async 'takes check'(args) {
      const folder = await project(args.project)
      const take = await findTake(folder, args.take)
      if (!deps.checkTake) throw new AgentError('failed', 'This TSRS cannot check takes.')
      const checks = await runChecks(folder, take)
      const status = take.status === 'approved' ? 'approved' : checks.passed ? (take.status === 'redo' ? 'pending' : take.status ?? 'pending') : 'redo'
      await saveTake(folder, { ...take, checks, status })
      const window = checks.shot?.window && !checks.shot.window.whole ? `\nTrim to ${checks.shot.window.in}–${checks.shot.window.out} s (no cut inside).` : ''
      const heard = checks.words ? `\nHeard: "${checks.words.heard}"` : ''
      return { text: `${take.name}: ${checkLine(checks)} → ${status}${heard}${window}`, result: { take: take.name, status, checks } }
    },

    async 'takes rate'(args) {
      const folder = await project(args.project)
      const status = String(args.status).toLowerCase()
      if (!TAKE_STATUS.includes(status)) throw invalid('status is approved, redo or pending.')
      const take = await findTake(folder, args.take)
      await saveTake(folder, { ...take, status })
      return { text: `${take.name} → ${status}`, result: { take: take.name, status } }
    },

    async 'edit export'(args) {
      const folder = await project(args.project)
      const takes = await readTakes(folder)
      let chosen
      if (args.takes?.length) chosen = await Promise.all(args.takes.map((t) => findTake(folder, t)))
      else {
        const best = bestTakes(takes)
        const missing = best.filter((b) => !b.take).map((b) => b.shot)
        if (missing.length) throw invalid(`No usable take for: ${missing.join(', ')} (all marked redo or failed). Make another, or name the takes with --takes.`)
        chosen = best.map((b) => b.take)
      }
      if (!chosen.length) throw invalid(`No takes in ${basename(folder)}.`)
      const ffmpeg = deps.ffmpeg ?? 'ffmpeg'
      const clips = chosen.map((t) => {
        const file = join(folder, t.video)
        if (!existsSync(file)) throw invalid(`The video of ${t.name} (${t.video}) is not there.`)
        const info = probe(file, ffmpeg)
        const w = t.checks?.shot?.window
        return { file, name: t.name, in: w && !w.whole ? w.in : 0, out: w && !w.whole ? w.out : info.duration, info }
      })
      let music = null
      if (args.music) {
        const file = projectFile(folder, args.music)
        if (!file || !existsSync(file)) throw invalid(`No file named ${args.music} in the project.`)
        music = { file, info: probe(file, ffmpeg) }
      }
      const name = slug(args.name || 'cut') || 'cut'
      const files = [
        { name: `exports/${name}.fcpxml`, content: fcpxml(clips, { name, music }) },
        { name: `exports/${name}.edl`, content: edl(clips, { name }) },
      ]
      if (String(args.zip ?? 'yes') !== 'no') files.push({ name: `exports/${name}-resolve.zip`, content: resolveZip(clips, { name, music }).toString('base64'), encoding: 'base64' })
      await writeFiles(folder, files)
      await note(folder, files.map((f) => f.name))
      const total = clips.reduce((s, c) => s + (c.out - c.in), 0)
      const trimmed = clips.filter((c) => c.in > 0 || c.out < c.info.duration - 0.05).map((c) => c.name)
      return {
        text: `Exported ${clips.length} take(s), ${total.toFixed(1)} s: ${files.map((f) => f.name).join(', ')}.${trimmed.length ? ` Trimmed to the stretch without cuts: ${trimmed.join(', ')}.` : ''}\nIn Resolve: File > Import > Timeline > ${name}.fcpxml.`,
        result: { files: files.map((f) => f.name), takes: clips.map((c) => ({ take: c.name, in: c.in, out: c.out })), seconds: total },
      }
    },

    async 'jobs list'() {
      const jobs = queue().list()
      return { text: jobs.length ? jobs.map(jobLine).join('\n') : 'The GPU queue is empty.', result: jobs }
    },

    async 'jobs status'(args) {
      const job = queue().get(args.job)
      if (!job) throw invalid(`No job ${args.job}. See: tsrs jobs list`)
      return { text: jobLine(job), result: job }
    },

    async 'jobs wait'(args, _yes, progress) {
      const seconds = Math.min(WAIT_MAX, args.seconds ?? 50)
      const tick = progress ? setInterval(() => progress({ waiting: true }), 20_000) : null
      try {
        const jobs = await queue().wait(args.jobs, seconds).catch((error) => {
          throw invalid(error.message)
        })
        const open = jobs.filter((j) => ['queued', 'running', 'canceling'].includes(j.status)).length
        return { text: `${jobs.map(jobLine).join('\n')}${open ? `\n${open} still going after ${seconds} s; wait again.` : ''}`, result: jobs }
      } finally {
        if (tick) clearInterval(tick)
      }
    },

    async 'jobs cancel'(args) {
      let job
      try {
        job = queue().cancel(args.job)
      } catch (error) {
        throw invalid(error.message)
      }
      return { text: jobLine(job), result: job }
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

  // A call that was refused for its arguments is not sent again unchanged: a
  // small model may repeat it forever. The same call is answered with the
  // same refusal and what to do, for 2 minutes.
  const refused = new Map()
  const REFUSED_MS = 2 * 60_000

  // Runs one command; errors carry a code: invalid, confirm, busy or failed.
  return async function runCommand(name, args = {}, yes = false, progress) {
    const command = findCommand(name)
    if (!command) throw invalid(`No command "${name}". See: tsrs --help`)
    checkArgs(command, args)
    const key = `${name} ${JSON.stringify(args)} ${yes}`
    const before = refused.get(key)
    if (before && Date.now() - before.at < REFUSED_MS) {
      throw invalid(`This exact call was refused a moment ago: ${before.message}\nDo not repeat it: change what made it fail (the arguments, the files), or ask the user.`)
    }
    // destructive and cost commands check `yes` themselves, after saying
    // exactly what they would do.
    try {
      const out = await run[name](args, yes, progress)
      refused.delete(key)
      if (command.kind !== 'read') {
        remember(name, args, out)
        // Something changed: a call refused before may be right now.
        refused.clear()
      }
      return out
    } catch (error) {
      if (error?.code === 'invalid') refused.set(key, { at: Date.now(), message: error.message })
      for (const [k, v] of refused) if (Date.now() - v.at > REFUSED_MS) refused.delete(k)
      throw error
    }
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
    // Long answers stream lines of JSON, so no client gives up waiting for headers.
    const streaming = ['render motion', 'video run', 'jobs wait', 'take'].includes(job.command)
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
