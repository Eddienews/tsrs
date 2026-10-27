import { describe, expect, it } from 'vitest'
import { HANDOFF_PROMPT, SUMMARY_PROMPT, contextResetMark, continuedChat, sinceSummary, withSummary } from './summary'
import type { ChatMeta, Message } from './types'

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

  it('starts after a cleared context, leaving earlier summaries behind', () => {
    const reset = contextResetMark()
    expect(reset).toMatchObject({ role: 'assistant', content: '', contextReset: true })
    const thread = [m('a'), m('s1', { summary: true }), m('b'), reset, m('c')]
    expect(sinceSummary(thread)).toEqual({ messages: [thread[4]] })
    // A summary made after the mark is used again.
    const later = [...thread, m('s2', { summary: true }), m('d')]
    expect(sinceSummary(later)).toEqual({ summary: 's2', messages: [later[6]] })
  })

  it('adds the summary after the system prompt', () => {
    expect(withSummary('Seja breve.', undefined)).toBe('Seja breve.')
    expect(withSummary('Seja breve.', 'Tudo')).toMatch(/^Seja breve\.\n\n.*\n\nTudo$/s)
    expect(withSummary('', 'Tudo')).toMatch(/^Summary.*Tudo$/s)
  })

  it('asks for the summary in the language of the messages', () => {
    // Small local models otherwise answer in the language of this (English) instruction.
    expect(SUMMARY_PROMPT).toMatch(/same language the messages are written in/)
  })
})

describe('continuing in a new chat', () => {
  const meta: ChatMeta = {
    id: 'old',
    title: 'Site da NorthWind',
    createdAt: 1,
    updatedAt: 2,
    providerId: 'anthropic',
    model: 'claude-opus-5-5',
    folderId: 'f1',
    params: { system: 'Seja breve.' },
    project: { path: '/p/site', name: 'site' },
    tags: ['site'],
    pinned: true,
    archived: true,
    obsidianNote: 'Site.md',
    scheduleId: 's1',
  }

  it('keeps the model, settings, folder and project files, and starts from the handoff', () => {
    const { meta: next, first } = continuedChat(meta, '## Próximo passo\nO rodapé.', 10)
    expect(next.id).not.toBe('old')
    expect(next).toMatchObject({
      title: 'Site da NorthWind (continuação)',
      providerId: 'anthropic',
      model: 'claude-opus-5-5',
      folderId: 'f1',
      params: { system: 'Seja breve.' },
      project: { path: '/p/site', name: 'site' },
      tags: ['site'],
      createdAt: 10,
      updatedAt: 10,
    })
    // What belongs to the old conversation only.
    for (const key of ['pinned', 'archived', 'obsidianNote', 'scheduleId'] as const) expect(next[key]).toBeUndefined()
    expect(first).toMatchObject({ role: 'assistant', summary: true, handoff: { from: 'old' }, content: '## Próximo passo\nO rodapé.' })
    // The new conversation sends the handoff in place of the old messages.
    expect(sinceSummary([first, m('e agora?')])).toEqual({ summary: first.content, messages: [m('e agora?')] })
  })

  it('does not pile up "(continuação)" on a chain of continuations', () => {
    const once = continuedChat(meta, 'x').meta
    expect(continuedChat(once, 'y').meta.title).toBe('Site da NorthWind (continuação)')
  })

  it('asks for the next step and the language of the messages', () => {
    expect(HANDOFF_PROMPT).toMatch(/next step/)
    expect(HANDOFF_PROMPT).toMatch(/same language the messages are written in/)
  })
})
