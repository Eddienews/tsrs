// A cut for an editor (DaVinci Resolve, Final Cut, Premiere): the takes in
// order, each trimmed to its in and out points, and the music on a lane of its
// own. Three files go to the project's exports/:
//
//   <name>.fcpxml         FCPXML 1.11 (Resolve: File > Import > Timeline)
//   <name>.edl            CMX 3600, the pictures only (a fallback for any editor)
//   <name>-resolve.zip    the FCPXML with the media beside it, to take to another computer
//
// After the timeline export of Imagination Studio (Keys and Sam Wasserman,
// Apache-2.0): see CREDITS.md.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zipSync } from 'fflate'
import { ffprobePath } from '../render/words.mjs'

// What a media file is: { duration, fps, width, height, hasVideo, hasAudio }.
export function probe(file, ffmpeg = 'ffmpeg') {
  const r = spawnSync(ffprobePath(ffmpeg), ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', file], { encoding: 'utf8' })
  const info = JSON.parse(r.stdout || '{}')
  const video = info.streams?.find((s) => s.codec_type === 'video')
  const [num, den] = String(video?.r_frame_rate ?? '24/1').split('/').map(Number)
  return {
    duration: Number(info.format?.duration) || 0,
    fps: den ? num / den : num || 24,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasVideo: !!video,
    hasAudio: !!info.streams?.some((s) => s.codec_type === 'audio'),
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Seconds as whole frames, in FCPXML's rational time.
const time = (frames, fps) => (frames % fps === 0 ? `${frames / fps}s` : `${frames}/${fps}s`)

// clips: [{ file, name, in, out, info }] (in/out in seconds); music: { file, info } | null.
export function timeline(clips, fps = 24) {
  let at = 0
  return clips.map((c) => {
    const start = Math.round(c.in * fps)
    const end = Math.max(start + 1, Math.round(Math.min(c.out, c.info.duration) * fps))
    const placed = { ...c, start, frames: end - start, offset: at }
    at += end - start
    return placed
  })
}

export function fcpxml(clips, { name, music = null, fps = 24, url = (f) => pathToFileURL(f).href } = {}) {
  const placed = timeline(clips, fps)
  const total = placed.reduce((sum, c) => sum + c.frames, 0)
  const first = clips[0]?.info ?? { width: 1920, height: 1080 }
  const assets = []
  const ids = new Map()
  const assetFor = (file, info) => {
    if (!ids.has(file)) {
      const id = `a${ids.size + 1}`
      ids.set(file, id)
      const frames = Math.round(info.duration * fps)
      assets.push(
        `    <asset id="${id}" name="${esc(basename(file))}" start="0s" duration="${time(frames, fps)}" hasVideo="${info.hasVideo ? 1 : 0}" hasAudio="${info.hasAudio ? 1 : 0}"${info.hasVideo ? ' format="r1"' : ''}${info.hasAudio ? ' audioSources="1" audioChannels="2" audioRate="48000"' : ''}>\n      <media-rep kind="original-media" src="${esc(url(file))}"/>\n    </asset>`,
      )
    }
    return ids.get(file)
  }
  const spine = placed.map((c, k) => {
    const id = assetFor(c.file, c.info)
    let inner = ''
    if (k === 0 && music) {
      const mid = assetFor(music.file, music.info)
      const frames = Math.min(total, Math.round(music.info.duration * fps))
      inner = `\n          <asset-clip ref="${mid}" lane="-1" offset="${time(c.start, fps)}" name="${esc(basename(music.file))}" start="0s" duration="${time(frames, fps)}" audioRole="music"/>\n        `
    }
    return `        <asset-clip ref="${id}" offset="${time(c.offset, fps)}" name="${esc(c.name)}" start="${time(c.start, fps)}" duration="${time(c.frames, fps)}" format="r1" tcFormat="NDF" audioRole="dialogue">${inner}</asset-clip>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
  <resources>
    <format id="r1" name="FFVideoFormat${first.height}p${fps}" frameDuration="1/${fps}s" width="${first.width}" height="${first.height}" colorSpace="1-1-1 (Rec. 709)"/>
${assets.join('\n')}
  </resources>
  <library>
    <event name="${esc(name)}">
      <project name="${esc(name)}">
        <sequence format="r1" duration="${time(total, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spine.join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`
}

const tc = (frames, fps, hour = 0) => {
  const f = frames % fps
  const s = Math.floor(frames / fps)
  return [hour + Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, f].map((n) => String(n).padStart(2, '0')).join(':')
}

// CMX 3600: one event a clip, record time from 01:00:00:00.
export function edl(clips, { name, fps = 24 } = {}) {
  const placed = timeline(clips, fps)
  const lines = [`TITLE: ${name}`, 'FCM: NON-DROP FRAME', '']
  placed.forEach((c, k) => {
    const reel = (basename(c.file).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'AX').toUpperCase()
    lines.push(
      `${String(k + 1).padStart(3, '0')}  ${reel.padEnd(8)} AA/V  C        ${tc(c.start, fps)} ${tc(c.start + c.frames, fps)} ${tc(c.offset, fps, 1)} ${tc(c.offset + c.frames, fps, 1)}`,
      `* FROM CLIP NAME: ${basename(c.file)}`,
      `* SOURCE FILE: ${c.file}`,
      '',
    )
  })
  return lines.join('\n')
}

// The FCPXML with its media beside it: the paths point into media/.
export function resolveZip(clips, { name, music = null, fps = 24 } = {}) {
  const names = new Map()
  const used = new Set()
  const local = (file) => {
    if (!names.has(file)) {
      let n = basename(file)
      for (let k = 2; used.has(n); k++) n = basename(file).replace(/(\.[^.]+)?$/, `-${k}$1`)
      used.add(n)
      names.set(file, n)
    }
    return `media/${names.get(file)}`
  }
  const xml = fcpxml(clips, { name, music, fps, url: (f) => `./${local(f)}` })
  const files = {
    [`${name}.fcpxml`]: new TextEncoder().encode(xml),
    'README.txt': new TextEncoder().encode(
      `${name}\n\nIn DaVinci Resolve: File > Import > Timeline, pick ${name}.fcpxml.\nIf Resolve asks for the media, point it to the media/ folder beside it.\n`,
    ),
  }
  for (const file of [...clips.map((c) => c.file), ...(music ? [music.file] : [])]) files[local(file)] = [readFileSync(file), { level: 0 }]
  return Buffer.from(zipSync(files))
}
