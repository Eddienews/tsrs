import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createAgent } from '../server/agent.mjs'
import { createQueue } from '../server/jobs.mjs'
import { createNightShift, startDue, startTime } from '../server/nightshift.mjs'

test('starts at a time, when idle for 2 minutes, or now', () => {
  const created = new Date('2026-10-31T20:00:00').getTime()
  expect(new Date(startTime('23:00', created)).getHours()).toBe(23)
  expect(startTime('19:00', created) - created).toBeGreaterThan(20 * 3600_000) // tomorrow
  expect(startDue({ start: '23:00', created }, { now: created + 3600_000 }).ok).toBe(false)
  expect(startDue({ start: '23:00', created }, { now: created + 3.1 * 3600_000 }).ok).toBe(true)
  expect(startDue({ start: 'idle' }, { now: 1_000_000, idleSince: 1_000_000 - 60_000 }).ok).toBe(false)
  expect(startDue({ start: 'idle' }, { now: 1_000_000, idleSince: 1_000_000 - 130_000 }).ok).toBe(true)
  expect(startDue({ start: 'now' }).ok).toBe(true)
  expect(() => startTime('tonight', created)).toThrow('start is now, idle')
})

test('runs the takes of a film unattended, two at a time, survives a restart, and leaves the dailies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-night-'))
  const folder = join(root, 'ep07')
  await mkdir(folder, { recursive: true })
  const clip = join(root, 'clip.mp4')
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=1', '-f', 'lavfi', '-i', 'sine=d=1', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip])
  await writeFile(
    join(folder, 'film.json'),
    JSON.stringify({
      title: 'Ep 07',
      characters: [{ id: 'silva', name: 'Seu Silva', description: 'a man with glasses' }],
      locations: [{ id: 'k', name: 'the kitchen', description: 'a small kitchen' }],
      scenes: [{ id: 'c1', location: 'k', shots: [1, 2, 3].map((n) => ({ id: `s0${n}`, seconds: 2, cast: ['silva'], action: `He does thing ${n}` })) }],
    }),
  )
  let release = () => {}
  let made = 0
  const jobs = createQueue()
  let clock = Date.now()
  const deps = (night: any) => ({
    agenda: { list: async () => ({ tasks: [], pending: 0 }), runNow: async () => {} },
    version: () => ({ version: '1', commit: '' }),
    renderBusy: () => false,
    log: () => {},
    jobs,
    night,
    ffmpeg: 'ffmpeg',
    // The second take fails its checks.
    checkTake: async (file: string) => (file.includes('s02') ? { passed: false, reason: 'the last word is missing', shot: { window: { whole: true } } } : { passed: true, reason: '', shot: { window: { whole: true } } }),
    sdcpp: { status: async () => ({ error: 'off' }), makeImage: async () => null },
    comfy: {
      status: async () => ({ ok: true }),
      makeImage: async () => null,
      h3Models: async () => ({ ok: true, missing: [], models: {} }),
      makeTake: async () => {
        await new Promise<void>((done) => (release = done))
        made++
        return { bytes: await readFile(clip), seed: 40 + made, steps: 4, models: {} }
      },
    },
  })
  let run: any
  const night = createNightShift({ root, run: (n: string, a: any) => run(n, a), queue: jobs, ffmpeg: 'ffmpeg', now: () => clock })
  run = createAgent(deps(night), root)

  const planned = await run('night plan', { project: 'ep07', start: 'now' })
  expect(planned.text).toContain('3 shot(s) of ep07, starting now')
  await expect(run('night plan', { project: 'ep07', start: 'now' })).rejects.toMatchObject({ message: expect.stringContaining('already planned') })
  await night.tick()
  // Two ahead in the queue, the third waits.
  expect((await night.read()).items.map((i: any) => i.state)).toEqual(['queued', 'queued', 'waiting'])
  release()
  await new Promise((r) => setTimeout(r, 50))
  await night.tick()
  expect((await night.read()).items.map((i: any) => i.state)).toEqual(['done', 'queued', 'queued'])

  // TSRS restarts: a new queue, a new shift on the same file. The take being
  // made is lost and queued again; the one made counts as made.
  const jobs2 = createQueue()
  const night2 = createNightShift({ root, run: (n: string, a: any) => run2(n, a), queue: jobs2, ffmpeg: 'ffmpeg', now: () => clock })
  const run2: any = createAgent({ ...deps(night2), jobs: jobs2 }, root)
  await night2.tick()
  expect((await night2.read()).items.map((i: any) => i.state)).toEqual(['done', 'queued', 'queued'])
  for (let k = 0; k < 4; k++) {
    release()
    await new Promise((r) => setTimeout(r, 60))
    clock += 5000
    await night2.tick()
  }
  const plan = await night2.read()
  expect(plan.ended).toBeTruthy()
  expect(plan.items.map((i: any) => [i.state, i.passed])).toEqual([['done', true], ['done', false], ['done', true]])
  expect(plan.dailies.reel).toMatch(/^dailies\/.*\.mp4$/)
  expect(existsSync(join(folder, plan.dailies.reel))).toBe(true)
  const notes = await readFile(join(folder, plan.dailies.notes), 'utf8')
  expect(notes).toContain('## To look at (1)')
  expect(notes).toMatch(/shots\/c1-s02\.json — takes\/c1-s02.*the last word is missing/)
  // 3 slates of 1.5 s and 3 takes of 1 s.
  const d = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(folder, plan.dailies.reel)], { encoding: 'utf8' }).stdout
  expect(Number(d)).toBeGreaterThan(7)
  expect((await run2('night status')).text).toContain('Dailies: dailies/')
})
