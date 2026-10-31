#!/usr/bin/env node
// Turns a motion composition into an MP4, frame by frame, the way NWLab
// ForgeOS renders its motion pages: a headless browser seeks the page to each
// frame's time and takes a screenshot, and ffmpeg encodes the screenshots.
// Nothing plays in real time, so a slow machine makes the same video as a fast
// one.
//
//   npm run render -- motion-1.html [--out video.mp4] [--audio music.wav]
//                     [--fps 30] [--crf 18] [--lufs -14] [--online]
//
// The composition is the file the preview downloads. Files next to it (images,
// fonts, music) can be referenced by relative paths. Everything else on the
// network is blocked unless --online is given, so the video does not depend on
// what a site serves today. ffmpeg must be installed (or named in FFMPEG); the
// browser is Playwright's Chromium, the one in CHROMIUM_PATH, or the Chrome or
// Edge installed on the system.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { availableParallelism, freemem, tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeManifest } from './manifest.mjs'
import { insertHead, motionHead, motionSettings } from './motion.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNTIME_DIR = resolve(HERE, '..', 'public', 'motion')
const RUNTIME_PATH = '/__motion/'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

const USAGE = `Usage: npm run render -- <composition.html> [options]

  --out <file.mp4>   where to write the video (default: next to the composition;
                     an existing file is never overwritten, a number is added)
  --audio <file>     music or narration, trimmed to the video, faded out at the end
  --lufs <n>         loudness of the audio, in LUFS (default -14, for social media)
  --fps <n>          frames per second (default: the composition's, or 30)
  --crf <n>          H.264 quality, lower is better (default 18)
  --workers <n>      browsers capturing frames side by side (default: about half
                     the processor threads, at most 8)
  --online           let the composition load files from the internet

Next to the video goes <video>.manifest.json: what went in (with SHA-256),
the versions used and the video's own SHA-256.`

export function parseArgs(argv) {
  const options = { input: null, out: null, audio: null, fps: null, crf: 18, lufs: -14, online: false, workers: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next === undefined) throw new Error(`${arg} needs a value`)
      return next
    }
    const number = () => {
      const n = Number(value())
      if (!Number.isFinite(n)) throw new Error(`${arg} needs a number`)
      return n
    }
    if (arg === '--out' || arg === '-o') options.out = value()
    else if (arg === '--audio') options.audio = value()
    else if (arg === '--fps') options.fps = Math.round(Math.min(60, Math.max(1, number())))
    else if (arg === '--crf') options.crf = Math.round(Math.min(51, Math.max(0, number())))
    else if (arg === '--lufs') options.lufs = Math.min(-5, Math.max(-40, number()))
    else if (arg === '--workers') options.workers = Math.round(Math.min(16, Math.max(1, number())))
    else if (arg === '--online') options.online = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`)
    else if (!options.input) options.input = arg
    else throw new Error(`unexpected argument ${arg}`)
  }
  return options
}

// `wanted`, or the same name with -2, -3... when a file is already there.
export function freeName(wanted, exists = existsSync) {
  if (!exists(wanted)) return wanted
  const extension = extname(wanted)
  const stem = wanted.slice(0, wanted.length - extension.length)
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${extension}`
    if (!exists(candidate)) return candidate
  }
}

// The file under `root` that a request path names, or null when it would leave it.
export function insideRoot(root, path) {
  let decoded
  try {
    decoded = decodeURIComponent(path.split('?')[0])
  } catch {
    return null
  }
  const file = resolve(root, '.' + decoded)
  const rel = relative(root, file)
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : file
}

