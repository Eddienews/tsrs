import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// `npm run render` needs ffmpeg; without it there is nothing to test here.
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const ffprobe = process.env.FFPROBE || 'ffprobe'
const missing = spawnSync(ffmpeg, ['-version']).status !== 0 || spawnSync(ffprobe, ['-version']).status !== 0

// Moves by a seek handler and an anime.js timeline, and asks for an image on
// the internet, which an offline render must not fetch.
const COMPOSITION = `<!doctype html>
<html><head>
<meta name="nwlab:duration" content="2">
<meta name="nwlab:size" content="320x180">
<meta name="nwlab:fps" content="10">
<style>body { background: #000 } #box { width: 320px; height: 90px; background: #fff; opacity: 0 }</style>
</head><body>
<div id="box"></div>
<img src="https://example.com/not-fetched.png" alt="">
<script>
  NWLab.register(anime.createTimeline({ autoplay: false }).add('#box', { opacity: { from: 0, to: 1 }, duration: 1000, ease: 'linear' }))
  NWLab.onSeek((t) => { document.body.style.background = t < 1.5 ? '#000' : '#f00' })
</script>
</body></html>`

function render(file: string, ...args: string[]) {
  return spawnSync(process.execPath, ['render/render.mjs', file, ...args], {
    encoding: 'utf8',
    env: process.env,
    timeout: 120_000,
  })
}

// The average colour of one frame of a video, as [r, g, b] from 0 to 255.
function colour(video: string, seconds: number, crop: string): number[] {
  const out = spawnSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(seconds),
      '-i',
      video,
      '-frames:v',
      '1',
      '-vf',
      `crop=${crop},scale=1:1`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: 1024 },
  )
  return [...out.stdout]
}

test('renders a composition to MP4, frame by frame and offline', async () => {
  test.skip(missing, 'ffmpeg and ffprobe are not installed')
  test.setTimeout(180_000)
  const folder = await mkdtemp(join(tmpdir(), 'tsrs-render-'))
  const file = join(folder, 'motion-1.html')
  await writeFile(file, COMPOSITION)
  const tone = join(folder, 'tone.wav')
  spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', tone])

  const first = render(file, '--audio', tone)
  expect(first.status, first.stderr).toBe(0)
  expect(first.stdout).toContain('320x180, 2.00 s, 10 fps, 20 frames')
  expect(first.stdout).toContain(
    'blocked (offline render; use --online to allow): https://example.com/not-fetched.png',
  )
  const video = join(folder, 'motion-1.mp4')
  expect(first.stdout).toContain(`wrote ${video}`)

  const probe = spawnSync(
    ffprobe,
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,nb_frames',
      '-of',
      'json',
      video,
    ],
    { encoding: 'utf8' },
  )
  const streams = JSON.parse(probe.stdout).streams
  expect(streams[0]).toMatchObject({
    codec_type: 'video',
    codec_name: 'h264',
    width: 320,
    height: 180,
    nb_frames: '20',
  })
  expect(streams[1]).toMatchObject({ codec_type: 'audio', codec_name: 'aac' })

  // The box fades in over the first second; the background turns red at 1.5 s.
  const box = '320:90:0:0'
  const floor = '320:90:0:90'
  expect(colour(video, 0, box)[0]).toBeLessThan(20)
  expect(colour(video, 0.5, box)[0]).toBeGreaterThan(100)
  expect(colour(video, 0.5, box)[0]).toBeLessThan(160)
  expect(colour(video, 1.2, box)[0]).toBeGreaterThan(235)
  expect(colour(video, 1.2, floor)[0]).toBeLessThan(20)
  const red = colour(video, 1.8, floor)
  expect(red[0]).toBeGreaterThan(200)
  expect(red[1]).toBeLessThan(40)

  // A second render never overwrites the first, and makes the same frames.
  const second = render(file)
  expect(second.status, second.stderr).toBe(0)
  const again = join(folder, 'motion-1-2.mp4')
  expect(second.stdout).toContain(`wrote ${again}`)
  const frames = (path: string) =>
    spawnSync(ffmpeg, ['-v', 'error', '-i', path, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8' })
      .stdout.split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n')
  expect(frames(again)).toBe(frames(video))
})

test('explains what is wrong instead of rendering', async () => {
  const result = render('does-not-exist.html')
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('render:')
  const usage = spawnSync(process.execPath, ['render/render.mjs'], { encoding: 'utf8' })
  expect(usage.status).toBe(1)
  expect(usage.stdout).toContain('Usage: npm run render -- <composition.html>')
})
