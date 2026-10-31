#!/usr/bin/env node
// A narrated video from a script file (video.json in a project folder):
//
//   1. voice      each scene's line: an audio file of the project, or made by
//                 Runware (HeyGen voices: the free model first, the paid one if
//                 it fails), kept in midia/voz/ and made again only when the
//                 line changes. Making voice asks for --yes;
//   2. trim       the silence at both ends of each line cut off;
//   3. timing     the scenes laid one after another (lead, gaps, tail) and the
//                 time of every word (Whisper on this computer, or the pauses),
//                 written to video/<name>/timing.lock.json;
//   4. mix        the narration over the music, the music lowered while the
//                 voice speaks;
//   5. render     the composition, given the timeline (NWLab.word in the page),
//                 at the narration's length, with captions if asked; the
//                 browsers capture side by side; a manifest goes beside;
//   6. vertical   a 9:16 copy with the captions below the video, if asked.
//
//   npm run video -- <project folder> [video.json] [--check] [--yes]
//
// `check` reads everything and says what is missing or wrong, and what `run`
// would make and spend, without making anything.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectFile } from '../server/projects.mjs'
import { buildCues, captionChars, captionStyle } from './captions.mjs'
import { readManifest, sha256File } from './manifest.mjs'
import { motionSettings } from './motion.mjs'
import { ffmpegPath, freeName, render } from './render.mjs'
import { makeVertical, overlayCaptions } from './vertical.mjs'
import { audioDuration, fold, scriptWords, wordTimings } from './words.mjs'

export const SPEC_FILE = 'video.json'
const RUNWARE_API = 'https://api.runware.ai/v1'
export const RUNWARE_MODELS = { free: 'heygen:voice@1.0-turbo-free', paid: 'heygen:voice@1.0-turbo' }
// US$ per character on the paid model.
export const PAID_PRICE = 0.000004

const DEFAULTS = {
  timing: { lead: 0.6, gap: 0.6, tail: 3 },
  words: 'whisper',
  lufs: -14,
  captions: false,
  vertical: false,
}

const sha = (text) => createHash('sha256').update(text).digest('hex')

class VideoError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

function file(project, name) {
  const path = projectFile(project, String(name ?? ''))
  if (!path) throw new VideoError('invalid', `${name} is not a file inside the project.`)
  return path
}

export async function readSpec(project, name = SPEC_FILE) {
  const path = file(project, name)
  if (!existsSync(path)) throw new VideoError('invalid', `No ${name} in the project. See the example in the README (Narrated videos).`)
  let spec
  try {
    spec = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new VideoError('invalid', `${name} is not valid JSON: ${error.message}`)
  }
  return { spec, path }
}

// The voice line's cache: the audio made for this exact text and voice.
function voiceKey(scene, voice) {
  return sha(JSON.stringify([scene.text, voice.voice, voice.language ?? '', voice.model ?? RUNWARE_MODELS.free]))
}

