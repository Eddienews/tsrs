import { describe, expect, it } from 'vitest'
import { sinceSummary, withSummary } from './summary'
import type { Message } from './types'

const m = (id: string, fields: Partial<Message> = {}): Message => ({
  id,
  role: 'user',
  content: id,
  ...fields,
})

describe('summaries', () => {
  it('keeps everything when there is no summary', () => {
    const thread = [m('a'), m('b')]
    expect(sinceSummary(thread)).toEqual({ messages: thread })
  })

  it('starts after the latest summary', () => {
    const thread = [m('a'), m('s1', { summary: true }), m('b'), m('s2', { summary: true }), m('c')]
    const { summary, messages } = sinceSummary(thread)
    expect(summary).toBe('s2')
    expect(messages.map((x) => x.id)).toEqual(['c'])
  })

  it('adds the summary after the system prompt', () => {
    expect(withSummary('Seja breve.', undefined)).toBe('Seja breve.')
    expect(withSummary('Seja breve.', 'Tudo')).toMatch(/^Seja breve\.\n\n.*\n\nTudo$/s)
    expect(withSummary('', 'Tudo')).toMatch(/^Summary.*Tudo$/s)
  })
})
