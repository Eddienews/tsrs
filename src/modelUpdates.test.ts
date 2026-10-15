import { describe, expect, it } from 'vitest'
import { MODELS_EVERY, modelsDue, newModelCount, withFreshModels, withoutNewModels } from './modelUpdates'
import { getProvider } from './providers'
import { defaultSettings } from './storage'

const openai = getProvider('openai')
const fresh = (ids: string[]) => ({ ids, info: {} })

describe('model lists that update themselves', () => {
  it('asks once a day, only providers the user can call', () => {
    const settings = defaultSettings()
    const conn = settings.providers.openai
    expect(modelsDue(openai, conn, Date.now())).toBe(false)
    conn.apiKey = 'sk'
    expect(modelsDue(openai, conn, Date.now())).toBe(true)
    expect(modelsDue(openai, { ...conn, modelsCheckedAt: Date.now() - 1000 }, Date.now())).toBe(false)
    expect(modelsDue(openai, { ...conn, modelsCheckedAt: Date.now() - MODELS_EVERY }, Date.now())).toBe(true)
    // A local provider with no key: only once its list was loaded.
    const ollama = getProvider('ollama')
    expect(modelsDue(ollama, settings.providers.ollama, Date.now())).toBe(false)
    expect(modelsDue(ollama, { ...settings.providers.ollama, listed: ['llama'] }, Date.now())).toBe(true)
  })

  it('flags what appeared since the last list, keeps typed models and drops retired ones', () => {
    const conn = { apiKey: 'sk', baseUrl: 'x', models: ['gpt-a', 'gpt-old', 'ft:gpt-a:me'], listed: ['gpt-a', 'gpt-old'] }
    const { next, added } = withFreshModels(openai, conn, fresh(['gpt-a', 'gpt-new', 'ft:gpt-a:org:mine']), 5)
    expect(added).toEqual(['gpt-new', 'ft:gpt-a:org:mine'])
    expect(next.models).toEqual(['gpt-a', 'gpt-new', 'ft:gpt-a:org:mine', 'ft:gpt-a:me'])
    expect(next).toMatchObject({ listed: ['gpt-a', 'gpt-new', 'ft:gpt-a:org:mine'], modelsCheckedAt: 5 })
    expect(next.newModels).toEqual(['gpt-new', 'ft:gpt-a:org:mine'])
    // The first check flags nothing; a failed one (empty) changes nothing but the time.
    expect(withFreshModels(openai, { ...conn, listed: undefined }, fresh(['gpt-z']), 1).added).toEqual([])
    expect(withFreshModels(openai, conn, fresh([]), 9).next).toEqual({ ...conn, modelsCheckedAt: 9 })
  })

  it('counts the new ones until they are seen', () => {
    const settings = defaultSettings()
    settings.providers.openai.newModels = ['a', 'b']
    settings.providers.anthropic.newModels = ['c']
    expect(newModelCount(settings)).toBe(3)
    expect(newModelCount(withoutNewModels(settings))).toBe(0)
  })
})
