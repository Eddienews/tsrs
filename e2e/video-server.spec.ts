import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { buildCues } from '../render/captions.mjs'
import { render, splitFrames, autoWorkers } from '../render/render.mjs'
import { checkVideo, layout, mixArgs, runVideo } from '../render/video.mjs'
import { alignWords, parseSilences, proportionalWords } from '../render/words.mjs'

const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const sh = (args: string[]) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const probe = (file: string, entries: string) =>
  spawnSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim()

// A stand-in for a voice line: tones with a pause between the two sentences.
function voice(file: string, first: number, pause: number, second: number) {
  sh(['-f', 'lavfi', '-i', `sine=f=220:d=${first}`, '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono:d=${pause}`, '-f', 'lavfi', '-i', `sine=f=330:d=${second}`,
    '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1', '-ar', '44100', file])
}

test('places words by the pauses and lays heard words onto the script', () => {
  expect(parseSilences('silence_start: 1.5\nsilence_end: 2.1 | silence_duration: 0.6', 4)).toEqual([[0, 1.5], [2.1, 4]])
  // Two sentences, two stretches of speech: the second starts after the pause.
  const words = proportionalWords('Um dois três. Quatro cinco.', [[0, 1.5], [2.1, 3.3]])
  expect(words.map((w: { w: string }) => w.w)).toEqual(['Um', 'dois', 'três.', 'Quatro', 'cinco.'])
  expect(words[3].t).toBeCloseTo(2.1, 2)
  expect(words[2].end).toBeLessThanOrEqual(1.5)
  // Whisper mishears and merges; the script's words keep their own spelling.
  const heard = [
    { text: ' Clinica', t: 0.2, end: 0.6 },
    { text: ' sorizo', t: 0.6, end: 1.0 },
    { text: ' abre', t: 1.4, end: 1.7 },
    { text: ' sabado', t: 1.7, end: 2.2 },
  ]
  const aligned = alignWords('Clínica Sorriso abre no sábado.', heard)
  expect(aligned.map((w: { w: string }) => w.w)).toEqual(['Clínica', 'Sorriso', 'abre', 'no', 'sábado.'])
  expect(aligned[0].t).toBeCloseTo(0.2, 2)
  expect(aligned[2].t).toBeCloseTo(1.4, 2)
  // "no" was not heard: it sits between its neighbours.
  expect(aligned[3].t).toBeGreaterThanOrEqual(aligned[2].t)
  expect(aligned[3].t).toBeLessThanOrEqual(aligned[4].t)
  expect(aligned[4].t).toBeCloseTo(1.7, 2)
})