// What is missing or wrong, and what a run would do. Never makes anything.
export async function checkVideo(project, spec, { env = process.env } = {}) {
  const problems = []
  const warnings = []
  const need = (ok, message) => ok || problems.push(message)
  const scenes = Array.isArray(spec.scenes) ? spec.scenes : []
  need(scenes.length > 0, 'scenes: list at least one scene ({ "id", "text" }).')
  const ids = new Set()
  for (const [i, s] of scenes.entries()) {
    const at = `scenes[${i}]`
    need(typeof s?.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.id), `${at}.id: letters, digits, - or _ (up to 40).`)
    need(!ids.has(s?.id), `${at}.id: "${s?.id}" is used twice.`)
    ids.add(s?.id)
    need(typeof s?.text === 'string' && fold(s.text).length > 0, `${at}.text: the line the voice says.`)
    if (s?.audio !== undefined) need(existsSync(projectFile(project, String(s.audio)) ?? ''), `${at}.audio: ${s.audio} is not in the project.`)
    if (s?.gap !== undefined) need(Number(s.gap) >= 0 && Number(s.gap) <= 10, `${at}.gap: seconds after the line, 0 to 10.`)
  }
  const composition = spec.composition ? projectFile(project, String(spec.composition)) : null
  need(!!composition && /\.html?$/i.test(composition) && existsSync(composition), 'composition: an HTML page of the project (the motion composition).')
  const voice = spec.voice ?? { provider: 'files' }
  need(['files', 'runware'].includes(voice.provider), 'voice.provider: "files" (an audio per scene) or "runware".')
  const generate = []
  if (voice.provider === 'files') {
    for (const s of scenes) if (s && s.audio === undefined) problems.push(`scenes "${s.id}": no audio, and voice.provider is "files".`)
  } else if (voice.provider === 'runware') {
    need(typeof voice.voice === 'string' && voice.voice.length > 0, 'voice.voice: the Runware/HeyGen voice id.')
    for (const s of scenes) {
      if (!s?.id || s.audio !== undefined) continue
      const cached = projectFile(project, `midia/voz/${s.id}.mp3`)
      const meta = projectFile(project, `midia/voz/${s.id}.json`)
      let fresh = false
      if (cached && meta && existsSync(cached) && existsSync(meta)) {
        try {
          fresh = JSON.parse(await readFile(meta, 'utf8')).key === voiceKey(s, voice)
        } catch {
          fresh = false
        }
      }
      if (!fresh) generate.push(s.id)
    }
    if (generate.length && !env.RUNWARE_API_KEY) problems.push('RUNWARE_API_KEY is not set where TSRS runs: needed to make the voice.')
  }
  if (spec.music?.file) need(existsSync(projectFile(project, String(spec.music.file)) ?? ''), `music.file: ${spec.music.file} is not in the project.`)
  if (spec.words !== undefined) need(['whisper', 'pauses'].includes(spec.words), 'words: "whisper" or "pauses".')

  // The page's NWLab.word('scene', 'word') must name scenes and words the script has.
  if (composition && existsSync(composition)) {
    const code = await readFile(composition, 'utf8')
    for (const m of code.matchAll(/NWLab\.word\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3(?:\s*,\s*(\d+))?/g)) {
      const scene = scenes.find((s) => s?.id === m[2])
      if (!scene) {
        problems.push(`${spec.composition}: NWLab.word('${m[2]}', …) names no scene.`)
        continue
      }
      const count = scriptWords(scene.text).filter((w) => fold(w) === fold(m[4])).length
      if (count < Number(m[5] ?? 1)) problems.push(`${spec.composition}: "${m[4]}"${m[5] ? ` #${m[5]}` : ''} is not said in scene "${m[2]}".`)
    }
    const settings = motionSettings(code)
    if ((spec.captions || spec.vertical) && settings.height > settings.width && spec.vertical)
      warnings.push('vertical: the composition is already tall; the 9:16 copy is for wide videos.')
  }
  const chars = generate.reduce((a, id) => a + scenes.find((s) => s.id === id).text.length, 0)
  return {
    ok: problems.length === 0,
    problems,
    warnings,
    plan: {
      scenes: scenes.length,
      generate,
      characters: chars,
      // The free model costs nothing; this is the most if every line falls back to the paid one.
      maxCost: Math.round(chars * PAID_PRICE * 10000) / 10000,
      words: spec.words ?? DEFAULTS.words,
      captions: !!spec.captions,
      vertical: !!spec.vertical,
    },
  }
}

export function describeCheck(report) {
  const lines = []
  if (report.problems.length) lines.push('Problems:', ...report.problems.map((p) => `  - ${p}`))
  if (report.warnings.length) lines.push('Warnings:', ...report.warnings.map((p) => `  - ${p}`))
  const p = report.plan
  lines.push(
    `${p.scenes} scene(s); words from ${p.words === 'whisper' ? 'Whisper (pauses if it cannot run)' : 'the pauses'}` +
      `${p.captions ? '; captions' : ''}${p.vertical ? '; 9:16 copy' : ''}.`,
  )
  lines.push(
    p.generate.length
      ? `Would make voice for ${p.generate.length} line(s), ${p.characters} characters, with Runware: free model first; at most US$ ${p.maxCost.toFixed(4)} if all fall back to the paid one.`
      : 'No voice to make: every line has its audio.',
  )
  if (report.ok) lines.push('Ready.')
  return lines.join('\n')
}

