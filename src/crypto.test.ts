import { describe, expect, it } from 'vitest'
import { deriveKey, newSalt, seal, unseal } from './crypto'

describe('vault', () => {
  it('round-trips secrets with the right password', async () => {
    const salt = newSalt()
    const vault = await seal(await deriveKey('senha', salt), salt, { openai: 'sk-1', x: 'ç✓' })
    expect(vault.data).not.toContain('sk-1')
    expect(await unseal(await deriveKey('senha', vault.salt), vault)).toEqual({
      openai: 'sk-1',
      x: 'ç✓',
    })
  })

  it('rejects the wrong password', async () => {
    const salt = newSalt()
    const vault = await seal(await deriveKey('senha', salt), salt, { openai: 'sk-1' })
    await expect(unseal(await deriveKey('outra', salt), vault)).rejects.toThrow()
  })

  it('uses a fresh IV for every seal', async () => {
    const salt = newSalt()
    const key = await deriveKey('senha', salt)
    const [a, b] = await Promise.all([seal(key, salt, { k: 'v' }), seal(key, salt, { k: 'v' })])
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })
})
