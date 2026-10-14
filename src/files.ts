import { locale, t } from './i18n'
import type { Attachment, Chat, Folder, Memory, Persona, SavedPrompt } from './types'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

const BACKUP_APP = 'tsrs'
const BACKUP_VERSION = 1

async function base64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  // Encoded in slices: spreading a large file into one call overflows the stack.
  const SLICE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + SLICE))
  }
  return btoa(binary)
}

export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(t('"{name}" passa de 10 MB.', { name: file.name }))
  }
  const base = { id: crypto.randomUUID(), name: file.name || t('colado') }
  if (file.type.startsWith('image/')) {
    return { ...base, mime: file.type, kind: 'image', data: await base64(file) }
  }
  if (file.type === 'application/pdf') {
    return { ...base, mime: file.type, kind: 'pdf', data: await base64(file) }
  }
  const text = await file.text()
  if (text.includes('\u0000')) {
    throw new Error(t('"{name}" não é imagem, PDF nem texto.', { name: file.name }))
  }
  return { ...base, mime: file.type || 'text/plain', kind: 'text', data: text }
}

export function download(name: string, content: string, mime: string): void {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type: mime }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}

export function fileName(title: string, extension: string): string {
  const slug = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${slug || t('conversa')}.${extension}`
}

export function chatToMarkdown(chat: Chat): string {
  const parts = [
    `# ${chat.title}`,
    `_${chat.model} · ${new Date(chat.createdAt).toLocaleString(locale())}_`,
  ]
  for (const message of chat.messages) {
    parts.push(`## ${message.role === 'user' ? t('Você') : t('Assistente')}`)
    if (message.content) parts.push(message.content)
    if (message.attachments?.length) {
      const names = message.attachments.map((a) => a.name).join(', ')
      parts.push(`_${t('Anexos: {names}', { names })}_`)
    }
    if (message.error) parts.push(`> ${t('Erro: {message}', { message: message.error })}`)
  }
  return parts.join('\n\n') + '\n'
}

export interface Library {
  folders: Folder[]
  personas: Persona[]
  prompts: SavedPrompt[]
  memories: Memory[]
}

// Backups hold conversations and the library; API keys never leave the browser.
export function buildBackup(chats: Chat[], library: Library): string {
  return JSON.stringify(
    { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Date.now(), ...library, chats },
    null,
    2,
  )
}

function list<T>(value: unknown, field: keyof T): T[] {
  return (Array.isArray(value) ? value : []).filter(
    (item) => typeof item?.id === 'string' && typeof item[field] === 'string',
  )
}

export function parseBackup(text: string): Library & { chats: Chat[] } {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(t('O arquivo não é um JSON válido.'))
  }
  if (data?.app !== BACKUP_APP || !Array.isArray(data.chats)) {
    throw new Error(t('O arquivo não é um backup do TSRS.'))
  }
  if (data.version > BACKUP_VERSION) {
    throw new Error(t('O backup foi criado por uma versão mais nova do TSRS.'))
  }
  const chats = data.chats.filter(
    (c: any) => typeof c?.id === 'string' && Array.isArray(c.messages),
  )
  return {
    chats,
    folders: list<Folder>(data.folders, 'name'),
    personas: list<Persona>(data.personas, 'system'),
    prompts: list<SavedPrompt>(data.prompts, 'text'),
    memories: list<Memory>(data.memories, 'text'),
  }
}