// One line through Runware: the free model, then the paid one. A refused key stops.
export async function runwareSpeech(text, voice, { key, fetchImpl = fetch } = {}) {
  const models = [voice.model ?? RUNWARE_MODELS.free, ...(voice.fallback === false ? [] : [voice.fallback ?? RUNWARE_MODELS.paid])]
  let last = ''
  for (const model of [...new Set(models)]) {
    const task = [{
      taskType: 'audioInference', taskUUID: crypto.randomUUID(), model,
      speech: { text, voice: voice.voice, language: voice.language ?? 'en' },
      numberResults: 1, outputType: 'URL', deliveryMethod: 'sync', includeCost: true,
    }]
    const res = await fetchImpl(RUNWARE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(task),
    })
    if (res.status === 401 || res.status === 403) throw new VideoError('failed', `Runware refused the key (HTTP ${res.status}). Check RUNWARE_API_KEY.`)
    const body = await res.json().catch(() => ({}))
    const item = body?.data?.[0]
    const url = item && Object.values(item).find((v) => typeof v === 'string' && v.startsWith('http'))
    if (res.ok && url) {
      const audio = await fetchImpl(url)
      if (audio.ok) return { data: Buffer.from(await audio.arrayBuffer()), model, cost: Number(item.cost ?? 0) }
      last = `download ${audio.status}`
    } else last = JSON.stringify(body?.errors ?? body).slice(0, 300)
  }
  throw new VideoError('failed', `Runware could not make the line: ${last}`)
}

function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new VideoError('failed', `${basename(command)} failed:\n${(r.stderr ?? '').slice(-1500)}`)
  return r
}