function serve(page, folder, served = new Set()) {
  const server = createServer(async (req, res) => {
    const path = req.url ?? '/'
    if (path === '/' || path.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' })
      return res.end(page)
    }
    const file = path.startsWith(RUNTIME_PATH)
      ? insideRoot(RUNTIME_DIR, '/' + path.slice(RUNTIME_PATH.length))
      : insideRoot(folder, path)
    try {
      if (!file || !(await stat(file)).isFile()) throw new Error('not a file')
      const body = await readFile(file)
      if (!path.startsWith(RUNTIME_PATH)) served.add(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

export function ffmpegPath() {
  const command = process.env.FFMPEG || 'ffmpeg'
  const probe = spawnSync(command, ['-version'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0)
    throw new Error(
      `ffmpeg was not found (${command}). Install it (Windows: winget install Gyan.FFmpeg; ` +
        'macOS: brew install ffmpeg; Linux: your package manager) or set FFMPEG to its path.',
    )
  return command
}

export async function launchBrowser() {
  let chromium
  try {
    ;({ chromium } = await import('@playwright/test'))
  } catch {
    throw new Error('Playwright is missing: run npm install in the TSRS folder first.')
  }
  const tries = process.env.CHROMIUM_PATH
    ? [{ executablePath: process.env.CHROMIUM_PATH }]
    : [...(existsSync(chromium.executablePath()) ? [{}] : []), { channel: 'chrome' }, { channel: 'msedge' }]
  let last
  for (const options of tries) {
    try {
      return await chromium.launch(options)
    } catch (error) {
      last = error
    }
  }
  throw new Error(
    'No browser to render with. Install Chrome, or run npx playwright install chromium, ' +
      'or set CHROMIUM_PATH.\n' +
      (last?.message ?? ''),
  )
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command} failed:\n${(result.stderr ?? '').slice(-2000)}`)
  return result
}

// The audio filter: trimmed to the video, faded out, brought to `lufs` with a
// fixed gain and kept under -1 dBTP by a limiter, as ForgeOS finishes its
// episodes. A fixed gain keeps the music's dynamics, where a one-pass
// loudnorm would pump.
function audioFilter(ffmpeg, audio, duration, lufs) {
  const fade = Math.min(1.5, duration / 4)
  const shape = `atrim=0:${duration},asetpts=N/SR/TB,afade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade.toFixed(3)}`
  const measured = run(ffmpeg, [
    '-hide_banner',
    '-nostats',
    '-i',
    audio,
    '-af',
    `${shape},loudnorm=I=${lufs}:TP=-1.5:LRA=11:print_format=json`,
    '-f',
    'null',
    '-',
  ])
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(measured.stderr)
  const input = json ? Number.parseFloat(JSON.parse(json[0]).input_i) : Number.NaN
  const gain = Number.isFinite(input) ? lufs - input : 0
  const ceiling = 10 ** (-1.5 / 20)
  return (
    `${shape},volume=${gain.toFixed(2)}dB,aresample=192000,` +
    `alimiter=limit=${ceiling.toFixed(4)}:attack=1:release=60:level=false,aresample=48000,apad`
  )
}

function write(stream, buffer) {
  return new Promise((ok, fail) => {
    stream.write(buffer, (error) => (error ? fail(error) : ok()))
  })
}

// How many browsers capture frames side by side: about half the processor
// threads, at most 8, and never more than one per two seconds of video.
// Each browser and its encoder take about 700 MB at 1080p, so free memory
// caps them too.
export function autoWorkers(frames, fps, cpus = availableParallelism(), free = freemem()) {
  return Math.max(1, Math.min(8, Math.floor(cpus / 2), Math.floor(frames / (fps * 2)) || 1, Math.floor(free / (700 * 1024 * 1024))))
}

// The frames [from, to) of the video, cut into `count` runs of nearly the same length.
export function splitFrames(frames, count) {
  const n = Math.max(1, Math.min(count, frames))
  const runs = []
  for (let i = 0; i < n; i++) runs.push([Math.round((i * frames) / n), Math.round(((i + 1) * frames) / n)])
  return runs.filter(([a, b]) => b > a)
}

function waitFor(child, what) {
  let errors = ''
  child.stderr?.on('data', (chunk) => (errors += chunk))
  return new Promise((ok, fail) => {
    child.on('error', fail)
    child.on('close', (status) => (status === 0 ? ok() : fail(new Error(`${what} failed:\n${errors.slice(-2000)}`))))
  })
}

// One run of frames, captured by its own browser and encoded to its own file.
// Over a video (a short's clips) the frames are drawn with a transparent
// background and laid on the same stretch of it.
async function captureRun({ origin, settings, fps, crf, online, background, transparent, from, to, file, ffmpeg, problems, blocked, onFrame, seen, threads }) {
  const browser = await launchBrowser()
  seen.browser = `${browser.browserType().name()} ${browser.version()}`
  let encoder
  try {
    const tab = await browser.newPage({ viewport: { width: settings.width, height: settings.height }, deviceScaleFactor: 1 })
    tab.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
    tab.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`)
    })
    await tab.route('**/*', (route) => {
      const url = route.request().url()
      if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:') || online) return route.continue()
      blocked.add(url)
      return route.abort('blockedbyclient')
    })
    await tab.goto(origin + '/', { waitUntil: 'load' })
    await tab.evaluate(() => window.NWLab.boot())
    const fatal = problems.filter((p) => p.startsWith('page error'))
    if (fatal.length) throw new Error(`the composition failed to start:\n${fatal.join('\n')}`)

    const args = ['-hide_banner', '-loglevel', 'error', '-y']
    if (background) args.push('-ss', (from / fps).toFixed(6), '-i', background)
    args.push('-f', 'image2pipe', '-framerate', String(fps), '-c:v', transparent ? 'png' : 'mjpeg', '-i', 'pipe:0')
    if (background) args.push('-filter_complex', '[0:v][1:v]overlay=0:0:format=auto:shortest=1[v]', '-map', '[v]')
    else args.push('-map', '0:v:0')
    // Each encoder gets its share of the threads: eight encoders each taking
    // all of them ran out of memory on a 16-thread laptop.
    args.push('-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(fps), '-threads', String(threads))
    args.push('-frames:v', String(to - from), file)
    encoder = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] })
    const finished = waitFor(encoder, 'ffmpeg')
    for (let i = from; i < to; i++) {
      await tab.evaluate((t) => window.NWLab.seek(t), i / fps)
      const shot = transparent
        ? await tab.screenshot({ type: 'png', omitBackground: true })
        : await tab.screenshot({ type: 'jpeg', quality: 95 })
      await write(encoder.stdin, shot)
      onFrame()
    }
    encoder.stdin.end()
    await finished
  } catch (error) {
    encoder?.kill()
    throw error
  } finally {
    await browser.close()
  }
}

