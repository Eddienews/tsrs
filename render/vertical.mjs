// A 9:16 copy of a wide video, for Reels, Shorts and TikTok: the video whole,
// across the width and a little above the middle, over a blurred and darkened
// copy of itself that fills the frame; the captions, when given, below it.
//
//   makeVertical({ video, out, captions, ffmpeg, log })
//
// The base is one ffmpeg step. The captions are drawn by the motion runtime
// on a transparent page laid over the base (render.mjs with a background), so
// they look like the wide video's and need no libass.

import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captionStyle } from './captions.mjs'
import { render } from './render.mjs'
import { audioDuration } from './words.mjs'

export const VERTICAL = { width: 1080, height: 1920 }
// Where the video sits: its middle at this share of the height.
const CENTER = 0.42

export function verticalArgs(video, out, { width = VERTICAL.width, height = VERTICAL.height, fps = 30, crf = 18 } = {}) {
  const graph =
    `[0:v]split=2[a][b];` +
    `[a]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=28:2,eq=brightness=-0.22:saturation=0.8[bg];` +
    `[b]scale=${width}:-2[fg];` +
    `[bg][fg]overlay=(W-w)/2:${Math.round(height * CENTER)}-h/2,fps=${fps},setsar=1[v]`
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-filter_complex', graph, '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', out]
}

// A page that only draws the captions, over a transparent background.
function captionsPage(duration, width, height, fps) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="nwlab:size" content="${width}x${height}"><meta name="nwlab:duration" content="${duration}"><meta name="nwlab:fps" content="${fps}">
<style>html,body{background:transparent;font-family:system-ui,'Segoe UI',Roboto,sans-serif}</style></head><body></body></html>`
}

function hasAudio(video, ffmpeg) {
  const probe = /ffmpeg(\.exe)?$/i.test(ffmpeg) ? ffmpeg.replace(/ffmpeg(\.exe)?$/i, (_, e) => `ffprobe${e ?? ''}`) : 'ffprobe'
  const r = spawnSync(probe, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', video], { encoding: 'utf8' })
  return r.status === 0 && r.stdout.trim() !== ''
}

// Captions laid over a finished video (any size), its sound kept.
export async function overlayCaptions({ video, out, captions, ffmpeg = 'ffmpeg', fps = 30, crf = 18, workers, log = () => {}, width, height }) {
  const work = await mkdtemp(join(tmpdir(), 'tsrs-captions-'))
  try {
    const duration = audioDuration(video, ffmpeg)
    const page = join(work, 'captions.html')
    await writeFile(page, captionsPage(duration, width, height, fps))
    return await render(
      {
        input: page, out, audio: hasAudio(video, ffmpeg) ? video : null, fps, crf, lufs: captions.lufs ?? -14,
        background: video, workers, captions: { cues: captions.cues, style: captions.style }, manifest: false,
      },
      log,
    )
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

export async function makeVertical({ video, out, captions = null, ffmpeg = 'ffmpeg', fps = 30, crf = 18, workers, log = () => {} }) {
  const { width, height } = VERTICAL
  const work = await mkdtemp(join(tmpdir(), 'tsrs-vertical-'))
  try {
    const base = captions?.cues?.length ? join(work, 'base.mp4') : out
    const r = spawnSync(ffmpeg, verticalArgs(video, base, { fps, crf }), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (r.status !== 0) throw new Error(`ffmpeg failed:\n${(r.stderr ?? '').slice(-2000)}`)
    if (base === out) return out
    // Below the video, in the blurred part of the frame.
    const style = captionStyle(width, height, { y: 0.71, ...(captions.style ?? {}) })
    return await overlayCaptions({ video: base, out, captions: { ...captions, style }, ffmpeg, fps, crf, workers, log, width, height })
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
