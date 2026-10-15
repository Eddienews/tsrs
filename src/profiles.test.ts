import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The profile in use is read when storage.ts loads, so each test loads it anew.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  })
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

describe('profiles', () => {
  it('starts with one profile that keeps the original names', async () => {
    const storage = await import('./storage')
    expect(storage.loadProfiles()).toEqual({ active: 'default', list: [{ id: 'default', name: '' }] })
    expect(storage.SETTINGS_KEY).toBe('tsrs:settings')
    expect(storage.settingsKeyFor('ab12')).toBe('tsrs:settings:ab12')
    expect(storage.databaseFor('default')).toBe('tsrs')
    expect(storage.databaseFor('ab12')).toBe('tsrs-ab12')
    const { profileName, activeProfile } = await import('./profiles')
    expect(profileName(activeProfile())).toBe('Principal')
  })

  it('makes a profile, opens it, and reads its own keys after the reload', async () => {
    const { createProfile } = await import('./profiles')
    const reload = vi.fn()
    const id = createProfile('  Trabalho ', reload)
    expect(reload).toHaveBeenCalledOnce()
    expect(id).toMatch(/^[a-z0-9]{10}$/)
    vi.resetModules()
    const storage = await import('./storage')
    expect(storage.ACTIVE_PROFILE).toBe(id)
    expect(storage.SETTINGS_KEY).toBe(`tsrs:settings:${id}`)
    expect(storage.loadProfiles().list.map((p) => p.name)).toEqual(['', 'Trabalho'])
    // Unknown ids and the profile in use are left alone.
    const { switchProfile: again } = await import('./profiles')
    again('nope', reload)
    again(id, reload)
    expect(reload).toHaveBeenCalledOnce()
    again('default', reload)
    expect(reload).toHaveBeenCalledTimes(2)
    expect(JSON.parse(store.get('tsrs:profiles')!).active).toBe('default')
  })

  it('falls back to the first profile when the saved one is gone or broken', async () => {
    store.set('tsrs:profiles', JSON.stringify({ active: 'gone', list: [{ id: 'x1', name: 'X' }] }))
    let storage = await import('./storage')
    expect(storage.loadProfiles()).toEqual({ active: 'default', list: [{ id: 'default', name: '' }, { id: 'x1', name: 'X' }] })
    store.set('tsrs:profiles', '{broken')
    vi.resetModules()
    storage = await import('./storage')
    expect(storage.ACTIVE_PROFILE).toBe('default')
  })
})