// options: input, out, audio, fps, crf, lufs, online, and
//   workers      browsers capturing side by side (default: autoWorkers)
//   duration     seconds, instead of the composition's nwlab:duration
//   data         values the composition reads from NWLab.data (a timeline...)
//   captions     { cues, style } drawn over the video by the runtime
//   background   a video the frames are laid on (transparent frames)
//   manifest     false to skip <video>.manifest.json
//   onFrame(done, frames)
export async function render(options, log = console.log) {
  const started = Date.now()
  const input = resolve(options.input)
  const code = await readFile(input, 'utf8')
  const settings = motionSettings(code)
  if (Number(options.duration) > 0) settings.duration = Number(options.duration)
  const fps = options.fps ?? settings.fps
  const frames = Math.max(1, Math.round(settings.duration * fps))
  const duration = frames / fps
  const out = freeName(resolve(options.out ?? input.replace(/\.[^./\\]+$/, '') + '.mp4'))
  const audio = options.audio ? resolve(options.audio) : null
  if (audio && !existsSync(audio)) throw new Error(`audio file not found: ${audio}`)
  const ffmpeg = ffmpegPath()
  const background = options.background ?? null
  const workers = Math.max(1, Math.min(16, Math.round(options.workers ?? autoWorkers(frames, fps))))
  const runs = splitFrames(frames, workers)

  log(
    `${basename(input)}: ${settings.width}x${settings.height}, ${duration.toFixed(2)} s, ${fps} fps, ${frames} frames` +
      (runs.length > 1 ? `, ${runs.length} browsers` : ''),
  )
  const page = insertHead(
    code,
    motionHead(code, RUNTIME_PATH, { duration: settings.duration, data: options.data, captions: options.captions }),
  )
  const served = new Set()
  const server = await serve(page, dirname(input), served)
  const origin = `http://127.0.0.1:${server.address().port}`
  const problems = []
  const blocked = new Set()
  const work = await mkdtemp(join(tmpdir(), 'tsrs-render-'))
  const seen = { browser: null }
  try {
    let done = 0
    let reported = 0
    const onFrame = () => {
      done++
      options.onFrame?.(done, frames)
      if (done === frames || Date.now() - reported > 2000) {
        reported = Date.now()
        log(`frame ${done}/${frames}`)
      }
    }
    const parts = runs.map((_, i) => join(work, `part-${String(i).padStart(3, '0')}.mp4`))
    await Promise.all(
      runs.map(([from, to], i) =>
        captureRun({
          origin, settings, fps, crf: options.crf ?? 18, online: options.online, background,
          transparent: !!background || options.transparent === true,
          from, to, file: parts[i], ffmpeg, problems, blocked, onFrame, seen,
          threads: Math.max(1, Math.floor(availableParallelism() / runs.length)),
        }),
      ),
    )
    for (const url of blocked) log(`blocked (offline render; use --online to allow): ${url}`)

    // The runs one after another, unchanged, with the sound added.
    const list = join(work, 'parts.txt')
    await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list]
    if (audio) args.push('-i', audio)
    args.push('-map', '0:v:0')
    if (audio) args.push('-map', '1:a:0', '-af', audioFilter(ffmpeg, audio, duration, options.lufs ?? -14))
    args.push('-c:v', 'copy', '-movflags', '+faststart')
    if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
    args.push('-t', duration.toFixed(6), out)
    run(ffmpeg, args)
  } finally {
    server.close()
    await rm(work, { recursive: true, force: true }).catch(() => {})
  }
  for (const problem of new Set(problems)) log(`warning: ${problem}`)
  if (options.manifest !== false) {
    try {
      const manifest = await writeManifest(out, {
        composition: input, page, files: [...served], audio, background,
        settings: { width: settings.width, height: settings.height, fps, frames, duration, crf: options.crf ?? 18, lufs: audio ? (options.lufs ?? -14) : null },
        browser: seen.browser, workers: runs.length, seconds: (Date.now() - started) / 1000, extra: options.manifestExtra,
      }, ffmpeg)
      log(`manifest ${basename(manifest)}`)
    } catch (error) {
      log(`warning: no manifest (${error.message})`)
    }
  }
  log(`wrote ${out}`)
  return out
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help || !options.input) {
      console.log(USAGE)
      process.exit(options.help ? 0 : 1)
    }
    await render(options)
  } catch (error) {
    console.error(`render: ${error.message}`)
    process.exit(1)
  }
}
