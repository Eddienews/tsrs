import { locale, t } from './i18n'
import { isOffice, isOtherDocument, officeText, otherDocument } from './office'
import { isOtherSpreadsheet, isSpreadsheet, otherSpreadsheet, spreadsheetText } from './spreadsheet'
import type {
  Attachment,
  Chat,
  Folder,
  KnowledgeBase,
  KnowledgeDoc,
  Memory,
  Persona,
  SavedPrompt,
  Settings,
} from './types'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
// Audio may be longer: 25 MB is also the most transcription APIs take.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

const AUDIO_EXTENSIONS: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
}

// The audio type of a file, from the browser or its extension, or null.
export function audioType(file: Pick<File, 'name' | 'type'>): string | null {
  if (file.type.startsWith('audio/')) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type && file.type !== 'application/octet-stream' ? null : (AUDIO_EXTENSIONS[extension] ?? null)
}

const BACKUP_APP = 'tsrs'
const BACKUP_VERSION = 1

export async function base64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  // Encoded in slices: spreading a large file into one call overflows the stack.
  const SLICE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + SLICE))
  }
  return btoa(binary)
}

// Videos are read for frames, whatever their size: the file is not kept.
export function isVideo(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|m4v|webm|mov|mkv|ogv)$/i.test(file.name)
}

// Photos past the limit are made smaller instead of refused: image models
// scale references to about one megapixel anyway. The longest side goes down
// to 3072 px (then 2048) as a JPEG, or PNG/WebP when the photo has
// transparency. GIFs and SVGs are not resized.
const RESIZABLE = /^image\/(png|jpeg|webp|avif|bmp|heic|heif)$/
const SIDES = [3072, 2048]

export type ImageResizer = (file: Blob, maxSide: number) => Promise<Blob>

// Draws the image smaller in the browser; keeps the alpha channel of PNG and WebP.
async function canvasResize(file: Blob, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp'
  const pixels = keepAlpha ? context.getImageData(0, 0, canvas.width, canvas.height).data : undefined
  const transparent = !!pixels && pixels.some((value, i) => i % 4 === 3 && value < 255)
  return canvas.convertToBlob(transparent ? { type: 'image/webp', quality: 0.92 } : { type: 'image/jpeg', quality: 0.9 })
}

// A smaller copy of a photo that passes the limit, named for its new type,
// or null when it cannot be made small enough.
export async function shrinkImage(file: File, resize: ImageResizer = canvasResize): Promise<File | null> {
  if (!RESIZABLE.test(file.type)) return null
  for (const side of SIDES) {
    let smaller: Blob
    try {
      smaller = await resize(file, side)
    } catch {
      return null
    }
    if (smaller.size <= MAX_ATTACHMENT_BYTES) {
      const extension = smaller.type === 'image/webp' ? 'webp' : smaller.type === 'image/png' ? 'png' : 'jpg'
      const name = (file.name || t('colado')).replace(/\.[^.]+$/, '') + `.${extension}`
      return new File([smaller], name, { type: smaller.type })
    }
  }
  return null
}

export async function readAttachment(file: File, resize?: ImageResizer): Promise<Attachment> {
  const base = { id: crypto.randomUUID(), name: file.name || t('colado') }
  if (isVideo(file)) {
    const { videoFrames } = await import('./videoFrames')
    const { duration, frames } = await videoFrames(file)
    return { ...base, mime: file.type || 'video/mp4', kind: 'video', data: '', frames, duration }
  }
  const audio = audioType(file)
  if (audio) {
    if (file.size > MAX_AUDIO_BYTES) throw new Error(t('"{name}" passa de 25 MB.', { name: file.name }))
    return { ...base, mime: audio, kind: 'audio', data: await base64(file) }
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const smaller = file.type.startsWith('image/') ? await shrinkImage(file, resize) : null
    if (smaller) return { ...base, name: smaller.name, mime: smaller.type, kind: 'image', data: await base64(smaller) }
    throw new Error(t('"{name}" passa de 10 MB.', { name: file.name }))
  }
  if (file.type.startsWith('image/')) {
    return { ...base, mime: file.type, kind: 'image', data: await base64(file) }
  }
  if (file.type === 'application/pdf') {
    return { ...base, mime: file.type, kind: 'pdf', data: await base64(file) }
  }
  if (isSpreadsheet(file)) {
    return { ...base, mime: 'text/csv', kind: 'text', data: await spreadsheetText(file) }
  }
  if (isOtherSpreadsheet(file.name)) throw new Error(otherSpreadsheet(file.name))
  if (isOffice(file)) {
    return { ...base, mime: 'text/markdown', kind: 'text', data: await officeText(file) }
  }
  if (isOtherDocument(file.name)) throw new Error(otherDocument(file.name))
  const text = await file.text()
  if (text.includes('\u0000')) {
    throw new Error(t('"{name}" não é imagem, PDF, áudio nem texto.', { name: file.name }))
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
    if (message.contextReset) {
      parts.push('---', `_${t('Contexto limpo aqui: o modelo não vê as mensagens acima.')}_`)
      continue
    }
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
  knowledgeBases: KnowledgeBase[]
}

export interface Backup extends Library {
  chats: Chat[]
  docs: KnowledgeDoc[]
  // Only in automatic backups: the settings as stored, with the API keys
  // sealed by the user's password or left out.
  settings?: Partial<Settings>
}

// Backups hold conversations, the library and knowledge base documents; API
// keys never leave the browser.
export function buildBackup(backup: Backup): string {
  return JSON.stringify(
    { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Date.now(), ...backup },
    null,
    2,
  )
}

function list<T>(value: unknown, field: keyof T): T[] {
  return (Array.isArray(value) ? value : []).filter(
    (item) => typeof item?.id === 'string' && typeof item[field] === 'string',
  )
}

export function parseBackup(text: string): Backup {
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
    knowledgeBases: list<KnowledgeBase>(data.knowledgeBases, 'name'),
    docs: list<KnowledgeDoc>(data.docs, 'baseId').filter((d) => Array.isArray(d.chunks)),
    ...(data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
      ? { settings: data.settings }
      : {}),
  }
}
