#!/usr/bin/env node
// The agent bench: how well an agent directs TSRS — Claude Code, Codex, or a
// bot (OpenMausBot's Nori) — measured the same way for all.
//
//   node bench/run.mjs --agent claude [--model sonnet] [--brief one-take,line-pt]
//   node bench/run.mjs --agent codex
//   node bench/run.mjs --agent command --command "node my-bot.mjs"   (the brief on stdin)
//
// Each brief of bench/briefs.json runs against a dry TSRS: the real commands,
// project folders and checks, but takes are made in an instant (a placeholder
// video), so nothing touches the GPU, ComfyUI or your real projects. The
// agent reaches it through the tsrs MCP server (claude, codex) or the tsrs
// command (any bot that can run it), found through TSRS_EXTENSIONS.
//
// Scores, per brief:
//   complete  everything the brief asked for was made
//   exact     nothing else, with the asked settings (lengths, frames, lines)
//   honest    the reply names only files that exist, and every take made
// plus the calls, the refused ones and the time. Results go to bench/results/.
//
// After the agent bench of Imagination Studio (Keys, Sam Wasserman; Apache-2.0):
// see CREDITS.md.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentHandler, createAgent, writeAgentFile } from '../server/agent.mjs'
import { STUDIO_GUARD } from '../server/cli.mjs'
import { checkFilm } from '../server/film.mjs'
import { createQueue } from '../server/jobs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==', 'base64')
const WRITES_FOR_TAKES = new Set(['take', 'film take', 'film shots', 'projects write', 'projects new', 'takes check', 'takes rate', 'jobs cancel'])

export function parseArgs(argv) {
  const out = { agent: 'claude', briefs: null, model: '', command: '', timeout: 600, out: join(HERE, 'results') }
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = [argv[i], argv[i + 1]]
    if (k === '--agent') (out.agent = v), i++
    else if (k === '--brief' || k === '--briefs') (out.briefs = v.split(',')), i++
    else if (k === '--model') (out.model = v), i++
    else if (k === '--command') (out.command = v), i++
    else if (k === '--timeout') (out.timeout = Number(v)), i++
    else if (k === '--out') (out.out = resolve(v)), i++
    else if (k === '--help' || k === '-h') out.help = true
  }
  return out
}

let clipCache = null
function placeholderClip(dir) {
  if (clipCache) return clipCache
  const file = join(dir, 'placeholder.mp4')
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=24:d=1', '-f', 'lavfi', '-i', 'sine=d=1', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file])
  if (r.status !== 0) throw new Error('ffmpeg is needed for the bench (a placeholder video).')
  clipCache = readFileSync(file)
  return clipCache
}

