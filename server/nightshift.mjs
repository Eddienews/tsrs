// The night shift: the takes of a film (or of some shots) made unattended —
// tonight at 23:00, as soon as the computer is idle, or now — and the dailies
// waiting in the morning: one reel with a slate before each take (its name,
// seed and whether it passed the checks) and notes with the takes to look at
// first.
//
// The plan is a file (<projects folder>/.tsrs-night.json) read again on every
// tick, so a restart of TSRS picks the shift up where it was: a take that was
// made counts as made, one that was lost is queued again. At most `ahead` of
// the shift's takes wait in the GPU queue at a time, so other work still fits.
//
// After the night shift of Imagination Studio (Keys, Sam Wasserman;
// Apache-2.0): see CREDITS.md.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ffprobePath } from '../render/words.mjs'

export const NIGHT_FILE = '.tsrs-night.json'
export const IDLE_AFTER_MS = 2 * 60_000
export const AHEAD = 2

// When the shift may start: { ok, why }.
export function startDue(plan, { now = Date.now(), idleSince = null } = {}) {
  const start = String(plan.start ?? 'idle')
  if (start === 'now') return { ok: true }
  if (start === 'idle') {
    const idle = idleSince !== null && now - idleSince >= IDLE_AFTER_MS
    return { ok: idle, why: 'waiting for the computer to be idle for 2 minutes' }
  }
  const at = startTime(start, plan.created ?? now)
  return { ok: now >= at, why: `starts at ${new Date(at).toLocaleString('en-GB')}` }
}

// "23:00" is the next 23:00 after the plan was made; an ISO date is itself.
export function startTime(start, created) {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(String(start))
  if (!hm) {
    const t = Date.parse(start)
    if (!Number.isFinite(t)) throw new Error(`start is now, idle, a time like 23:00 or a date; not "${start}".`)
    return t
  }
  const d = new Date(created)
  d.setHours(Number(hm[1]), Number(hm[2]), 0, 0)
  if (d.getTime() <= created) d.setDate(d.getDate() + 1)
  return d.getTime()
}

