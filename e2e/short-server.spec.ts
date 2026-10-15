import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { baseArgs, mixArgs, renderShort } from '../render/short.mjs'

const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const ffprobe = process.env.FFPROBE || 'ffprobe'
const missing = spawnSync(ffmpeg, ['-version']).status !== 0 || spawnSync(ffprobe, ['-version']).status !== 0

// The average colour of an area of one frame, as [r, g, b].
function colour(video: string, seconds: number, crop: string): number[] {
  const out = spawnSync(
    ffmpeg,
    ['-v', 'error', '-ss', String(seconds), '-i', video, '-frames:v', '1', '-vf', `crop=${crop},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1024 },
  )
  return [...out.stdout]
}

test('builds the ffmpeg steps: clips cut to their scenes, music under the voice', () => {
  const base = baseArgs([{ file: 'a.mp4', duration: 2 }, { file: 'b.mp4', duration: 1.5 }], 1080, 1920, 30, 'out.mp4')
  expect(base.filter((a) => a === '-stream_loop')).toHaveLength(2)
  const graph = base[base.indexOf('-filter_complex') + 1]
  expect(graph).toContain('[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,trim=duration=2.000')
  expect(graph).toContain('[v0][v1]concat=n=2:v=1:a=0[out]')
  expect(mixArgs('voz.mp3', null, 0.2, 3, 'mix.wav')).toEqual(['-hide_banner', '-loglevel', 'error', '-y', '-i', 'voz.mp3', '-af', 'apad,atrim=0:3.000', '-ar', '48000', '-ac', '2', 'mix.wav'])
  const mixed = mixArgs('voz.mp3', 'musica.mp3', 0.2, 3, 'mix.wav')
  expect(mixed[mixed.indexOf('-filter_complex') + 1]).toContain('sidechaincompress')
})

test('renders a short video: clips, overlay on top and mixed audio', async () => {
  test.skip(missing, 'ffmpeg and ffprobe are not installed')
  test.setTimeout(180_000)
  const project = await mkdtemp(join(tmpdir(), 'tsrs-short-'))
  await mkdir(join(project, 'midia', 'stock'), { recursive: true })
  const make = (args: string[]) => expect(spawnSync(ffmpeg, ['-v', 'error', '-y', ...args]).status).toBe(0)
  // A blue landscape clip shorter than its scene, and a green portrait one.
  make(['-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=1:r=25', '-pix_fmt', 'yuv420p', join(project, 'midia', 'stock', 'azul.mp4')])
  make(['-f', 'lavfi', '-i', 'color=c=green:s=360x640:d=3:r=30', '-pix_fmt', 'yuv420p', join(project, 'midia', 'stock', 'verde.mp4')])
  make(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=2.5', join(project, 'midia', 'voz.mp3')])
  make(['-f', 'lavfi', '-i', 'sine=frequency=900:duration=1', join(project, 'midia', 'musica.mp3')])
  // The overlay: a white bar at the top while captions would show, transparent elsewhere.
  const html = `<!doctype html><html><head>
<meta name="nwlab:duration" content="3"><meta name="nwlab:size" content="1080x1920"><meta name="nwlab:fps" content="10">
<style>html,body{margin:0;background:transparent}#bar{position:absolute;left:0;top:0;width:1080px;height:200px;background:#fff}</style>
</head><body><div id="bar"></div><script>NWLab.onSeek((t)=>{document.getElementById('bar').style.opacity=t<2?1:0})</script></body></html>`
  const frames: number[] = []
  const out = join(project, 'videos', 'curto.mp4')
  await mkdir(join(project, 'videos'))
  const path = await renderShort(
    {
      project,
      html,
      format: '9:16',
      fps: 10,
      narration: 'midia/voz.mp3',
      music: 'midia/musica.mp3',
      scenes: [
        { file: 'midia/stock/azul.mp4', duration: 1.5 },
        { file: 'midia/stock/verde.mp4', duration: 1.5 },
      ],
      out,
    },
    () => {},
    (frame: number) => frames.push(frame),
  )
  expect(path).toBe(out)
  expect(frames.at(-1)).toBe(30)
  const probe = JSON.parse(
    spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', out], { encoding: 'utf8' }).stdout,
  )
  expect(probe.streams.find((s: any) => s.codec_type === 'video')).toMatchObject({ width: 1080, height: 1920 })
  expect(probe.streams.some((s: any) => s.codec_type === 'audio')).toBe(true)
  expect(Number(probe.format.duration)).toBeCloseTo(3, 0)
  const [r, g, b] = colour(out, 0.5, '1080:1500:0:400')
  // The first clip (blue, looped past its one second) fills the frame, under the overlay's clear part.
  expect(b).toBeGreaterThan(150)
  expect(r).toBeLessThan(60)
  expect(colour(out, 1.2, '1080:1500:0:400')[2]).toBeGreaterThan(150)
  expect(colour(out, 2.5, '1080:1500:0:400')[1]).toBeGreaterThan(80)
  // The overlay's white bar is on top while it shows, and gone after.
  expect(Math.min(...colour(out, 0.5, '1080:150:0:20'))).toBeGreaterThan(220)
  expect(colour(out, 2.5, '1080:150:0:20')[2]).toBeLessThan(80)

  await expect(
    renderShort({ project, html, narration: '../fora.mp3', scenes: [{ file: 'midia/stock/azul.mp4', duration: 1 }], out }),
  ).rejects.toThrow('Narration not found in the project')
})
