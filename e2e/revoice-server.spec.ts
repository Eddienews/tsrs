import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createAgent } from '../server/agent.mjs'
import { checkFilm, describeFilm, filmShots } from '../server/film.mjs'
import { createQueue } from '../server/jobs.mjs'
import { elevenKey, revoice } from '../server/revoice.mjs'

const VOICE = 'e1MAZ8in8PhkrhQwfrMh'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==', 'base64')

function ff(args: string[]) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  if (r.status !== 0) throw new Error(String(r.stderr))
}
const seconds = (file: string, stream: 'a' | 'v') =>
  Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', stream, '-show_entries', 'stream=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim())

// A take: 2 s of picture and a 440 Hz "voice".
async function clip(dir: string, name = 'take.mp4') {
  const file = join(dir, name)
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=24:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file])
  return file
}

// ElevenLabs standing in: answers a quieter, slightly shorter 220 Hz voice.
async function fakeEleven(dir: string, status = 200) {
  const mp3 = join(dir, 'answer.mp3')
  ff(['-f', 'lavfi', '-i', 'sine=f=220:d=1.95', '-af', 'volume=-8dB', mp3])
  const calls: { url: string; key: string | null; model: unknown }[] = []
  const fetch = async (url: string, init: any) => {
    calls.push({ url, key: init.headers['xi-api-key'], model: init.body.get('model_id') })
    if (status !== 200) return new Response('{"detail":"nope"}', { status })
    return new Response(await readFile(mp3))
  }
  return { fetch, calls }
}

test('the key comes from the environment only', () => {
  expect(elevenKey({ ELEVENLABS_API_KEY: 'k' }, 'linux')).toBe('k')
  expect(elevenKey({}, 'linux')).toBeNull()
})

test('a take in a cloned voice: same length, as loud as before, its own sound kept beside it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tsrs-revoice-'))
  const file = await clip(dir)
  const eleven = await fakeEleven(dir)
  const done = await revoice(file, { voice: VOICE, key: 'secret', fetch: eleven.fetch as any })
  expect(eleven.calls).toEqual([{ url: `https://api.elevenlabs.io/v1/speech-to-speech/${VOICE}?output_format=mp3_44100_128`, key: 'secret', model: 'eleven_multilingual_sts_v2' }])
  expect(done.original).toBe(join(dir, 'take.h3.mp4'))
  expect(existsSync(done.original)).toBe(true)
  expect(done.gain).toBeGreaterThan(4)
  // The sound runs the whole picture, though the voice came back shorter.
  expect(Math.abs(seconds(file, 'a') - seconds(file, 'v'))).toBeLessThan(0.1)

  // Done again, it starts from the take's own sound, not from the cloned one.
  const before = await readFile(done.original)
  await revoice(file, { voice: VOICE, key: 'secret', fetch: eleven.fetch as any })
  expect((await readFile(done.original)).equals(before)).toBe(true)
})

test('a refused key stops at once and says so; no key, no call', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tsrs-revoice-'))
  const file = await clip(dir)
  const refused = await fakeEleven(dir, 401)
  await expect(revoice(file, { voice: VOICE, key: 'bad', fetch: refused.fetch as any })).rejects.toMatchObject({ key: true, message: expect.stringContaining('HTTP 401') })
  expect(refused.calls).toHaveLength(1)
  await expect(revoice(file, { voice: VOICE, key: null as any, fetch: refused.fetch as any })).rejects.toMatchObject({ key: true })
  expect(refused.calls).toHaveLength(1)
  await expect(revoice(file, { voice: 'Eddie', key: 'k', fetch: refused.fetch as any })).rejects.toThrow('is not an ElevenLabs voice id')
  // The take is untouched.
  expect(existsSync(join(dir, 'take.h3.mp4'))).toBe(false)
})

const film = () => ({
  title: 'Voz',
  language: 'pt',
  characters: [
    { id: 'silva', name: 'Seu Silva', description: 'a man in his sixties', pictures: ['midia/silva.png'], elevenlabsVoice: VOICE },
    { id: 'nori', name: 'Nori', description: 'a small robot' },
  ],
  locations: [{ id: 'cozinha', name: 'the kitchen', description: 'a small kitchen' }],
  scenes: [
    {
      id: 'c1',
      location: 'cozinha',
      shots: [
        { id: 's01', seconds: 3, cast: ['silva'], action: 'He smiles', lines: [{ speaker: 'silva', text: 'Bom dia!' }] },
        { id: 's02', seconds: 3, cast: ['silva'], action: 'He sips the coffee' },
        { id: 's03', seconds: 4, cast: ['silva', 'nori'], action: 'They talk', lines: [{ speaker: 'silva', text: 'Oi.' }, { speaker: 'nori', text: 'Oi!' }] },
      ],
    },
  ],
})