// The narration lines placed on the timeline, the music under them, lowered
// while the voice speaks. Loudness is set later by the renderer.
export function mixArgs(lines, total, music, out) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  const parts = []
  lines.forEach((l, i) => {
    args.push('-i', l.file)
    parts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(l.start * 1000)}:all=1[v${i}]`)
  })
  const n = lines.length
  parts.push(`${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0,apad,atrim=0:${total.toFixed(3)}[voice]`)
  if (music) {
    args.push('-stream_loop', '-1', '-i', music.file)
    const volume = Number.isFinite(Number(music.volume)) ? Number(music.volume) : -11
    parts.push(`[voice]asplit=2[vo][key]`)
    parts.push(
      `[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},` +
        `acompressor=threshold=-24dB:ratio=3:attack=50:release=600:makeup=4,volume=${volume}dB,afade=t=in:d=1[bed]`,
    )
    if (music.duck === false) parts.push('[bed]anull[under]')
    else parts.push('[bed][key]sidechaincompress=threshold=0.02:ratio=5:attack=25:release=450[under]')
    parts.push('[vo][under]amix=inputs=2:normalize=0:duration=first[out]')
  } else parts.push('[voice]anull[out]')
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', out)
  return args
}

// Scenes one after another: lead, then each line and its gap, then the tail.
export function layout(durations, scenes, timing) {
  const t = { ...DEFAULTS.timing, ...(timing ?? {}) }
  let at = Number(t.lead)
  const placed = scenes.map((s, i) => {
    const item = { id: s.id, start: round(at), dur: round(durations[i]) }
    at += durations[i] + (s.gap !== undefined ? Number(s.gap) : Number(t.gap))
    return item
  })
  const last = placed.at(-1)
  return { scenes: placed, total: round(last.start + last.dur + Number(t.tail)) }
}

const round = (x) => Math.round(x * 1000) / 1000

export async function runVideo(project, spec, { yes = false, log = console.log, env = process.env, onFrame, workers, fetchImpl, specPath = null } = {}) {
  const report = await checkVideo(project, spec, { env })
  if (!report.ok) throw new VideoError('invalid', describeCheck(report), report)
  if (report.plan.generate.length && !yes)
    throw new VideoError('confirm', `${describeCheck(report)}\nAdd --yes to make the voice.`, report)
  const ffmpeg = ffmpegPath()
  const name = String(spec.name || basename(spec.composition).replace(/\.html?$/i, '')).replace(/[^\w.-]+/g, '-')
  const work = join(project, 'video', name)
  await mkdir(join(work, 'voz'), { recursive: true })
  await mkdir(join(project, 'midia', 'voz'), { recursive: true })
  const voice = spec.voice ?? { provider: 'files' }

  // 1. voice
  const sources = []
  for (const s of spec.scenes) {
    if (s.audio !== undefined) {
      sources.push(file(project, s.audio))
      continue
    }
    const mp3 = join(project, 'midia', 'voz', `${s.id}.mp3`)
    if (report.plan.generate.includes(s.id)) {
      log(`voice: ${s.id}…`)
      const made = await runwareSpeech(s.text, voice, { key: env.RUNWARE_API_KEY, fetchImpl })
      await writeFile(mp3, made.data)
      await writeFile(join(project, 'midia', 'voz', `${s.id}.json`), JSON.stringify({ key: voiceKey(s, voice), text: s.text, voice: voice.voice, model: made.model, cost: made.cost }, null, 2))
    }
    sources.push(mp3)
  }

  // 2. trim the silence at both ends
  const lines = []
  for (const [i, s] of spec.scenes.entries()) {
    const wav = join(work, 'voz', `${s.id}.wav`)
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', sources[i], '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse',
      '-ar', '48000', '-ac', '1', wav])
    lines.push({ id: s.id, text: s.text, audio: wav })
  }

  // 3. timing
  const mode = spec.words ?? DEFAULTS.words
  const heard = await wordTimings(lines, {
    ffmpeg, log,
    whisper: mode === 'whisper' ? { model: spec.whisperModel, language: voice.language ?? spec.language ?? '' } : false,
  })
  const placed = layout(heard.map((h) => h.duration), spec.scenes, spec.timing)
  const timeline = {
    total: placed.total,
    words: heard.every((h) => h.source === 'whisper') ? 'whisper' : heard.some((h) => h.source === 'whisper') ? 'mixed' : 'pauses',
    scenes: placed.scenes.map((p, i) => ({
      ...p, text: spec.scenes[i].text,
      words: heard[i].words.map((w) => ({ w: w.w, t: round(w.t + p.start), end: round(w.end + p.start) })),
    })),
  }
  const lock = join(work, 'timing.lock.json')
  const audioHashes = await Promise.all(lines.map((l) => sha256File(l.audio)))
  await writeFile(lock, JSON.stringify({ schema: 'tsrs.timing-lock/v1', audio: Object.fromEntries(lines.map((l, i) => [l.id, audioHashes[i]])), ...timeline }, null, 2) + '\n')
  log(`timing: ${timeline.total.toFixed(2)} s, words from ${timeline.words}`)

  // 4. mix
  const mixed = join(work, 'audio.m4a')
  const music = spec.music?.file ? { ...spec.music, file: file(project, spec.music.file) } : null
  run(ffmpeg, mixArgs(lines.map((l, i) => ({ file: l.audio, start: placed.scenes[i].start })), placed.total, music, mixed))

  // 5. render
  const composition = file(project, spec.composition)
  const settings = motionSettings(await readFile(composition, 'utf8'))
  const words = timeline.scenes.flatMap((s) => s.words)
  const style = typeof spec.captions === 'object' ? spec.captions : {}
  const captions = spec.captions
    ? { cues: buildCues(words, { maxChars: style.maxChars ?? captionChars(settings.width, settings.height) }), style: captionStyle(settings.width, settings.height, style) }
    : null
  await mkdir(join(project, 'videos'), { recursive: true })
  const manifestExtra = {
    spec: specPath
      ? { file: relative(project, specPath).split('\\').join('/'), sha256: await sha256File(specPath) }
      : { sha256: sha(JSON.stringify(spec)) },
    timing_lock: { file: relative(project, lock).split('\\').join('/'), sha256: await sha256File(lock) },
    words: timeline.words,
    voice: voice.provider === 'runware' ? { provider: 'runware', voice: voice.voice, language: voice.language } : { provider: 'files' },
  }
  // With a 9:16 copy, the composition is rendered once without captions (the
  // clean master, kept in video/<name>/clean.mp4) and the captions are laid
  // over it in each format; otherwise the page draws them in one pass.
  const vstyle = typeof spec.vertical === 'object' ? spec.vertical.captions : undefined
  const verticalCaptions = !!spec.vertical && !!(spec.captions || vstyle)
  const target = join(project, 'videos', `${name}.mp4`)
  const common = { input: composition, audio: mixed, lufs: spec.lufs ?? DEFAULTS.lufs, duration: placed.total, data: { timeline }, workers, onFrame, manifestExtra }
  let out
  let vertical = null
  if (verticalCaptions) {
    // The work folder is the pipeline's own: its clean master is replaced.
    await rm(join(work, 'clean.mp4'), { force: true })
    await rm(join(work, 'clean.manifest.json'), { force: true })
    const clean = await render({ ...common, out: join(work, 'clean.mp4'), captions: null }, log)
    out = captions
      ? await overlayCaptions({ video: clean, out: target, captions: { ...captions, lufs: spec.lufs }, ffmpeg, fps: settings.fps, workers, log, width: settings.width, height: settings.height })
      : freeName(target)
    if (!captions) await copyFile(clean, out)
    // The clean render's manifest, for the video in videos/.
    const m = await readManifest(clean.replace(/\.mp4$/i, '.manifest.json'))
    if (captions) m.pipeline = { ...m.pipeline, captions: 'laid over video/' + name + '/clean.mp4' }
    m.output = { file: basename(out), bytes: (await stat(out)).size, sha256: await sha256File(out) }
    await writeFile(out.replace(/\.mp4$/i, '.manifest.json'), JSON.stringify(m, null, 2) + '\n')
    log('9:16 copy…')
    vertical = await makeVertical({
      video: clean,
      out: out.replace(/\.mp4$/i, '-9x16.mp4'),
      captions: { cues: buildCues(words, { maxChars: captionChars(1080, 1920) }), style: vstyle, lufs: spec.lufs ?? DEFAULTS.lufs },
      ffmpeg, fps: settings.fps, workers, log,
    })
  } else {
    out = await render({ ...common, out: target, captions }, log)
    if (spec.vertical) {
      log('9:16 copy…')
      vertical = await makeVertical({ video: out, out: out.replace(/\.mp4$/i, '-9x16.mp4'), captions: null, ffmpeg, fps: settings.fps, workers, log })
    }
  }
  return { video: out, vertical, timing: lock, total: placed.total, words: timeline.words, made: report.plan.generate }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const argv = process.argv.slice(2)
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const [folder, specName = SPEC_FILE] = argv.filter((a) => !a.startsWith('--'))
  if (!folder || flags.has('--help')) {
    console.log('Usage: npm run video -- <project folder> [video.json] [--check] [--yes]')
    process.exit(folder ? 0 : 1)
  }
  const project = isAbsolute(folder) ? folder : resolve(folder)
  try {
    const { spec, path } = await readSpec(project, specName)
    if (flags.has('--check')) {
      const report = await checkVideo(project, spec)
      console.log(describeCheck(report))
      process.exit(report.ok ? 0 : 2)
    }
    const result = await runVideo(project, spec, { yes: flags.has('--yes'), specPath: path })
    console.log(`Done: ${relative(project, result.video)}${result.vertical ? ` and ${relative(project, result.vertical)}` : ''}`)
  } catch (error) {
    console.error(`video: ${error.message}`)
    process.exit(error.code === 'invalid' ? 2 : error.code === 'confirm' ? 3 : 1)
  }
}
