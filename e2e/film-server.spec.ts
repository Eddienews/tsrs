import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createAgent } from '../server/agent.mjs'
import { cliArgs, STUDIO_GUARD, studioEnv } from '../server/cli.mjs'
import { checkFilm, describeFilm, filmShots } from '../server/film.mjs'
import { createQueue } from '../server/jobs.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==', 'base64')

const film = () => ({
  title: 'Seu Silva ep 07',
  language: 'pt',
  look: 'warm natural light, soft film grain',
  characters: [
    { id: 'silva', name: 'Seu Silva', description: 'a man in his sixties with glasses and a grey beard', voice: 'a calm, warm voice', pictures: ['midia/silva.png'] },
    { id: 'nori', name: 'Nori', description: 'a small white studio robot with round blue eyes' },
  ],
  locations: [{ id: 'cozinha', name: 'the kitchen', description: 'a small kitchen, morning light' }],
  scenes: [
    {
      id: 'c1',
      location: 'cozinha',
      shots: [
        { id: 's01', size: 'MS', movement: 'locked', seconds: 5, cast: ['silva'], action: 'He pours coffee', lines: [{ speaker: 'silva', text: 'Bom dia, Nori!' }], soundscape: 'a quiet kitchen' },
        { id: 's02', start: 'previous', seconds: 3, cast: ['silva'], action: 'He sips the coffee' },
        { id: 's03', start: 'cast', seconds: 5, cast: ['silva', 'nori'], action: 'They look at each other', lines: [{ speaker: 'silva', text: 'Hoje não tem pressa.' }] },
      ],
    },
  ],
})

test('checks a film: the bible, the cast of each shot, the lines, the starts — with exact messages', () => {
  const ok = checkFilm(film())
  expect(ok).toMatchObject({ ok: true, errors: 0 })
  expect(ok.shots.find((s: any) => s.shot === 's03').warnings).toEqual(['Nori has no picture: described in words only, so their look may change from shot to shot.'])

  const bad = film() as any
  bad.scenes[0].shots[0].action = 'He pours coffee for Nori'
  bad.scenes[0].shots[0].start = 'previous'
  bad.scenes[0].shots.push({ id: 's02', seconds: 2, cast: ['ana'], lines: [{ speaker: 'ana', text: 'Uma fala comprida demais para caber em dois segundos de vídeo de jeito nenhum' }] })
  bad.scenes[0].shots.push({ id: 's09', start: 'image', image: 'midia/none.png', action: 'A cup', seconds: 2 })
  const report = checkFilm(bad, { exists: (rel: string) => rel !== 'midia/none.png' })
  const text = describeFilm(report)
  expect(report.ok).toBe(false)
  expect(text).toContain('start "previous" opens on the shot before, and this is the first shot of its scene.')
  expect(text).toContain('Nori is in the action but not cast: add "nori" to cast')
  expect(text).toContain('Another shot of the scene has the id "s02".')
  expect(text).toContain('Cast "ana" is not in the bible. Characters: silva, nori.')
  expect(text).toMatch(/Portuguese words in 2\.33 s is more than 2\.8 a second/)
  expect(text).toContain('start "image" needs an image of the project (midia/none.png).')
  expect(text).toContain('Fix film.json and check again.')
})

test('turns the film into shot files: the bible word for word, references for the cast, the shot before for continuity', () => {
  const shots = filmShots(film())
  expect(shots.map((s: any) => s.file)).toEqual(['shots/c1-s01.json', 'shots/c1-s02.json', 'shots/c1-s03.json'])
  const [one, two, three] = shots.map((s: any) => s.shot)
  expect(one.scene).toBe('Warm natural light, soft film grain. The kitchen: a small kitchen, morning light. Seu Silva is a man in his sixties with glasses and a grey beard.')
  expect(one.dialogue).toEqual([{ speaker: 'Seu Silva', voice: 'a calm, warm voice', text: 'Bom dia, Nori!', language: 'pt' }])
  expect(two.after).toBe('shots/c1-s01.json')
  expect(three).toMatchObject({ start: 'reference', refs: ['midia/silva.png'], subjects: ['Seu Silva, a man in his sixties with glasses and a grey beard'] })
  // Nori has no picture: in words.
  expect(three.scene).toContain('Nori is a small white studio robot')
  expect(three.dialogue[0]).toMatchObject({ subject: 1 })
  expect(filmShots(film(), { shots: ['s02'] }).map((s: any) => s.file)).toEqual(['shots/c1-s02.json'])
})

