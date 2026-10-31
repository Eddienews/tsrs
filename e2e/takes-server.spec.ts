import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { unzipSync } from 'fflate'
import { createAgent } from '../server/agent.mjs'
import { createQueue } from '../server/jobs.mjs'
import { edl, fcpxml, probe } from '../server/nle.mjs'
import { checkTake, findCuts, shotCheck, trimWindow, whisperLanguage, wordCheck, wordsOf } from '../server/takecheck.mjs'

const w = (pairs: [string, number, number][]) => pairs.map(([text, t, end]) => ({ text, t, end }))

// A clip of two shots (red, then blue at `cut` s) with a tone, made by ffmpeg.
function twoShots(file: string, cut = 1, total = 2) {
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=s=320x180:r=24:d=${cut}`,
    '-f', 'lavfi', '-i', `color=c=blue:s=320x180:r=24:d=${total - cut}`,
    '-f', 'lavfi', '-i', `sine=f=440:d=${total}`,
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
  ])
  if (r.status !== 0) throw new Error(String(r.stderr))
}

test('spells numbers and drops accents, in Portuguese and English', () => {
  expect(wordsOf('São 1.250 pães e 21 bolos!', 'pt')).toEqual(['sao', 'mil', 'duzentos', 'e', 'cinquenta', 'paes', 'e', 'vinte', 'e', 'um', 'bolos'])
  expect(wordsOf('It costs 42 dollars.', 'en')).toEqual(['it', 'costs', 'forty', 'two', 'dollars'])
  expect(whisperLanguage('Portuguese')).toBe('pt')
  expect(whisperLanguage('pt-BR')).toBe('pt')
  expect(whisperLanguage('')).toBe('')
})

test('the word check: heard lines pass, missing words and endings fail, voices in a silent shot fail', () => {
  const script = [{ text: 'Bom dia! O pão está saindo agora.', language: 'Portuguese' }]
  const all = w([['Bom', 0.2, 0.4], ['dia', 0.4, 0.6], ['o', 0.7, 0.8], ['pão', 0.8, 1], ['esta', 1, 1.2], ['saindo', 1.2, 1.5], ['agora', 1.5, 1.9]])
  expect(wordCheck(script, all)).toMatchObject({ words: 7, matched: 7, passed: true, lastWordEnd: 1.9 })
  // A near miss still counts ("sainu" for "saindo").
  expect(wordCheck(script, all.map((x) => (x.text === 'saindo' ? { ...x, text: 'saindu' } : x))).passed).toBe(true)
  expect(wordCheck(script, all.slice(0, 4))).toMatchObject({ passed: false, missing: ['esta', 'saindo', 'agora'] })
  expect(wordCheck(script, all.slice(0, 6))).toMatchObject({ passed: false, reason: 'the last word is missing' })
  const babble = wordCheck(script, [...all, ...w([['e', 2, 2.1], ['depois', 2.1, 2.4], ['outra', 2.4, 2.6]])])
  expect(babble).toMatchObject({ passed: true, tail: ['e', 'depois', 'outra'] })
  expect(babble.reason).toContain('the mouth may keep going')
  expect(wordCheck([], w([['hello', 0, 0.5], ['there', 0.5, 1]]))).toMatchObject({ passed: false })
  expect(wordCheck([], w([['uh', 0, 0.5]]))).toMatchObject({ passed: true })
})

test('finds a hard cut, the stretch to trim to, and whether the first frame held its picture', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tsrs-shot-'))
  const clip = join(dir, 'two.mp4')
  twoShots(clip, 0.5, 2)
  const report = shotCheck(clip)
  expect(report.frames).toBe(48)
  expect(report.cuts.map((c: { frame: number }) => c.frame)).toEqual([12])
  expect(report.window).toMatchObject({ start: 12, end: 48, in: 0.5, out: 2, whole: false })
  expect(report.passed).toBe(false)
  expect(trimWindow(10, [], 24)).toMatchObject({ whole: true, out: 0.417 })

  const first = join(dir, 'first.png')
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-frames:v', '1', first])
  const blue = join(dir, 'blue.png')
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', blue])
  expect(shotCheck(clip, { first }).first).toMatchObject({ held: true })
  expect(shotCheck(clip, { first: blue }).first).toMatchObject({ held: false })
  expect(findCuts([new Float32Array(4)], 24)).toEqual([])

  const both = await checkTake(clip, { script: [{ text: 'hello world', language: 'en' }], hear: async (_f: string, lang: string) => (expect(lang).toBe('en'), w([['hello', 0, 0.5], ['world', 0.5, 1]])) })
  expect(both).toMatchObject({ passed: false, words: { passed: true } })
  expect(both.reason).toContain('1 cut(s) inside the shot')
})

test('writes FCPXML and EDL in whole frames, with the music on a lane of its own', () => {
  const info = { duration: 5.167, fps: 24, width: 960, height: 544, hasVideo: true, hasAudio: true }
  const clips = [
    { file: '/p/takes/s01.mp4', name: 's01', in: 0, out: 5.167, info },
    { file: '/p/takes/s02 & b.mp4', name: 's02', in: 0.5, out: 3, info },
  ]
  const xml = fcpxml(clips, { name: 'cut', music: { file: '/p/midia/trilha.flac', info: { ...info, duration: 30, hasVideo: false } } })
  expect(xml).toContain('<fcpxml version="1.11">')
  expect(xml).toContain('frameDuration="1/24s" width="960" height="544"')
  expect(xml).toContain('<asset-clip ref="a1" offset="0s" name="s01" start="0s" duration="124/24s"')
  expect(xml).toContain('<asset-clip ref="a3" offset="124/24s" name="s02" start="12/24s" duration="60/24s"')
  expect(xml).toContain('lane="-1" offset="0s" name="trilha.flac" start="0s" duration="184/24s" audioRole="music"')
  expect(xml).toContain('src="file:///p/takes/s02%20&amp;%20b.mp4"')
  expect(xml).toContain('<sequence format="r1" duration="184/24s"')
  const list = edl(clips, { name: 'cut' })
  expect(list).toContain('001  S01MP4   AA/V  C        00:00:00:00 00:00:05:04 01:00:00:00 01:00:05:04')
  expect(list).toContain('002  S02BMP4  AA/V  C        00:00:00:12 00:00:03:00 01:00:05:04 01:00:07:16')
})

test('takes list, check, rate and the export: the best take of each shot, trimmed, into exports/', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-takes-'))
  const folder = join(root, 'ep')
  await mkdir(join(folder, 'takes'), { recursive: true })
  await mkdir(join(folder, 'midia'), { recursive: true })
  twoShots(join(folder, 'takes', 's01.mp4'), 0.5, 2)
  twoShots(join(folder, 'takes', 's01-2.mp4'), 1, 2)
  twoShots(join(folder, 'takes', 's02.mp4'), 1.5, 2)
  twoShots(join(folder, 'midia', 'music.mp4'), 1, 2)
  const take = (name: string, extra = {}) =>
    writeFile(join(folder, 'takes', `${name}.json`), JSON.stringify({ status: 'pending', name, video: `takes/${name}.mp4`, shot: `shots/${name.split('-')[0]}.json`, prompt: '[Shot 1] x <d>[English] hello world</d>', start: 'text', seconds: 2, seed: 1, made: `2026-10-31T10:0${name.length}:00Z`, ...extra }))
  await take('s01')
  await take('s01-2', { status: 'redo' })
  await take('s02')
  const heard: string[] = []
  const run = createAgent(
    {
      agenda: { list: async () => ({ tasks: [], pending: 0 }), runNow: async () => {} },
      version: () => ({ version: '1', commit: '' }),
      renderBusy: () => false,
      log: () => {},
      jobs: createQueue(),
      comfy: { status: async () => ({ error: 'down' }), makeImage: async () => null },
      sdcpp: { status: async () => ({ error: 'down' }), makeImage: async () => null },
      checkTake: (file: string, opts: any) => checkTake(file, { ...opts, hear: async (f: string) => (heard.push(f), w([['hello', 0, 0.4], ['world', 0.4, 0.9]])) }),
    },
    root,
  )
  const listed = await run('takes list', { project: 'ep' })
  expect(listed.result.best).toEqual([{ shot: 'shots/s01.json', take: 's01' }, { shot: 'shots/s02.json', take: 's02' }])
  const checked = await run('takes check', { project: 'ep', take: 's02' })
  expect(checked.text).toContain('s02: checks: 1 cut(s) inside the shot, at 1.5 s → redo')
  expect(checked.text).toContain('Trim to 0–1.5 s')
  expect(heard).toHaveLength(1)
  // A take marked redo is not the best any more: the export says which shot has none.
  await expect(run('edit export', { project: 'ep' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('shots/s02.json') })
  await run('takes rate', { project: 'ep', take: 's02', status: 'approved' })
  await expect(run('takes rate', { project: 'ep', take: 's02', status: 'great' })).rejects.toMatchObject({ code: 'invalid' })

  const out = await run('edit export', { project: 'ep', music: 'midia/music.mp4', name: 'Ep 07 cut' })
  expect(out.result.takes).toEqual([{ take: 's01', in: 0, out: expect.closeTo(2, 1) }, { take: 's02', in: 0, out: 1.5 }])
  expect(out.text).toContain('Trimmed to the stretch without cuts: s02')
  const xml = await readFile(join(folder, 'exports', 'ep-07-cut.fcpxml'), 'utf8')
  expect(xml).toContain('name="s02" start="0s" duration="36/24s"')
  expect(xml).toContain('audioRole="music"')
  const zip = unzipSync(await readFile(join(folder, 'exports', 'ep-07-cut-resolve.zip')))
  expect(Object.keys(zip).sort()).toEqual(['README.txt', 'ep-07-cut.fcpxml', 'media/music.mp4', 'media/s01.mp4', 'media/s02.mp4'])
  expect(new TextDecoder().decode(zip['ep-07-cut.fcpxml'])).toContain('src="./media/s02.mp4"')
  expect(probe(join(folder, 'takes', 's01.mp4'))).toMatchObject({ fps: 24, width: 320, hasAudio: true })
})
