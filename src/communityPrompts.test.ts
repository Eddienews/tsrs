import { describe, expect, it } from 'vitest'
import { COMMUNITY_CATEGORIES, communityPrompts, matchesQuery } from './communityPrompts'
import { promptFields } from './prompts'

describe('community prompts', () => {
  const pt = communityPrompts('pt')
  const en = communityPrompts('en')

  it('has over 50 prompts in both languages, with stable unique ids', () => {
    expect(pt.length).toBeGreaterThanOrEqual(50)
    expect(new Set(pt.map((p) => p.id)).size).toBe(pt.length)
    expect(en.map((p) => p.id)).toEqual(pt.map((p) => p.id))
    for (const [i, prompt] of pt.entries()) {
      expect(prompt.id).toMatch(/^community-[a-z0-9-]+$/)
      expect(COMMUNITY_CATEGORIES).toContain(prompt.category)
      for (const version of [prompt, en[i]]) {
        expect(version.title.trim(), version.id).not.toBe('')
        expect(version.text.length, version.id).toBeGreaterThan(40)
      }
      // Same fields count and steps in both languages.
      expect(promptFields(en[i].text).length, prompt.id).toBe(promptFields(prompt.text).length)
      expect(en[i].steps?.length ?? 0, prompt.id).toBe(prompt.steps?.length ?? 0)
    }
    for (const category of COMMUNITY_CATEGORIES) expect(pt.filter((p) => p.category === category).length).toBeGreaterThanOrEqual(5)
  })

  it('finds prompts by words, accents ignored', () => {
    expect(pt.filter((p) => matchesQuery(p, 'codigo testes')).map((p) => p.id)).toContain('community-write-tests')
    expect(pt.filter((p) => matchesQuery(p, 'PLANILHA formula')).map((p) => p.id)).toEqual(['community-formula'])
    expect(pt.every((p) => matchesQuery(p, ''))).toBe(true)
  })
})
