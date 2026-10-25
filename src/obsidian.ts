import { chatToMarkdown } from './files'
import type { Chat } from './types'

// Conversations kept as notes in an Obsidian vault: a Markdown file per
// conversation, with its details in the note's properties (YAML), written
// again as the conversation grows.

// The folder inside the vault, written with the vault's own separators.
export function vaultFolder(vault: string, folder: string): string {
  const base = vault.trim().replace(/[\\/]+$/, '')
  const inner = folder.trim().replace(/^[\\/]+|[\\/]+$/g, '')
  if (!inner) return base
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  return `${base}${sep}${inner.replace(/[\\/]+/g, sep)}`
}

// A file name Obsidian accepts, close to the title: no characters that break
// links or file systems.
export function noteName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim()
  return `${clean || 'TSRS'}.md`
}

const yaml = (value: string) => JSON.stringify(value)

export function noteContent(chat: Chat): string {
  const props = [
    '---',
    `tsrs: ${yaml(chat.id)}`,
    `created: ${new Date(chat.createdAt).toISOString()}`,
    `updated: ${new Date(chat.updatedAt).toISOString()}`,
    `model: ${yaml(chat.model)}`,
    ...(chat.project ? [`project: ${yaml(chat.project.path)}`] : []),
    `tags: [${['tsrs', ...(chat.tags ?? [])].map((tag) => yaml(tag.replace(/\s+/g, '-'))).join(', ')}]`,
    '---',
    '',
  ]
  return `${props.join('\n')}\n${chatToMarkdown(chat)}`
}