// A fresh dry TSRS for one brief: folders, files, the agent server and its log.
export async function dryStudio(brief) {
  const base = await mkdtemp(join(tmpdir(), `tsrs-bench-${brief.id}-`))
  const root = join(base, 'projetos')
  const ext = join(base, 'ext')
  await mkdir(root, { recursive: true })
  for (const p of brief.setup?.projects ?? []) await mkdir(join(root, p), { recursive: true })
  const clip = placeholderClip(base)
  for (const [rel, content] of Object.entries(brief.setup?.files ?? {})) {
    const file = join(root, rel)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content === 'png' ? PNG : content === 'mp4' ? clip : typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  }
  const jobs = createQueue()
  const calls = []
  const runCommand = createAgent(
    {
      agenda: { list: async () => ({ tasks: [], pending: 0 }), runNow: async () => {} },
      version: () => ({ version: 'bench', commit: '' }),
      renderBusy: () => false,
      exclusiveRender: (work) => work(),
      renderMotion: async () => {
        throw new Error('Rendering motion is not part of the bench.')
      },
      renderFolder: join(base, 'videos'),
      inspectPage: async () => ({ findings: [], text: 'Nothing out of place.', images: [] }),
      log: () => {},
      jobs,
      ffmpeg: 'ffmpeg',
      checkTake: async () => ({ passed: true, reason: '', shot: { cuts: [], window: { whole: true, in: 0, out: 1 } }, words: null, checked: new Date().toISOString() }),
      comfy: {
        status: async () => ({ ok: true }),
        makeImage: async () => ({ mime: 'image/png', data: PNG.toString('base64'), seed: 1, model: 'bench' }),
        h3Models: async () => ({ ok: true, missing: [], models: {} }),
        makeTake: async (job) => {
          await new Promise((r) => setTimeout(r, 100))
          return { bytes: clip, seed: job.seed ?? 1, steps: 4, models: { unet: 'bench' } }
        },
      },
      sdcpp: { status: async () => ({ error: 'off' }), makeImage: async () => null },
    },
    root,
  )
  const logged = async (name, args, yes, progress) => {
    const call = { name, args, yes, at: Date.now() }
    calls.push(call)
    try {
      const out = await runCommand(name, args, yes, progress)
      call.ok = true
      return out
    } catch (error) {
      call.ok = false
      call.code = error?.code ?? 'failed'
      call.error = error?.message
      throw error
    }
  }
  let token = null
  const handle = agentHandler(logged, () => token)
  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/__tsrs/agent')) return res.writeHead(404).end()
    req.url = req.url.slice('/__tsrs/agent'.length) || '/'
    if (!(await handle(req, res))) res.writeHead(404).end()
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  token = await writeAgentFile(`http://127.0.0.1:${server.address().port}`, ext)
  return { base, root, ext, jobs, calls, close: () => new Promise((ok) => server.close(ok)) }
}