test('film.json: a character with a cloned voice, the shots whose lines can take it', () => {
  const [one, two, three] = filmShots(film()).map((s: any) => s.shot)
  expect(one.revoice).toEqual({ engine: 'elevenlabs', voice: VOICE })
  expect(two.revoice).toBeUndefined()
  expect(three.revoice).toBeUndefined()
  const report = checkFilm(film())
  expect(report.ok).toBe(true)
  expect(report.shots[2].warnings[0]).toContain('spoken in more than one voice')
  const bad = film() as any
  bad.characters[0].elevenlabsVoice = 'Eddie'
  expect(describeFilm(checkFilm(bad))).toContain('elevenlabsVoice is the id of an ElevenLabs voice')
})

test('film take changes the lines before the checks hear them; takes revoice asks first and can go back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-revoice-film-'))
  const folder = join(root, 'ep')
  await mkdir(join(folder, 'midia'), { recursive: true })
  await writeFile(join(folder, 'midia', 'silva.png'), PNG)
  await writeFile(join(folder, 'film.json'), JSON.stringify(film()))
  const source = await clip(root, 'source.mp4')
  const order: string[] = []
  const run = createAgent(
    {
      agenda: { list: async () => ({ tasks: [], pending: 0 }), runNow: async () => {} },
      version: () => ({ version: '1', commit: '' }),
      renderBusy: () => false,
      log: () => {},
      jobs: createQueue(),
      ffmpeg: 'ffmpeg',
      sdcpp: { status: async () => ({ error: 'down' }), makeImage: async () => null },
      comfy: {
        status: async () => ({ ok: true }),
        makeImage: async () => null,
        h3Models: async () => ({ ok: true, missing: [], models: {} }),
        makeTake: async () => ({ bytes: await readFile(source), seed: 1, steps: 4, models: {} }),
      },
      revoice: async (file: string, { voice }: { voice: string }) => {
        order.push(`revoice ${file.split(/[\\/]/).pop()} ${voice}`)
        const original = file.replace(/\.mp4$/, '.h3.mp4')
        if (!existsSync(original)) await copyFile(file, original)
        return { gain: 3, original }
      },
      checkTake: async (file: string) => {
        order.push(`check ${file.split(/[\\/]/).pop()}`)
        return { passed: true, reason: '' }
      },
    },
    root,
  )
  const queued = await run('film take', { project: 'ep', shots: ['s01', 's02'] })
  const done = await run('jobs wait', { jobs: queued.result.jobs.map((j: any) => j.job), seconds: 20 })
  expect(order).toEqual([`revoice c1-s01.mp4 ${VOICE}`, 'check c1-s01.mp4', 'check c1-s02.mp4'])
  expect(done.text).toContain('lines in the cloned voice')
  const notes = JSON.parse(await readFile(join(folder, 'takes', 'c1-s01.json'), 'utf8'))
  expect(notes.revoiced).toMatchObject({ voice: VOICE, original: 'takes/c1-s01.h3.mp4', gain: 3 })
  expect((await run('takes list', { project: 'ep' })).text).toMatch(/c1-s01 .*cloned voice/)

  // By hand: it costs credits, so it asks first.
  await expect(run('takes revoice', { project: 'ep', take: 'c1-s01' })).rejects.toMatchObject({ code: 'confirm' })
  await expect(run('takes revoice', { project: 'ep', take: 'c1-s02' }, true)).rejects.toThrow('Which voice?')
  const again = await run('takes revoice', { project: 'ep', take: 'c1-s02', voice: VOICE }, true)
  expect(again.text).toContain(`the lines are in the voice ${VOICE} now (+3 dB to match)`)
  expect(again.result.status).toBe('pending')
  // And back to the voice H3 made.
  expect((await run('takes revoice', { project: 'ep', take: 'c1-s01', voice: 'h3' })).text).toContain('back to the voice H3 made')
  expect(JSON.parse(await readFile(join(folder, 'takes', 'c1-s01.json'), 'utf8')).revoiced).toBeUndefined()
})
