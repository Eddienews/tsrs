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
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  --online           let the composition load files from the internet`

export function parseArgs(argv) {
  const options = { input: null, out: null, audio: null, fps: null, crf: 18, lufs: -14, online: false }
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

function serve(page, folder) {
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
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
      res.end(await readFile(file))
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

function ffmpegPath() {
  const command = process.env.FFMPEG || 'ffmpeg'
  const probe = spawnSync(command, ['-version'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0)
    throw new Error(
      `ffmpeg was not found (${command}). Install it (Windows: winget install Gyan.FFmpeg; ` +
        'macOS: brew install ffmpeg; Linux: your package manager) or set FFMPEG to its path.',
    )
  return command
}

async function launchBrowser() {
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

export async function render(options, log = console.log) {
  const input = resolve(options.input)
  const code = await readFile(input, 'utf8')
  const settings = motionSettings(code)
  const fps = options.fps ?? settings.fps
  const frames = Math.max(1, Math.round(settings.duration * fps))
  const duration = frames / fps
  const out = freeName(resolve(options.out ?? input.replace(/\.[^./\\]+$/, '') + '.mp4'))
  const audio = options.audio ? resolve(options.audio) : null
  if (audio && !existsSync(audio)) throw new Error(`audio file not found: ${audio}`)
  const ffmpeg = ffmpegPath()

  log(
    `${basename(input)}: ${settings.width}x${settings.height}, ${duration.toFixed(2)} s, ${fps} fps, ${frames} frames`,
  )
  const page = insertHead(code, motionHead(code, RUNTIME_PATH))
  const server = await serve(page, dirname(input))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await launchBrowser()
  const problems = []
  let encoder
  try {
    const tab = await browser.newPage({
      viewport: { width: settings.width, height: settings.height },
      deviceScaleFactor: 1,
    })
    tab.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
    tab.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`)
    })
    const blocked = new Set()
    await tab.route('**/*', (route) => {
      const url = route.request().url()
      if (
        url.startsWith(origin + '/') ||
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        options.online
      )
        return route.continue()
      blocked.add(url)
      return route.abort('blockedbyclient')
    })
    await tab.goto(origin + '/', { waitUntil: 'load' })
    await tab.evaluate(() => window.NWLab.boot())
    for (const url of blocked) log(`blocked (offline render; use --online to allow): ${url}`)
    // Only the composition's own errors stop the render; a blocked file was reported above.
    const fatal = problems.filter((p) => p.startsWith('page error'))
    if (fatal.length) throw new Error(`the composition failed to start:\n${fatal.join('\n')}`)

    const args = ['-hide_banner', '-loglevel', 'error', '-y']
    args.push('-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', 'pipe:0')
    if (audio) args.push('-i', audio)
    args.push('-map', '0:v:0')
    if (audio) args.push('-map', '1:a:0', '-af', audioFilter(ffmpeg, audio, duration, options.lufs))
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(options.crf), '-pix_fmt', 'yuv420p')
    args.push('-r', String(fps), '-movflags', '+faststart')
    if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
    args.push('-t', duration.toFixed(6), out)
    encoder = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'pipe'] })
    let errors = ''
    encoder.stderr.on('data', (chunk) => (errors += chunk))
    const finished = new Promise((ok, fail) => {
      encoder.on('error', fail)
      encoder.on('close', (status) => (status === 0 ? ok() : fail(new Error(`ffmpeg failed:\n${errors}`))))
    })

    let reported = 0
    for (let i = 0; i < frames; i++) {
      await tab.evaluate((t) => window.NWLab.seek(t), i / fps)
      await write(encoder.stdin, await tab.screenshot({ type: 'png' }))
      options.onFrame?.(i + 1, frames)
      if (i + 1 === frames || Date.now() - reported > 2000) {
        reported = Date.now()
        log(`frame ${i + 1}/${frames}`)
      }
    }
    encoder.stdin.end()
    await finished
  } catch (error) {
    encoder?.kill()
    throw error
  } finally {
    await browser.close()
    server.close()
  }
  for (const problem of new Set(problems)) log(`warning: ${problem}`)
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
