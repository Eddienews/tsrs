import { expect, test } from 'vitest'
import { gitStamp, versionInfo } from '../render/version-plugin.mjs'
import { VERSION, versionDetails, versionLabel } from './version'

const base = { version: '0.2.0', commit: '16e03fe', branch: 'main', dirty: false, date: '2026-10-14T23:30:00-04:00', dev: false }

test('the label names the version and the commit', () => {
  expect(versionLabel(base)).toBe('v0.2.0 · 16e03fe')
  expect(versionLabel({ ...base, dirty: true })).toBe('v0.2.0 · 16e03fe*')
  expect(versionLabel({ ...base, commit: '' })).toBe('v0.2.0')
})

test('the details say where the code came from and how it runs', () => {
  expect(versionDetails({ ...base, dev: true }).split('\n')).toEqual([
    'TSRS v0.2.0 · 16e03fe',
    'Branch: main',
    'Commit de 2026-10-14 23:30',
    'Rodando pelo npm run dev',
  ])
  expect(versionDetails({ ...base, commit: '', branch: '', date: '' })).toContain('Sem informação do git')
  expect(versionDetails({ ...base, branch: 'HEAD', dirty: true })).toContain('* com alterações')
})

test('the running version comes from package.json and git', async () => {
  const pkg = await import('../package.json')
  expect(VERSION.version).toBe(pkg.version)
  const info = versionInfo(false)
  expect(info.version).toBe(pkg.version)
  // In a clone, the commit is a short hash.
  if (info.commit) expect(info.commit).toMatch(/^[0-9a-f]{7,}$/)
})

test('notices a commit by the dates of git files, without running git', () => {
  expect(gitStamp()).toBe(gitStamp())
  expect(gitStamp('/no/such/folder')).toBe('HEAD:0|index:0|packed-refs:0')
})
