import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createAgenda, nextRun } from '../server/agenda.mjs'

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

test('works out when a schedule fires next, in local time', () => {
  // Wednesday 15 October 2026, 10:00.
  const now = at(2026, 10, 15, 10, 0)
  expect(nextRun({ kind: 'daily', time: '08:00' }, now)).toBe(at(2026, 10, 16, 8, 0))
  expect(nextRun({ kind: 'daily', time: '10:30' }, now)).toBe(at(2026, 10, 15, 10, 30))
  // Mondays and Fridays only: the next is Friday.
  expect(nextRun({ kind: 'daily', time: '09:00', days: [1, 5] }, now)).toBe(at(2026, 10, 16, 9, 0))
  expect(nextRun({ kind: 'daily', time: '09:00', days: [1] }, now)).toBe(at(2026, 10, 19, 9, 0))
  expect(nextRun({ kind: 'interval', hours: 6 }, now)).toBe(now + 6 * 3_600_000)
  expect(nextRun({ kind: 'once', at: new Date(at(2026, 10, 20, 7)).toISOString() }, now)).toBe(at(2026, 10, 20, 7))
  expect(nextRun({ kind: 'once', at: new Date(at(2026, 10, 1)).toISOString() }, now)).toBeNull()
  expect(nextRun({ kind: 'daily', time: '25:00' }, now)).toBeNull()
})

test('runs what is due, queues the answers and keeps every one as a file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-agenda-'))
  let clock = at(2026, 10, 15, 7, 59)
  const asked: any[] = []
  const agenda = createAgenda(root, {
    now: () => clock,
    log: () => {},
    complete: async (task: any) => {
      asked.push(task)
      if (task.prompt === 'falhe') throw new Error('Provider down')
      return `Bom dia! (${task.prompt})`
    },
  })
  await expect(agenda.save({ task: { prompt: '', providerId: 'x', model: 'y' } })).rejects.toThrow('prompt')
  const daily = await agenda.save({
    task: { name: 'Notícias', prompt: 'resuma as notícias', providerId: 'openai', model: 'gpt-6-luna', schedule: { kind: 'daily', time: '08:00' } },
    key: { apiKey: 'sk-agenda' },
  })
  expect(daily.nextRun).toBe(at(2026, 10, 15, 8, 0))
  const keysFile = join(root, 'agenda', 'chaves.json')
  expect(JSON.parse(await readFile(keysFile, 'utf8'))).toEqual({ openai: { apiKey: 'sk-agenda' } })
  if (process.platform !== 'win32') expect((await stat(keysFile)).mode & 0o777).toBe(0o600)

  await agenda.tick()
  expect(asked).toHaveLength(0)
  clock = at(2026, 10, 15, 8, 0, )
  await agenda.tick()
  expect(asked[0]).toMatchObject({ prompt: 'resuma as notícias', apiKey: 'sk-agenda', model: 'gpt-6-luna' })
  const queue = await agenda.queue()
  expect(queue).toHaveLength(1)
  expect(queue[0]).toMatchObject({ name: 'Notícias', text: 'Bom dia! (resuma as notícias)', error: null })
  const listed = await agenda.list()
  expect(listed.tasks[0].nextRun).toBe(at(2026, 10, 16, 8, 0))
  expect(listed.keys).toEqual(['openai'])
  const files = await readdir(join(root, 'agenda', 'resultados', daily.id))
  expect(await readFile(join(root, 'agenda', 'resultados', daily.id, files[0]), 'utf8')).toContain('## Resposta\n\nBom dia!')

  // Without a key, the task fails with a reason and the reason reaches the user.
  const noKey = await agenda.save({ task: { prompt: 'oi', providerId: 'anthropic', model: 'm', schedule: { kind: 'interval', hours: 1 } } })
  await agenda.runNow(noKey.id)
  expect((await agenda.queue()).at(-1).error).toContain('No key for anthropic')

  // Once: runs a single time, then switches off; running it by hand keeps the plan.
  const once = await agenda.save({
    task: { prompt: 'falhe', providerId: 'ollama', model: 'm', schedule: { kind: 'once', at: new Date(at(2026, 10, 15, 9)).toISOString() } },
  })
  await agenda.runNow(once.id)
  expect((await agenda.list()).tasks.find((t: any) => t.id === once.id)).toMatchObject({ enabled: true, nextRun: at(2026, 10, 15, 9) })
  clock = at(2026, 10, 15, 9, 1)
  await agenda.tick()
  const done = (await agenda.list()).tasks.find((t: any) => t.id === once.id)
  expect(done).toMatchObject({ enabled: false, nextRun: null, lastError: 'Provider down' })

  await agenda.ack(queue.map((q: any) => q.id))
  expect((await agenda.queue()).map((q: any) => q.name)).not.toContain('Notícias')
})
