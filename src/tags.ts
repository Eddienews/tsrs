import type { ChatMeta } from './types'

// Tags are free words given to conversations, kept as typed (without a
// leading #) and compared without regard to case.

const MAX_LENGTH = 30

// The tags in a comma-separated text, each once.
export function parseTags(text: string): string[] {
  const tags: string[] = []
  for (const part of text.split(',')) {
    const tag = part.trim().replace(/^#+/, '').trim().slice(0, MAX_LENGTH)
    if (tag && !tags.some((x) => x.toLowerCase() === tag.toLowerCase())) tags.push(tag)
  }
  return tags
}

// Every tag in use, in alphabetical order, as first written.
export function allTags(chats: ChatMeta[]): string[] {
  const seen = new Map<string, string>()
  for (const chat of chats) {
    for (const tag of chat.tags ?? []) {
      if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

export function hasTag(chat: ChatMeta, tag: string): boolean {
  return !!chat.tags?.some((x) => x.toLowerCase() === tag.toLowerCase())
}

// The chat's tags with `tag` added, or unchanged when it has it.
export function withTag(chat: ChatMeta, tag: string): string[] {
  const tags = chat.tags ?? []
  return hasTag(chat, tag) ? tags : [...tags, tag]
}