test('cuts captions at sentences, pauses and long lines, and lays scenes out', () => {
  const w = (word: string, t: number) => ({ w: word, t, end: t + 0.3 })
  const cues = buildCues([w('Olá.', 0), w('Tudo', 0.4), w('bem', 0.8), w('hoje?', 1.2), w('Sim', 3), w('claro', 3.4)], { maxChars: 40 })
  expect(cues.map((c: { words: { w: string }[] }) => c.words.map((x) => x.w).join(' '))).toEqual(['Olá.', 'Tudo bem hoje?', 'Sim claro'])
  expect(cues[0].end).toBeLessThanOrEqual(cues[1].start)
  const long = buildCues(Array.from({ length: 12 }, (_, i) => w('palavra', i * 0.35)), { maxChars: 26 })
  expect(long.every((c: { words: { w: string }[] }) => c.words.map((x) => x.w).join(' ').length <= 26)).toBe(true)

  expect(layout([2, 3], [{ id: 'a' }, { id: 'b', gap: 1 }], { lead: 0.5, gap: 0.6, tail: 2 })).toEqual({
    scenes: [{ id: 'a', start: 0.5, dur: 2 }, { id: 'b', start: 3.1, dur: 3 }],
    total: 8.1,
  })
  expect(mixArgs([{ file: 'a.wav', start: 0.5 }], 4, { file: 'm.flac', volume: -10 }, 'o.m4a').join(' ')).toContain('sidechaincompress')
  expect(splitFrames(10, 3)).toEqual([[0, 3], [3, 7], [7, 10]])
  const GB = 1024 ** 3
  expect(autoWorkers(300, 30, 16, 16 * GB)).toBe(5)
  expect(autoWorkers(30, 30, 16, 16 * GB)).toBe(1)
  // Little free memory, fewer browsers.
  expect(autoWorkers(3000, 30, 16, 3.3 * GB)).toBe(4)
})

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="nwlab:size" content="320x180"><meta name="nwlab:duration" content="2"><meta name="nwlab:fps" content="10">
<style>body{background:#123}#b{position:absolute;width:40px;height:40px;background:#fc0;top:70px}</style></head>
<body><img src="midia/dot.png" style="position:absolute;right:8px;top:8px"><div id="b"></div>
<script>NWLab.onSeek((t)=>{document.getElementById('b').style.left=(t*120)+'px'})</script></body></html>`

test('renders the same video with several browsers, and writes what went in', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tsrs-par-'))
  await mkdir(join(dir, 'midia'))
  sh(['-f', 'lavfi', '-i', 'color=c=red:s=8x8', '-frames:v', '1', join(dir, 'midia', 'dot.png')])
  await writeFile(join(dir, 'p.html'), PAGE)
  const one = await render({ input: join(dir, 'p.html'), out: join(dir, 'one.mp4'), workers: 1 } as never, () => {})
  const three = await render({ input: join(dir, 'p.html'), out: join(dir, 'three.mp4'), workers: 3 } as never, () => {})
  expect(probe(three, 'stream=nb_frames')).toBe('20')
  const psnr = spawnSync(ffmpeg, ['-i', one, '-i', three, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  expect(Number(/average:([\d.]+|inf)/.exec(psnr)![1].replace('inf', '99'))).toBeGreaterThan(40)
  const manifest = JSON.parse(await readFile(join(dir, 'three.manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({ schema: 'tsrs.render-manifest/v1', workers: 3, settings: { frames: 20, fps: 10 } })
  expect(manifest.inputs.files.map((f: { file: string }) => f.file)).toEqual(['midia/dot.png'])
  expect(manifest.inputs.composition.sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(manifest.output.sha256).toMatch(/^[0-9a-f]{64}$/)
})

const KINETIC = `<!doctype html><html><head><meta charset="utf-8">
<meta name="nwlab:size" content="640x360"><meta name="nwlab:duration" content="3"><meta name="nwlab:fps" content="10">
<style>body{background:#111;color:#eee;font:40px sans-serif}#hit{opacity:0}</style></head>
<body><div id="hit">HIT</div><script>
NWLab.onSeek((t) => { document.getElementById('hit').style.opacity = t >= NWLab.word('b', 'cinco') ? 1 : 0 })
</script></body></html>`

test('makes a narrated video from video.json: timing, mix, captions, 9:16 and the voice it asks for', async () => {
  test.setTimeout(240_000)
  const dir = await mkdtemp(join(tmpdir(), 'tsrs-video-'))
  await mkdir(join(dir, 'midia', 'fala'), { recursive: true })
  voice(join(dir, 'midia', 'fala', 'a.wav'), 0.8, 0.5, 0.7)
  voice(join(dir, 'midia', 'fala', 'b.wav'), 0.6, 0.4, 0.9)
  sh(['-f', 'lavfi', '-i', 'sine=f=110:d=20', join(dir, 'midia', 'trilha.wav')])
  await writeFile(join(dir, 'kinetic.html'), KINETIC)
  const spec = {
    name: 'teste',
    composition: 'kinetic.html',
    voice: { provider: 'files' },
    music: { file: 'midia/trilha.wav' },
    words: 'pauses',
    timing: { lead: 0.3, gap: 0.4, tail: 0.8 },
    captions: true,
    vertical: true,
    scenes: [
      { id: 'a', audio: 'midia/fala/a.wav', text: 'Um dois. Três.' },
      { id: 'b', audio: 'midia/fala/b.wav', text: 'Quatro. Cinco seis.' },
    ],
  }

  // A word the page waits for must be in the script.
  const wrong = await checkVideo(dir, { ...spec, scenes: [spec.scenes[0], { ...spec.scenes[1], text: 'Quatro.' }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.problems.join('\n')).toContain('"cinco" is not said in scene "b"')
  expect((await checkVideo(dir, { ...spec, music: { file: 'midia/nada.wav' } })).problems.join('\n')).toContain('music.file')
  expect((await checkVideo(dir, spec)).ok).toBe(true)

  const made = await runVideo(dir, spec, { log: () => {} })
  expect(made.words).toBe('pauses')
  expect(probe(made.video, 'stream=width,height').split('\n')[0]).toBe('640,360')
  expect(probe(made.vertical!, 'stream=width,height').split('\n')[0]).toBe('1080,1920')
  const lock = JSON.parse(await readFile(made.timing, 'utf8'))
  expect(lock.scenes.map((s: { id: string }) => s.id)).toEqual(['a', 'b'])
  const cinco = lock.scenes[1].words.find((w: { w: string }) => w.w === 'Cinco')
  // "Cinco" comes after the pause in b's line.
  expect(cinco.t).toBeGreaterThan(lock.scenes[1].start + 0.55)
  expect(Number(probe(made.video, 'format=duration'))).toBeCloseTo(lock.total, 1)
  const manifest = JSON.parse(await readFile(made.video.replace(/\.mp4$/, '.manifest.json'), 'utf8'))
  expect(manifest.pipeline).toMatchObject({ words: 'pauses', voice: { provider: 'files' } })
  expect(existsSync(join(dir, 'video', 'teste', 'clean.mp4'))).toBe(true)

  // Voice from Runware: only with --yes, made once, and again when the line changes.
  const runware = { ...spec, vertical: false, captions: false, voice: { provider: 'runware', voice: 'v1', language: 'pt' }, scenes: spec.scenes.map(({ audio: _a, ...s }) => s) }
  const env = { RUNWARE_API_KEY: 'test-key' }
  const plan = await checkVideo(dir, runware, { env })
  expect(plan.plan.generate).toEqual(['a', 'b'])
  await expect(runVideo(dir, runware, { env, log: () => {} })).rejects.toMatchObject({ code: 'confirm' })
  const asked: string[] = []
  const lines = { a: join(dir, 'midia', 'fala', 'a.wav'), b: join(dir, 'midia', 'fala', 'b.wav') }
  const fetchImpl = async (url: string, init?: { body?: string }) => {
    if (url.startsWith('https://api.runware.ai')) {
      const task = JSON.parse(init!.body!)[0]
      asked.push(`${task.model}:${task.speech.text}`)
      const id = task.speech.text.startsWith('Um') ? 'a' : 'b'
      return new Response(JSON.stringify({ data: [{ audioURL: `https://audio.test/${id}`, cost: 0 }] }), { status: 200 })
    }
    return new Response(await readFile(lines[url.endsWith('/a') ? 'a' : 'b']))
  }
  await runVideo(dir, runware, { env, yes: true, fetchImpl: fetchImpl as never, log: () => {} })
  expect(asked).toEqual(['heygen:voice@1.0-turbo-free:Um dois. Três.', 'heygen:voice@1.0-turbo-free:Quatro. Cinco seis.'])
  expect((await checkVideo(dir, runware, { env })).plan.generate).toEqual([])
  const changed = { ...runware, scenes: [runware.scenes[0], { ...runware.scenes[1], text: 'Quatro. Cinco sete.' }] }
  expect((await checkVideo(dir, changed, { env })).plan.generate).toEqual(['b'])
})
