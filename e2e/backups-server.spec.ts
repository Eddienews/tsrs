import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { KEEP_DAYS, backupMeta, dayOf, profileRoot, saveBackup } from '../server/backups.mjs'

const backup = (chats: number, extra: object = {}) =>
  JSON.stringify({ app: 'tsrs', version: 1, chats: Array.from({ length: chats }, (_, i) => ({ id: `c${i}`, messages: [] })), ...extra })
const DAY = 86_400_000

test('describes a backup and refuses anything else', () => {
  const now = new Date(2026, 9, 15, 14, 30).getTime()
  expect(backupMeta(backup(2), now)).toMatchObject({ day: '2026-10-15', chats: 2, keys: 'none' })
  expect(backupMeta(backup(1, { settings: { vault: { salt: 's' } } }), now).keys).toBe('sealed')
  expect(() => backupMeta('nope', now)).toThrow('not valid JSON')
  expect(() => backupMeta('{"app":"other","chats":[]}', now)).toThrow('not a TSRS backup')
})

test('keeps the latest, the end of each earlier day, and the one before a shrink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-backups-'))
  const day1 = new Date(2026, 9, 14, 20, 0).getTime()
  await saveBackup(root, backup(5), day1)
  await saveBackup(root, backup(6), day1 + 60_000)
  // The next day: yesterday's last state is kept by its date.
  const day2 = day1 + DAY
  await saveBackup(root, backup(7), day2)
  expect(JSON.parse(await readFile(join(root, `tsrs-${dayOf(day1)}.json`), 'utf8')).chats).toHaveLength(6)
  // An emptied browser saves fewer conversations: the fuller one is kept aside.
  await saveBackup(root, backup(0), day2 + 1000)
  const files = await readdir(root)
  const before = files.find((f) => f.endsWith('-antes.json'))
  expect(before).toBeTruthy()
  expect(JSON.parse(await readFile(join(root, before!), 'utf8')).chats).toHaveLength(7)
  expect(JSON.parse(await readFile(join(root, 'atual.json'), 'utf8')).chats).toHaveLength(0)
  expect(JSON.parse(await readFile(join(root, 'atual.meta.json'), 'utf8'))).toMatchObject({ chats: 0, day: dayOf(day2) })
  // Nothing half-written is left behind.
  expect(files.some((f) => f.endsWith('.tmp'))).toBe(false)
})

test('drops daily copies older than two weeks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-backups-'))
  const now = new Date(2026, 9, 15, 12, 0).getTime()
  const old = `tsrs-${dayOf(now - (KEEP_DAYS + 1) * DAY)}.json`
  const recent = `tsrs-${dayOf(now - 2 * DAY)}.json`
  await writeFile(join(root, old), backup(1))
  await writeFile(join(root, recent), backup(1))
  await writeFile(join(root, 'mine.json'), '{}')
  await saveBackup(root, backup(1), now)
  expect(existsSync(join(root, old))).toBe(false)
  expect(existsSync(join(root, recent))).toBe(true)
  expect(existsSync(join(root, 'mine.json'))).toBe(true)
})

test("keeps each profile's backups in a folder of its own", () => {
  expect(profileRoot('/b', null)).toBe('/b')
  expect(profileRoot('/b', 'a1b2c3')).toBe(join('/b', 'perfis', 'a1b2c3'))
  expect(() => profileRoot('/b', '../x')).toThrow('Unknown profile')
  expect(() => profileRoot('/b', 'A B')).toThrow('Unknown profile')
})
