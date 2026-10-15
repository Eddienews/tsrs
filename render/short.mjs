// Short videos: stock clips cut to the narration, captions and brand drawn on
// top, music under the voice. Three ffmpeg steps and one render:
//   1. the clips, each cropped to the frame and cut to its scene, in order;
//   2. the narration with the music lowered while the voice speaks;
//   3. the overlay (captions, title, end card), a motion composition with a
//      transparent background, rendered frame by frame over the clips by
//      render.mjs, with the mixed audio brought to the loudness of the rest.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectFile } from '../server/projects.mjs'
import { ffmpegPath, render } from './render.mjs'

export const FORMATS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] }

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command} failed:\n${(result.stderr ?? '').slice(-2000)}`)
  return result
}

// The ffmpeg arguments that put the clips one after another, each scaled to
// cover the frame, cropped to it and cut to its scene; a clip shorter than its
// scene loops.
export function baseArgs(scenes, width, height, fps, out) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  for (const scene of scenes) args.push('-stream_loop', '-1', '-i', scene.file)
  const parts = scenes.map(
    (scene, i) =>
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
      `fps=${fps},setsar=1,trim=duration=${scene.duration.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
  )
  const graph = `${parts.join(';')};${scenes.map((_, i) => `[v${i}]`).join('')}concat=n=${scenes.length}:v=1:a=0[out]`
  args.push('-filter_complex', graph, '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', out)
  return args
}

// The narration over the music: the music at `volume`, pressed down further
// while the voice speaks (sidechain), both trimmed to the video.
export function mixArgs(narration, music, volume, duration, out) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', narration]
  if (!music) {
    args.push('-af', `apad,atrim=0:${duration.toFixed(3)}`, '-ar', '48000', '-ac', '2', out)
    return args
  }
  args.push('-stream_loop', '-1', '-i', music)
  const graph =
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${duration.toFixed(3)},asplit=2[voice][key];` +
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${duration.toFixed(3)},volume=${volume.toFixed(3)}[bed];` +
    '[bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked];' +
    '[voice][ducked]amix=inputs=2:duration=first:normalize=0[out]'
  args.push('-filter_complex', graph, '-map', '[out]', '-ar', '48000', out)
  return args
}

// A project's file, refusing anything outside the project.
function inside(project, name, what) {
  const file = projectFile(project, String(name ?? ''))
  if (!file || !existsSync(file)) throw new Error(`${what} not found in the project: ${name}`)
  return file
}

// Renders a short video. `job`: { project, html (the overlay composition),
// format, fps?, narration, music?, musicVolume?, scenes: [{ file, duration }],
// out (the MP4's path), lufs? }. Files are paths inside the project.
export async function renderShort(job, log = console.log, onFrame) {
  const [width, height] = FORMATS[job.format] ?? FORMATS['9:16']
  const fps = Number(job.fps) || 30
  if (!Array.isArray(job.scenes) || !job.scenes.length) throw new Error('A short video needs at least one scene.')
  const scenes = job.scenes.map((scene, i) => ({
    file: inside(job.project, scene.file, `Clip of scene ${i + 1}`),
    duration: Math.max(0.5, Number(scene.duration) || 0),
  }))
  const duration = scenes.reduce((sum, s) => sum + s.duration, 0)
  const narration = inside(job.project, job.narration, 'Narration')
  const music = job.music ? inside(job.project, job.music, 'Music') : null
  const volume = Math.min(1, Math.max(0, Number(job.musicVolume ?? 0.18)))
  const ffmpeg = ffmpegPath()
  const work = await mkdtemp(join(tmpdir(), 'tsrs-short-'))
  try {
    log(`short: ${scenes.length} scenes, ${duration.toFixed(1)} s, ${width}x${height}`)
    const base = join(work, 'base.mp4')
    run(ffmpeg, baseArgs(scenes, width, height, fps, base))
    const audio = join(work, 'mix.wav')
    run(ffmpeg, mixArgs(narration, music, volume, duration, audio))
    const input = join(work, 'overlay.html')
    await writeFile(input, job.html)
    return await render(
      { input, out: job.out, audio, background: base, fps, crf: 18, lufs: Number(job.lufs) || -14, online: false, onFrame },
      log,
    )
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
