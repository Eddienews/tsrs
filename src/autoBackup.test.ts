import { describe, expect, it } from 'vitest'
import { backupToOffer, settingsForBackup, type BackupMeta } from './autoBackup'
import { defaultSettings } from './storage'

const meta = (chats: number): BackupMeta => ({ savedAt: 1, day: '2026-10-15', chats, keys: 'none', size: 10 })

describe('automatic backup', () => {
  it('never takes a plain API key to disk, but keeps the sealed vault', () => {
    const settings = defaultSettings()
    settings.providers.anthropic.apiKey = 'sk-plain'
    settings.mediaKeys = { elevenlabs: 'xi-plain' }
    const plain = JSON.stringify(settingsForBackup(JSON.stringify(settings)))
    expect(plain).not.toContain('sk-plain')
    expect(plain).not.toContain('xi-plain')
    const vault = { salt: 's', iv: 'i', data: 'sealed' }
    const sealed = settingsForBackup(JSON.stringify({ ...settings, vault }))
    expect(sealed?.vault).toEqual(vault)
    expect(JSON.stringify(sealed)).not.toContain('sk-plain')
    expect(settingsForBackup(null)).toBeUndefined()
    expect(settingsForBackup('not json')).toBeUndefined()
  })

  it('offers a restore only to an empty browser, of a backup with conversations', () => {
    const status = { dir: '/b', latest: meta(3) }
    expect(backupToOffer(0, status)).toEqual(meta(3))
    expect(backupToOffer(2, status)).toBeNull()
    expect(backupToOffer(0, { dir: '/b', latest: meta(0) })).toBeNull()
    expect(backupToOffer(0, { dir: '/b', latest: null })).toBeNull()
    expect(backupToOffer(0, { off: true })).toBeNull()
    expect(backupToOffer(0, null)).toBeNull()
  })
})
