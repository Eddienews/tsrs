import { defaultAppearance } from './appearance'
import { detectLanguage } from './i18n'
import { PROVIDERS } from './providers'
import { starterPersonas, starterPrompts } from './starters'
import type { Chat, ChatMeta, KnowledgeDoc, Message, Settings } from './types'

// Settings are small and read synchronously at startup: localStorage.
// Conversations live in IndexedDB, split in two stores so the sidebar can list
// them without reading any message: `meta` (one small record per chat) and
// `threads` (the messages, read when a chat is opened). Knowledge base
// documents live in `docs`, and `handles` keeps the sync folder's handle.

// Profiles (personal, work…) keep everything apart: each has its own settings
// key and its own database. The first profile uses the original names, so
// nothing moves when a second one is made. The profile in use is read when the
// page loads; switching reloads the page.
export const PROFILES_KEY = 'tsrs:profiles'
export const DEFAULT_PROFILE = 'default'

export interface Profile {
  id: string
  // Empty for the first profile until it is named.
  name: string
}

export interface Profiles {
  active: string
  list: Profile[]
}

export function loadProfiles(): Profiles {
  const fallback = { active: DEFAULT_PROFILE, list: [{ id: DEFAULT_PROFILE, name: '' }] }
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(PROFILES_KEY) ?? 'null') as Profiles | null
    if (!saved?.list?.length) return fallback
    const list = saved.list.some((p) => p.id === DEFAULT_PROFILE) ? saved.list : [fallback.list[0], ...saved.list]
    return { list, active: list.some((p) => p.id === saved.active) ? saved.active : DEFAULT_PROFILE }
  } catch {
    return fallback
  }
}

export function saveProfiles(profiles: Profiles): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

export function settingsKeyFor(profile: string): string {
  return profile === DEFAULT_PROFILE ? 'tsrs:settings' : `tsrs:settings:${profile}`
}

export function databaseFor(profile: string): string {
  return profile === DEFAULT_PROFILE ? 'tsrs' : `tsrs-${profile}`
}

export const ACTIVE_PROFILE = loadProfiles().active
export const SETTINGS_KEY = settingsKeyFor(ACTIVE_PROFILE)
const DB_NAME = databaseFor(ACTIVE_PROFILE)
const DB_VERSION = 3
const META = 'meta'
const THREADS = 'threads'
const DOCS = 'docs'
const HANDLES = 'handles'
// Version 1 kept whole conversations in a single store.
const LEGACY_CHATS = 'chats'

interface Thread {
  id: string
  messages: Message[]
}

// A first run starts with the starter personas and prompts, in its language.
export function defaultSettings(): Settings {
  const language = detectLanguage()
  return {
    language,
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
    personas: starterPersonas(language),
    prompts: starterPrompts(language),
    mcpServers: [],
    webSearch: false,
    webFetch: false,
    autoTitle: true,
    previewHint: true,
    autoPreview: false,
    doneSound: false,
    shortcuts: {},
    dictation: 'auto',
    showThinking: true,
    promptCache: true,
    titleModel: '',
    memory: false,
    memories: [],
    media: {
      image: { source: 'auto', model: '', options: '' },
      video: { source: 'auto', model: '', options: '' },
      audio: { source: 'auto', model: '', options: '' },
    },
    mediaKeys: {},
    readAloud: { source: 'browser', model: '', options: '' },
    embedProvider: 'off',
    embedModel: '',
    proxyUrl: 'http://localhost:8787',
    knowledgeBases: [],
    sync: { folder: '', password: '', deleted: {} },
  }
}

// Before video and audio, images had a source and a model of their own.
function mediaFromImage(saved: { imageProvider?: string; imageModel?: string }) {
  if (!saved.imageProvider) return {}
  return { image: { source: saved.imageProvider, model: saved.imageModel ?? '', options: '' } }
}

// Saved settings over the defaults, so fields and providers added in later
// versions get their defaults.
export function mergeSettings(saved: Partial<Settings> & { imageProvider?: string; imageModel?: string }): Settings {
  const defaults = defaultSettings()
  return {
    ...defaults,
    ...saved,
    providers: { ...defaults.providers, ...saved.providers },
    media: { ...defaults.media, ...mediaFromImage(saved), ...saved.media },
  }
}

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    return saved ? mergeSettings(saved) : defaultSettings()
  } catch {
    return defaultSettings()
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
      if (event.oldVersion < 3) {
        database.createObjectStore(DOCS, { keyPath: 'id' }).createIndex('baseId', 'baseId')
        database.createObjectStore(HANDLES)
      }
      if (event.oldVersion >= 2) return
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

// Removes another profile's conversations and settings, and the profile.
export async function deleteProfile(id: string): Promise<void> {
  if (id === DEFAULT_PROFILE || id === ACTIVE_PROFILE) throw new Error('Not this profile.')
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseFor(id))
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  localStorage.removeItem(settingsKeyFor(id))
  const profiles = loadProfiles()
  saveProfiles({ ...profiles, list: profiles.list.filter((p) => p.id !== id) })
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

export function loadDocs(): Promise<KnowledgeDoc[]> {
  return run<KnowledgeDoc[]>(DOCS, 'readonly', (s) => s.getAll())
}

export async function saveDoc(doc: KnowledgeDoc): Promise<void> {
  await run(DOCS, 'readwrite', (s) => s.put(doc))
}

export async function deleteDoc(id: string): Promise<void> {
  await run(DOCS, 'readwrite', (s) => s.delete(id))
}

export async function loadHandle<T>(name: string): Promise<T | undefined> {
  return run<T | undefined>(HANDLES, 'readonly', (s) => s.get(name))
}

export async function saveHandle(name: string, handle: unknown): Promise<void> {
  if (handle) await run(HANDLES, 'readwrite', (s) => s.put(handle, name))
  else await run(HANDLES, 'readwrite', (s) => s.delete(name))
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
