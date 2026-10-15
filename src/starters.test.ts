import { describe, expect, it } from 'vitest'
import { promptFields } from './prompts'
import { missingStarters, starterPersonas, starterPrompts } from './starters'

describe('starters', () => {
  it('have the same items, under the same ids, in both languages', () => {
    const ids = (items: { id: string }[]) => items.map((item) => item.id)
    expect(ids(starterPersonas('en'))).toEqual(ids(starterPersonas('pt')))
    expect(ids(starterPrompts('en'))).toEqual(ids(starterPrompts('pt')))
    const all = [...ids(starterPersonas('pt')), ...ids(starterPrompts('pt'))]
    expect(new Set(all).size).toBe(all.length)
  })

  it('are written in full, and prompts ask for the same number of fields', () => {
    for (const language of ['pt', 'en'] as const) {
      for (const persona of starterPersonas(language)) {
        expect(persona.name && persona.system && persona.starters?.length).toBeTruthy()
      }
    }
    const pt = starterPrompts('pt')
    starterPrompts('en').forEach((prompt, i) => {
      expect(promptFields(prompt.text).length).toBeGreaterThan(0)
      expect(promptFields(prompt.text)).toHaveLength(promptFields(pt[i].text).length)
    })
  })

  it('lists only the ones a library lacks', () => {
    const [first, ...rest] = starterPrompts('pt')
    const missing = missingStarters({ personas: starterPersonas('pt'), prompts: rest }, 'en')
    expect(missing.personas).toEqual([])
    expect(missing.prompts).toEqual([starterPrompts('en')[0]])
    expect(missing.prompts[0].id).toBe(first.id)
  })
})
