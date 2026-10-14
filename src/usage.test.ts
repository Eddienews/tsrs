import { describe, expect, it } from 'vitest'
import { defaultSettings } from './storage'
import type { Message } from './types'
import { contextUse, costOf, modelInfo, totals } from './usage'

const reply = (usage: Message['usage']): Message => ({ id: 'x', role: 'assistant', content: '', usage })

describe('usage', () => {
  it('prefers the cost reported by the provider', () => {
    expect(costOf({ input: 1, output: 1, cost: 0.5 }, { inputPrice: 1, outputPrice: 1 })).toBe(0.5)
  })

  it('computes cost from per-million prices', () => {
    const info = { inputPrice: 4, outputPrice: 20 }
    expect(costOf({ input: 1_000_000, output: 500_000 }, info)).toBe(14)
    expect(costOf({ input: 1, output: 1 }, {})).toBeUndefined()
  })

  it('switches rate card for long prompts', () => {
    const info = modelInfo(defaultSettings(), 'anthropic', 'claude-haiku-5-5')
    expect(costOf({ input: 100_000, output: 0 }, info)).toBeCloseTo(0.01)
    expect(costOf({ input: 200_000, output: 100_000 }, info)).toBeCloseTo(0.35)
  })

  it('falls back to the built-in table and lets reported data win', () => {
    const settings = defaultSettings()
    expect(modelInfo(settings, 'anthropic', 'claude-opus-5-5').inputPrice).toBe(4)
    settings.providers.anthropic.modelInfo = { 'claude-opus-5-5': { context: 123 } }
    expect(modelInfo(settings, 'anthropic', 'claude-opus-5-5')).toMatchObject({
      context: 123,
      inputPrice: 4,
    })
    expect(modelInfo(settings, 'openai', 'unknown')).toEqual({})
  })

  it('totals a conversation', () => {
    const messages = [
      reply({ input: 10, output: 5, cost: 0.1 }),
      reply(undefined),
      reply({ input: 20, output: 5 }),
    ]
    expect(totals(messages)).toEqual({ tokens: 40, cost: 0.1 })
    expect(totals([reply({ input: 1, output: 1 })]).cost).toBeUndefined()
  })

  it('measures context use from the latest reply', () => {
    const messages = [reply({ input: 10, output: 5 }), reply({ input: 700, output: 100 })]
    expect(contextUse(messages, { context: 1000 })).toBe(0.8)
    expect(contextUse(messages, {})).toBeUndefined()
    expect(contextUse([], { context: 1000 })).toBeUndefined()
  })
})

it('prices cache reads and writes apart from plain input', () => {
  // 1M plain + 1M written + 1M read at $2 input: 2 + 2.5 + 0.2, plus 1M output at $10.
  const usage = { input: 3_000_000, output: 1_000_000, cacheWrite: 1_000_000, cacheRead: 1_000_000 }
  expect(costOf(usage, { inputPrice: 2, outputPrice: 10 })).toBeCloseTo(14.7)
  // A known cache price replaces the tenth.
  expect(costOf(usage, { inputPrice: 2, outputPrice: 10, cacheReadPrice: 0.5 })).toBeCloseTo(15)
})