const skill = () => readFileSync(join(ROOT, 'skills', 'tsrs', 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\n/, '')

// How to start each agent: [command, args, stdin].
export function agentCommand(opts, studio, prompt) {
  const system = `${STUDIO_GUARD}\n\n${skill()}`
  const mcp = { mcpServers: { tsrs: { command: process.execPath, args: [join(ROOT, 'bin', 'tsrs.mjs'), 'mcp'], env: { TSRS_EXTENSIONS: studio.ext } } } }
  if (opts.agent === 'claude') {
    return {
      file: 'claude',
      args: ['-p', '--output-format', 'text', '--restricted', '--tools', 'Read,Glob', '--mcp-config', JSON.stringify(mcp), '--strict-mcp-config', '--allowedTools', 'mcp__tsrs', '--append-system-prompt', system, ...(opts.model ? ['--model', opts.model] : [])],
      input: prompt,
    }
  }
  if (opts.agent === 'codex') {
    const t = mcp.mcpServers.tsrs
    const slash = (p) => p.split('\\').join('/')
    return {
      file: 'codex',
      args: [
        'exec', '--skip-git-repo-check', '-c', 'sandbox_mode=read-only',
        '-c', `mcp_servers.tsrs.command=${JSON.stringify(slash(t.command))}`,
        '-c', `mcp_servers.tsrs.args=${JSON.stringify(t.args.map(slash))}`,
        '-c', `mcp_servers.tsrs.env={ TSRS_EXTENSIONS = ${JSON.stringify(slash(studio.ext))} }`,
        '-c', 'mcp_servers.tsrs.default_tools_approval_mode="approve"',
        ...(opts.model ? ['-m', opts.model] : []), '-',
      ],
      input: `${system}\n\n---\n\n${prompt}`,
    }
  }
  if (!opts.command) throw new Error('--agent command needs --command "…" (the brief goes on stdin).')
  return { file: opts.command, args: [], input: `${system}\n\n---\n\n${prompt}`, shell: true }
}

function runAgent(spec, studio, timeoutMs) {
  return new Promise((done) => {
    const env = { ...process.env, TSRS_EXTENSIONS: studio.ext, TSRS_BENCH: '1' }
    const shell = spec.shell || process.platform === 'win32'
    const quote = (a) => (/^[\w./:=@,+-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`)
    const child = shell ? spawn([spec.file, ...spec.args.map(quote)].join(' '), { cwd: studio.base, env, shell: true, windowsHide: true }) : spawn(spec.file, spec.args, { cwd: studio.base, env, windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
      else child.kill('SIGTERM')
      err += '\n[bench] timed out'
    }, timeoutMs)
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('error', (e) => (err += String(e)))
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ code, reply: out.trim(), stderr: err.trim().slice(-2000) })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(spec.input)
  })
}

const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`)
async function filesUnder(dir, prefix = '') {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await filesUnder(join(dir, e.name), rel)))
    else out.push(rel)
  }
  return out
}

// The three scores of one brief, with the reasons.
export async function score(brief, studio, reply) {
  const expect = brief.expect ?? {}
  const miss = []
  const extra = []
  const lies = []
  const jobs = studio.jobs.list()
  const takes = jobs.filter((j) => j.kind === 'take')
  const ok = studio.calls.filter((c) => c.ok)
  // complete + exact: the takes
  for (const want of expect.jobs ?? []) {
    const mine = takes.filter((j) => !want.project || j.project.endsWith(want.project))
    const done = mine.filter((j) => j.status === 'done')
    if (done.length < want.n) miss.push(`${want.n} take(s) in ${want.project}, ${done.length} made`)
    if (mine.length > want.n) extra.push(`${mine.length} takes for ${want.n} asked`)
    for (const j of mine) {
      const p = j.params ?? {}
      if (want.seconds && !(p.seconds >= want.seconds[0] && p.seconds <= want.seconds[1])) extra.push(`${p.name}: ${p.seconds} s, asked ${want.seconds.join('–')} s`)
      if (want.start && p.start !== want.start) extra.push(`${p.name}: starts "${p.start}", asked "${want.start}"`)
      for (const pic of want.pictures ?? []) if (!(p.pictures ?? []).includes(pic)) extra.push(`${p.name}: does not open on ${pic}`)
    }
  }
  if (!(expect.jobs ?? []).length && takes.length) extra.push(`${takes.length} take(s) nobody asked for`)
  const prompts = await Promise.all(
    takes.filter((j) => j.status === 'done').map(async (j) => JSON.parse(await readFile(join(j.project, 'takes', `${j.params.name}.json`), 'utf8')).prompt ?? ''),
  )
  if (expect.noLines && prompts.some((p) => p.includes('<d>'))) extra.push('lines in a take asked without dialogue')
  for (const words of expect.linesHave ?? []) if (!prompts.some((p) => /<d>[\s\S]*<\/d>/.test(p) && p.toLowerCase().includes(words.toLowerCase()))) miss.push(`a line with "${words}"`)
  if (expect.language && !prompts.some((p) => p.includes(`<d>[${expect.language}]`))) extra.push(`lines not marked [${expect.language}]`)
  // commands
  for (const want of expect.commands ?? []) {
    const hits = ok.filter((c) => c.name === want.name && Object.entries(want.args ?? {}).every(([k, v]) => String(c.args?.[k]) === String(v)))
    if (hits.length < want.n) miss.push(`${want.name}${want.args ? ` ${JSON.stringify(want.args)}` : ''}`)
  }
  const allowed = new Set([...(expect.commands ?? []).map((c) => c.name), ...((expect.jobs ?? []).length ? WRITES_FOR_TAKES : [])])
  for (const c of ok) {
    const kind = c.name.split(' ')[0]
    const read = ['status', 'projects list', 'projects files', 'projects read', 'h3 prompt', 'film check', 'takes list', 'jobs list', 'jobs status', 'jobs wait', 'ledger', 'board list', 'agenda list', 'video check'].includes(c.name)
    if (!read && !allowed.has(c.name) && !(kind === 'projects' && c.name === 'projects write' && (expect.jobs ?? []).length)) extra.push(`ran ${c.name}`)
  }
  // files
  for (const pattern of expect.files ?? []) {
    const project = brief.setup?.projects?.[0] ?? ''
    const files = await filesUnder(join(studio.root, project))
    if (!files.some((f) => glob(pattern).test(f))) miss.push(`a file ${pattern}`)
  }
  if (expect.filmValid) {
    const project = brief.setup.projects[0]
    let film = null
    try {
      film = JSON.parse(await readFile(join(studio.root, project, 'film.json'), 'utf8'))
    } catch {
      // missing or broken
    }
    if (!film || !checkFilm(film).ok) miss.push('film.json passing the check')
  }
  for (const pattern of expect.replyHas ?? []) if (!new RegExp(pattern, 'i').test(reply)) miss.push(`the reply saying /${pattern}/`)
  // honest: named files exist; every take made is named
  const all = (await Promise.all((brief.setup?.projects ?? []).map(async (p) => (await filesUnder(join(studio.root, p))).map((f) => f)))).flat()
  for (const m of reply.matchAll(/\b((?:takes|exports|shots|midia)\/[\w./-]+\.(?:mp4|json|fcpxml|edl|zip|png))\b/g)) if (!all.includes(m[1])) lies.push(`names ${m[1]}, which does not exist`)
  for (const j of takes.filter((t) => t.status === 'done')) if (!reply.includes(j.params.name)) lies.push(`does not mention the take ${j.params.name}`)
  return {
    complete: miss.length === 0,
    exact: miss.length === 0 && extra.length === 0,
    honest: lies.length === 0,
    miss, extra, lies,
    calls: studio.calls.length,
    refused: studio.calls.filter((c) => !c.ok && c.code === 'invalid').length,
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    return
  }
  const { briefs } = JSON.parse(readFileSync(join(HERE, 'briefs.json'), 'utf8'))
  const chosen = briefs.filter((b) => !opts.briefs || opts.briefs.includes(b.id))
  const results = []
  for (const brief of chosen) {
    const studio = await dryStudio(brief)
    const started = Date.now()
    const ran = await runAgent(agentCommand(opts, studio, brief.brief), studio, opts.timeout * 1000)
    // Let queued takes finish.
    const open = studio.jobs.list().filter((j) => ['queued', 'running'].includes(j.status)).map((j) => j.id)
    if (open.length) await studio.jobs.wait(open, 30)
    const s = await score(brief, studio, ran.reply)
    results.push({ brief: brief.id, ...s, seconds: Math.round((Date.now() - started) / 100) / 10, exit: ran.code, reply: ran.reply.slice(0, 4000), stderr: ran.stderr })
    await studio.close()
    const mark = (b) => (b ? '✓' : '✗')
    console.log(`${brief.id.padEnd(14)} complete ${mark(s.complete)}  exact ${mark(s.exact)}  honest ${mark(s.honest)}  ${s.calls} calls (${s.refused} refused)  ${results.at(-1).seconds} s`)
    for (const line of [...s.miss.map((m) => `missing: ${m}`), ...s.extra.map((m) => `extra: ${m}`), ...s.lies.map((m) => `honesty: ${m}`)]) console.log(`    ${line}`)
  }
  const pct = (k) => Math.round((results.filter((r) => r[k]).length / Math.max(1, results.length)) * 100)
  console.log(`\n${opts.agent}${opts.model ? ` (${opts.model})` : ''}: complete ${pct('complete')} % · exact ${pct('exact')} % · honest ${pct('honest')} % over ${results.length} brief(s)`)
  await mkdir(opts.out, { recursive: true })
  const file = join(opts.out, `${opts.agent}${opts.model ? `-${opts.model}` : ''}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`)
  await writeFile(file, JSON.stringify({ agent: opts.agent, model: opts.model, command: opts.command, at: new Date().toISOString(), results }, null, 2))
  console.log(`Results: ${file}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`bench: ${error.message}`)
    process.exit(1)
  })
}
