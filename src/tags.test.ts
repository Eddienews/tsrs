import { describe, expect, it } from 'vitest'
import { allTags, hasTag, parseTags, withTag } from './tags'
import type { ChatMeta } from './types'

const chat = (tags?: string[]): ChatMeta => ({
  id: 'c',
  title: 't',
  createdAt: 0,
  updatedAt: 0,
  providerId: 'p',
  model: 'm',
  tags,
})

describe('tags', () => {
  it('are read from a comma-separated text, without # and repeats', () => {
    expect(parseTags(' #trabalho, Ideias ,,trabalho, #')).toEqual(['trabalho', 'Ideias'])
    expect(parseTags('')).toEqual([])
  })

  it('are listed once across chats, in order', () => {
    expect(allTags([chat(['b', 'Arte']), chat(['arte', 'a']), chat()])).toEqual(['a', 'Arte', 'b'])
  })

  it('match and are added without regard to case', () => {
    expect(hasTag(chat(['Ideias']), 'ideias')).toBe(true)
    expect(withTag(chat(['Ideias']), 'IDEIAS')).toEqual(['Ideias'])
    expect(withTag(chat(), 'nova')).toEqual(['nova'])
  })
})