test('film take queues every shot in order; a shot that opens on the one before uses its last frame', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-film-'))
  const folder = join(root, 'ep07')
  await mkdir(join(folder, 'midia'), { recursive: true })
  await writeFile(join(folder, 'midia', 'silva.png'), PNG)
  await writeFile(join(folder, 'film.json'), JSON.stringify(film()))
  // A take is a short real clip, so the last frame can be taken from it.
  const clip = join(root, 'clip.mp4')
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=24:d=1', '-pix_fmt', 'yuv420p', clip])
  const sent: any[] = []
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
        makeTake: async (job: any) => (sent.push(job), { bytes: await readFile(clip), seed: sent.length, steps: 4, models: {} }),
      },
    },
    root,
  )
  expect((await run('film check', { project: 'ep07' })).text).toContain('Ready: 3 shot(s)')
  const queued = await run('film take', { project: 'ep07' })
  expect(queued.result.jobs.map((j: any) => j.name)).toEqual(['c1-s01', 'c1-s02', 'c1-s03'])
  await run('jobs wait', { jobs: queued.result.jobs.map((j: any) => j.job), seconds: 10 })
  expect(sent.map((j) => [j.mode, j.role, j.images.map((i: any) => i.rel)])).toEqual([
    ['image', 'first', []],
    ['image', 'first', ['midia/frames/c1-s01-last.png']],
    ['reference', 'first', ['midia/silva.png']],
  ])
  expect(sent[1].prompt.startsWith('For the target video, at 0.00 seconds')).toBe(true)
  expect(sent[2].prompt).toContain('<Subject 1> is Seu Silva, a man in his sixties')
  const notes = JSON.parse(await readFile(join(folder, 'takes', 'c1-s02.json'), 'utf8'))
  expect(notes).toMatchObject({ shot: 'shots/c1-s02.json', start: 'first', pictures: ['midia/frames/c1-s01-last.png'] })

  // A shot file someone edited by hand is not replaced without --yes.
  await writeFile(join(folder, 'shots', 'c1-s01.json'), JSON.stringify({ scene: 'mine' }))
  await expect(run('film shots', { project: 'ep07' })).rejects.toMatchObject({ code: 'confirm' })
  expect((await run('film shots', { project: 'ep07' }, true)).text).toContain('Wrote 3 shot file(s)')

  // The ledger says what was really made.
  const ledger = await run('ledger', {})
  expect(ledger.text).toContain("What TSRS's records say was made:")
  expect(ledger.text).toContain('film take')
  expect(ledger.text).toContain('shots/c1-s01.json')
})

test('a refused call is not sent again unchanged; the bot is told to change it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-guard-'))
  const run = createAgent(
    {
      agenda: { list: async () => ({ tasks: [], pending: 0 }), runNow: async () => {} },
      version: () => ({ version: '1', commit: '' }),
      renderBusy: () => false,
      log: () => {},
      comfy: { status: async () => ({ error: 'x' }), makeImage: async () => null },
      sdcpp: { status: async () => ({ error: 'x' }), makeImage: async () => null },
    },
    root,
  )
  await expect(run('projects files', { project: 'nope' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('No project folder named nope') })
  await expect(run('projects files', { project: 'nope' })).rejects.toMatchObject({ message: expect.stringContaining('Do not repeat it') })
  // Once something changes (the folder is made), the same call goes through.
  await run('projects new', { name: 'nope' })
  expect((await run('projects files', { project: 'nope' })).text).toBeTruthy()
})

test('the studio leash for bots: TSRS tools only, restricted, no keys, the guard line', () => {
  const claude = cliArgs({ agent: 'claude', access: 'studio', mcpConfig: '/p/.tsrs-studio-mcp.json' })
  expect(claude).toEqual(expect.arrayContaining(['--restricted', '--strict-mcp-config', '--allowedTools', 'mcp__tsrs', '--append-system-prompt', STUDIO_GUARD]))
  expect(claude[claude.indexOf('--tools') + 1]).toBe('Read,Write,Edit,Glob')
  expect(claude).not.toContain('--dangerously-skip-permissions')
  const codex = cliArgs({ agent: 'codex', access: 'studio' }).join(' ')
  expect(codex).toContain('sandbox_mode=workspace-write')
  expect(codex).toMatch(/mcp_servers\.tsrs\.args=\[".*bin\/tsrs\.mjs","mcp"\]/)
  expect(codex).not.toContain('dangerously')
  const env = studioEnv('claude', { PATH: '/bin', RUNWARE_API_KEY: 'x', HF_TOKEN: 'y', GITHUB_TOKEN: 'g', ANTHROPIC_API_KEY: 'z', CLAUDE_CODE_OAUTH_TOKEN: 'o', OPENAI_API_KEY: 'w' })
  expect(Object.keys(env).sort()).toEqual(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'PATH'])
  expect(Object.keys(studioEnv('codex', { OPENAI_API_KEY: 'w', ANTHROPIC_API_KEY: 'z' }))).toEqual(['OPENAI_API_KEY'])
})
