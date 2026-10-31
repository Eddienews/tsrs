// What a render was made from, written next to the video as
// <video>.manifest.json: the composition and every file it loaded, the audio
// and the background, each with its SHA-256; the versions of TSRS, Node,
// ffmpeg and the browser; the settings; and the video's own SHA-256. Two
// renders with the same inputs list the same hashes, so a changed video can be
// traced to what changed.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function sha256File(path) {
  return new Promise((ok, fail) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('error', fail)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => ok(hash.digest('hex')))
  })
}

export const sha256Text = (text) => createHash('sha256').update(text).digest('hex')

function firstLine(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8' })
  return r.status === 0 ? (r.stdout || r.stderr).split('\n')[0].trim() : null
}

async function tsrsVersion() {
  let version = null
  try {
    version = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')).version
  } catch {
    version = null
  }
  const commit = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  return { version, commit: commit.status === 0 ? commit.stdout.trim() : null }
}

async function entry(path, base) {
  return { file: relative(base, path).split('\\').join('/') || basename(path), bytes: (await stat(path)).size, sha256: await sha256File(path) }
}

// Writes the manifest; returns its path.
export async function writeManifest(out, info, ffmpeg = 'ffmpeg') {
  const base = dirname(info.composition)
  const files = []
  for (const file of [...new Set(info.files ?? [])].sort()) files.push(await entry(file, base))
  const manifest = {
    schema: 'tsrs.render-manifest/v1',
    made: new Date().toISOString(),
    tsrs: await tsrsVersion(),
    node: process.version,
    ffmpeg: firstLine(ffmpeg, ['-version']),
    browser: info.browser ?? null,
    settings: info.settings,
    workers: info.workers,
    seconds: Math.round(info.seconds * 10) / 10,
    inputs: {
      composition: { ...(await entry(info.composition, base)), page_sha256: sha256Text(info.page) },
      files,
      audio: info.audio ? await entry(info.audio, base) : null,
      background: info.background ? await entry(info.background, base) : null,
    },
    ...(info.extra ? { pipeline: info.extra } : {}),
    output: { file: basename(out), bytes: (await stat(out)).size, sha256: await sha256File(out) },
  }
  const path = `${out.replace(/\.mp4$/i, '')}.manifest.json`
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n')
  return path
}

export async function readManifest(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}
