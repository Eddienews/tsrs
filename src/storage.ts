import { defaultAppearance } from './appearance'
import { detectLanguage } from './i18n'
import { PROVIDERS } from './providers'
import type { Chat, ChatMeta, Message, Settings } from './types'

// Settings are small and read synchronously at startup: localStorage.
// Conversations live in IndexedDB, split in two stores so the sidebar can list
// them without reading any message: `meta` (one small record per chat) and
// `threads` (the messages, read when a chat is opened).

export const SETTINGS_KEY = 'tsrs:settings'
const DB_NAME = 'tsrs'
const DB_VERSION = 2
const META = 'meta'
const THREADS = 'threads'
// Version 1 kept whole conversations in a single store.
const LEGACY_CHATS = 'chats'

interface Thread {
  id: string
  messages: Message[]
}

export function defaultSettings(): Settings {
  return {
    language: detectLanguage(),
    appearance: defaultAppearance(),
    providers: Object.fromEntries(
      PROVIDERS.map((p) => [
        p.id,
        { apiKey: '', baseUrl: p.baseUrl, models: p.defaultModels },
      ]),
    ),
    providerId: PROVIDERS[0].id,
    model: PROVIDERS[0].defaultModels[0] ?? '',
    systemPrompt: '',
    folders: [],
    personas: [],
    prompts: [],
    mcpServers: [],
    webSearch: false,
    webFetch: false,
    autoTitle: true,
    previewHint: true,
    autoPreview: false,
    dictation: 'auto',
    showThinking: true,
    promptCache: true,
    titleModel: '',
  }
}

export function loadSettings(): Settings {
  const defaults = defaultSettings()
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (!saved) return defaults
    // Merge so fields and providers added in later versions get their defaults.
    return { ...defaults, ...saved, providers: { ...defaults.providers, ...saved.providers } }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function split({ messages, ...meta }: Chat): [ChatMeta, Thread] {
  return [meta, { id: meta.id, messages }]
}

let dbPromise: Promise<IDBDatabase> | undefined

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = (event) => {
      const database = open.result
      const upgrade = open.transaction!
      const meta = database.createObjectStore(META, { keyPath: 'id' })
      const threads = database.createObjectStore(THREADS, { keyPath: 'id' })
      if (event.oldVersion === 1) {
        const legacy = upgrade.objectStore(LEGACY_CHATS).getAll()
        legacy.onsuccess = () => {
          for (const chat of legacy.result as Chat[]) {
            const [chatMeta, thread] = split(chat)
            meta.put(chatMeta)
            threads.put(thread)
          }
          database.deleteObjectStore(LEGACY_CHATS)
        }
      }
    }
    open.onsuccess = () => {
      // Let another tab delete or upgrade the database; this one reopens it on
      // its next read or write.
      open.result.onversionchange = () => {
        open.result.close()
        dbPromise = undefined
      }
      resolve(open.result)
    }
    open.onerror = () => reject(open.error)
  })
  return dbPromise
}

// Removes every conversation and the settings, API keys included.
export async function deleteEverything(): Promise<void> {
  const open = dbPromise
  dbPromise = undefined
  if (open) (await open.catch(() => null))?.close()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  localStorage.removeItem(SETTINGS_KEY)
}

async function run<T>(
  name: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const store = (await db()).transaction(name, mode).objectStore(name)
  return new Promise((resolve, reject) => {
    const request = op(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function loadMetas(): Promise<ChatMeta[]> {
  return run<ChatMeta[]>(META, 'readonly', (s) => s.getAll())
}

export async function loadThread(id: string): Promise<Message[]> {
  const thread = await run<Thread | undefined>(THREADS, 'readonly', (s) => s.get(id))
  return thread?.messages ?? []
}

export async function saveMeta(meta: ChatMeta): Promise<void> {
  await run(META, 'readwrite', (s) => s.put(meta))
}

export async function saveThread(id: string, messages: Message[]): Promise<void> {
  await run(THREADS, 'readwrite', (s) => s.put({ id, messages }))
}

export async function saveChats(chats: Chat[]): Promise<void> {
  await Promise.all(
    chats.flatMap((chat) => {
      const [meta, thread] = split(chat)
      return [saveMeta(meta), saveThread(thread.id, thread.messages)]
    }),
  )
}

export async function deleteChat(id: string): Promise<void> {
  await Promise.all([
    run(META, 'readwrite', (s) => s.delete(id)),
    run(THREADS, 'readwrite', (s) => s.delete(id)),
  ])
}

// Whole conversations, for backups.
export async function loadChats(): Promise<Chat[]> {
  const [metas, threads] = await Promise.all([
    loadMetas(),
    run<Thread[]>(THREADS, 'readonly', (s) => s.getAll()),
  ])
  const messages = new Map(threads.map((t) => [t.id, t.messages]))
  return metas.map((meta) => ({ ...meta, messages: messages.get(meta.id) ?? [] }))
}

// Ids of the conversations with a message containing `needle` (lowercase).
// Walks the store with a cursor so only one conversation is in memory at a time.
export async function searchThreads(needle: string): Promise<string[]> {
  const store = (await db()).transaction(THREADS, 'readonly').objectStore(THREADS)
  return new Promise((resolve, reject) => {
    const found: string[] = []
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return resolve(found)
      const thread = cursor.value as Thread
      if (thread.messages.some((m) => m.content.toLowerCase().includes(needle))) {
        found.push(thread.id)
      }
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}