const FONTS = ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf']
const fontFile = () => FONTS.find((f) => existsSync(f))
// drawtext's own escaping, and the font path's (C: is not an option separator).
const drawText = (t) => String(t).replace(/\\/g, '\\\\\\\\').replace(/'/g, '’').replace(/:/g, '\\:').replace(/%/g, '\\%')

// The dailies: a reel of every take with a slate before it, and the notes.
export async function makeDailies(items, { folder, name, ffmpeg = 'ffmpeg', date = new Date() } = {}) {
  await mkdir(join(folder, 'dailies'), { recursive: true })
  const work = join(folder, 'dailies', `.${name}-work`)
  await mkdir(work, { recursive: true })
  const font = fontFile()
  const parts = []
  const made = items.filter((i) => i.take && existsSync(join(folder, 'takes', `${i.take}.mp4`)))
  for (const [k, item] of made.entries()) {
    const verdict = item.passed === true ? 'PASS' : item.passed === false ? 'LOOK AT IT' : 'not checked'
    const lines = [`${item.shot.replace(/^shots\//, '').replace(/\.json$/, '')}  -  take ${item.take}`, `seed ${item.seed ?? '?'}  -  ${verdict}`]
    const card = join(work, `card-${k}.mp4`)
    const text = font
      ? lines.map((l, i) => `drawtext=fontfile='${drawText(font)}':text='${drawText(l)}':fontcolor=${i === 1 && item.passed === false ? '0xff6b6b' : 'white'}:fontsize=${i ? 34 : 44}:x=(w-text_w)/2:y=(h/2)-60+${i * 80}`).join(',')
      : 'null'
    run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=0x0b0d12:s=1280x720:r=24:d=1.5', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '1.5', '-vf', text, ...encode, card])
    const clip = join(work, `take-${k}.mp4`)
    const src = join(folder, 'takes', `${item.take}.mp4`)
    const hasAudio = spawnSync(ffprobePath(ffmpeg), ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', src], { encoding: 'utf8' }).stdout.trim()
    run(ffmpeg, [
      '-i', src,
      ...(hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0b0d12,fps=24,setsar=1',
      ...(hasAudio ? [] : ['-shortest']),
      ...encode, clip,
    ])
    parts.push(card, clip)
  }
  let reel = null
  if (parts.length) {
    const list = join(work, 'list.txt')
    await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
    reel = `dailies/${name}.mp4`
    run(ffmpeg, ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', join(folder, reel)])
  }
  await rm(work, { recursive: true, force: true })

  const look = items.filter((i) => i.passed === false || i.state === 'failed')
  const fine = items.filter((i) => !look.includes(i))
  const line = (i) =>
    i.state === 'failed'
      ? `- ${i.shot} — no take: ${i.error ?? 'failed'}`
      : `- ${i.shot} — takes/${i.take}.mp4 (seed ${i.seed ?? '?'})${i.passed === false ? ` — ${i.reason ?? 'the checks failed'}` : i.passed === true ? ' — passed' : ' — not checked'}`
  const notes = [
    `# Dailies — ${date.toISOString().slice(0, 10)}`,
    '',
    `${made.length} take(s) made of ${items.length} shot(s)${reel ? `; the reel: ${reel}` : ''}.`,
    '',
    `## To look at (${look.length})`,
    '',
    ...(look.length ? look.map(line) : ['Nothing: every take passed or was not checked.']),
    '',
    `## Passed or not checked (${fine.length})`,
    '',
    ...fine.map(line),
    '',
    'Approve the ones to use with: tsrs takes rate <project> <take> approved',
    '',
  ].join('\n')
  const notesFile = `dailies/${name}.md`
  await writeFile(join(folder, notesFile), notes)
  return { reel, notes: notesFile, made: made.length, toLook: look.length }
}

const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-y', '-v', 'error']
function run(ffmpeg, args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr ?? '').slice(-600)}`)
}

// The shift. `run(name, args)` is the agent's runCommand; `queue` the GPU queue.
export function createNightShift({ root, run: runCommand, queue, ffmpeg = 'ffmpeg', notify = async () => {}, log = () => {}, now = () => Date.now() }) {
  const file = join(root, NIGHT_FILE)
  let idleSince = null
  let ticking = false

  async function read() {
    try {
      return JSON.parse(await readFile(file, 'utf8'))
    } catch {
      return null
    }
  }
  async function save(plan) {
    await mkdir(root, { recursive: true })
    await writeFile(`${file}.tmp`, JSON.stringify(plan, null, 2))
    await rename(`${file}.tmp`, file)
  }

  async function tick() {
    if (ticking) return
    ticking = true
    try {
      idleSince = queue.busy() ? null : (idleSince ?? now())
      const plan = await read()
      if (!plan || plan.ended || plan.canceled) return
      if (!plan.started) {
        const due = startDue(plan, { now: now(), idleSince })
        if (!due.ok) return
        plan.started = new Date(now()).toISOString()
        log(`Night shift ${plan.id}: started, ${plan.items.length} shot(s).`)
      }
      const folder = plan.folder
      for (const item of plan.items.filter((i) => i.state === 'queued')) {
        const job = queue.get(item.job)
        if (!job) {
          // TSRS restarted: the take is there or it is not.
          if (item.take && existsSync(join(folder, 'takes', `${item.take}.mp4`))) item.state = 'done'
          else Object.assign(item, { state: 'waiting', job: null })
        } else if (job.status === 'done') {
          item.state = 'done'
          item.take = job.result?.file?.replace(/^takes\//, '').replace(/\.mp4$/, '') ?? item.take
          item.seed = job.result?.seed
          item.passed = job.result?.checks?.passed ?? null
          item.reason = job.result?.checks?.reason || undefined
        } else if (job.status === 'failed' || job.status === 'canceled') {
          Object.assign(item, { state: 'failed', error: job.error ?? job.status })
        }
      }
      let active = plan.items.filter((i) => i.state === 'queued').length
      for (const item of plan.items.filter((i) => i.state === 'waiting')) {
        if (active >= (plan.ahead ?? AHEAD)) break
        try {
          const out = await runCommand('take', { project: plan.project, shot: item.shot })
          Object.assign(item, { state: 'queued', job: out.result.id, take: out.result.params?.name })
          active++
        } catch (error) {
          // A full queue waits for the next tick; anything else is this shot's.
          if (error?.code === 'busy' || /queue is full/.test(error?.message ?? '')) break
          Object.assign(item, { state: 'failed', error: error.message })
        }
      }
      if (plan.items.every((i) => i.state === 'done' || i.state === 'failed')) {
        const name = `${new Date(now()).toISOString().slice(0, 10)}-${plan.id}`
        try {
          plan.dailies = await makeDailies(plan.items, { folder, name, ffmpeg, date: new Date(now()) })
        } catch (error) {
          plan.dailies = { error: error.message }
        }
        plan.ended = new Date(now()).toISOString()
        const made = plan.items.filter((i) => i.state === 'done').length
        const look = plan.items.filter((i) => i.passed === false || i.state === 'failed').length
        await save(plan)
        log(`Night shift ${plan.id}: ${made} of ${plan.items.length} take(s), ${look} to look at.`)
        await notify({ title: 'TSRS: dailies ready', body: `${made} of ${plan.items.length} take(s), ${look} to look at`, url: plan.dailies?.notes ?? '' }).catch(() => {})
        return
      }
      await save(plan)
    } finally {
      ticking = false
    }
  }

  return {
    file,
    tick,
    read,
    async plan({ project, folder, shots, start = 'idle', ahead = AHEAD }) {
      const current = await read()
      if (current && !current.ended && !current.canceled) {
        const e = new Error(`A night shift is already planned (${current.id}, ${current.project}). See: tsrs night status, or tsrs night cancel.`)
        e.code = 'invalid'
        throw e
      }
      startTime(start === 'now' || start === 'idle' ? '00:00' : start, now()) // throws on a bad start
      const plan = {
        id: now().toString(36).slice(-6),
        project,
        folder,
        start,
        ahead,
        created: now(),
        started: null,
        ended: null,
        items: shots.map((shot) => ({ shot, state: 'waiting', job: null, take: null })),
      }
      await save(plan)
      return plan
    },
    async cancel() {
      const plan = await read()
      if (!plan || plan.ended || plan.canceled) return null
      plan.canceled = new Date(now()).toISOString()
      for (const item of plan.items.filter((i) => i.state === 'queued' && i.job)) {
        try {
          queue.cancel(item.job)
        } catch {
          // already ended
        }
      }
      await save(plan)
      return plan
    },
  }
}
