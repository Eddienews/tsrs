import { decryptText, deriveKey, encryptText, newSalt } from './crypto'
import type { Library } from './files'
import { t } from './i18n'
import type { Chat, KnowledgeDoc, SyncSettings } from './types'

// Devices sync through a place they all reach: a folder that a sync service
// (Dropbox, Google Drive, Syncthing…) keeps the same everywhere, a WebDAV
// server or an S3 bucket; there is no TSRS server. Each item is a file whose
// name says what it is and when it last changed, so a device learns what to
// fetch from the listing alone:
//
//   tsrs-sync.json                  the format, and whether it is encrypted
//   chat~<id>~<time>.json           a conversation: metadata and messages
//   chat~<id>~<time>.deleted        a conversation deleted at <time>
//   item~<kind>~<id>~<time>.json    a folder, persona, prompt, memory or base
//   item~<kind>~<id>~<time>.deleted
//   doc~<id>.json / .deleted        a knowledge base document (they never change)
//
// The most recent change of each item wins. Copies a sync service makes on a
// conflict get other names and are ignored. Earlier versions kept the whole
// library in one library~<time>.json, which is read once and removed.

export const HEADER = 'tsrs-sync.json'
const CHECK = 'tsrs'

export interface SyncStore {
  list(): Promise<string[]>
  read(name: string): Promise<string>
  write(name: string, text: string): Promise<void>
  remove(name: string): Promise<void>
}

// The app's side: what it has, and how to change it.
export interface SyncLocal {
  chats: { id: string; changedAt: number }[]
  // Library items, by key ('persona:<id>'…), with when each last changed.
  items: { key: string; changedAt: number }[]
  // Chats, library items and documents ('doc:' prefix) deleted here, with when.
  deleted: Record<string, number>
  docIds: string[]
  readChat(id: string): Promise<Chat>
  writeChat(chat: Chat): Promise<void>
  removeChat(id: string): Promise<void>
  readItem(key: string): unknown
  writeItem(key: string, value: unknown, changedAt: number): void
  removeItem(key: string): void
  readDoc(id: string): Promise<KnowledgeDoc>
  writeDoc(doc: KnowledgeDoc): Promise<void>
  removeDoc(id: string): Promise<void>
}

// Where each kind of library item lives, and its name in file names.
const KINDS = {
  folder: 'folders',
  persona: 'personas',
  prompt: 'prompts',
  memory: 'memories',
  base: 'knowledgeBases',
} as const satisfies Record<string, keyof Library>

type Kind = keyof typeof KINDS

export function itemsOf(library: Library): Map<string, { id: string }> {
  const items = new Map<string, { id: string }>()
  for (const [kind, field] of Object.entries(KINDS)) {
    for (const item of library[field]) items.set(`${kind}:${item.id}`, item)
  }
  return items
}

// Puts an item in its list, in place if it is there, else at the end; or
// takes it out when `value` is null.
export function withItem(library: Library, key: string, value: unknown): Library {
  const [kind, id] = splitKey(key)
  const field = KINDS[kind as Kind]
  if (!field) return library
  const list = library[field] as { id: string }[]
  const next = value
    ? list.some((item) => item.id === id)
      ? list.map((item) => (item.id === id ? (value as { id: string }) : item))
      : [...list, value as { id: string }]
    : list.filter((item) => item.id !== id)
  return { ...library, [field]: next }
}

function splitKey(key: string): [string, string] {
  const at = key.indexOf(':')
  return [key.slice(0, at), key.slice(at + 1)]
}

// A short fingerprint of an item, to notice when it changes (cyrb53).
export function hashOf(value: unknown): string {
  const text = JSON.stringify(value)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// Notes which library items changed or disappeared since last time, at
// `now`; null when none did. Items seen for the first time on a device that
// never tracked any get `first`, the time its library last changed.
export function trackLibrary(
  library: Library,
  sync: SyncSettings,
  now: number,
  first = now,
): SyncSettings | null {
  const items = itemsOf(library)
  const before = sync.items
  const tracked: Record<string, { hash: string; at: number }> = {}
  const deleted = { ...sync.deleted }
  let changed = !before
  for (const [key, value] of items) {
    const hash = hashOf(value)
    const known = before?.[key]
    if (known?.hash === hash) {
      tracked[key] = known
    } else {
      tracked[key] = { hash, at: before ? now : first }
      delete deleted[key]
      changed = true
    }
  }
  for (const key of Object.keys(before ?? {})) {
    if (!items.has(key)) {
      deleted[key] = now
      changed = true
    }
  }
  return changed ? { ...sync, items: tracked, deleted } : null
}

export interface SyncReport {
  sent: number
  received: number
  removed: number
}

interface Entry {
  name: string
  ts: number
  deleted: boolean
  // The item itself, when it came from an old whole-library file.
  value?: unknown
}

interface Cipher {
  seal(text: string): Promise<string>
  open(text: string): Promise<string>
}

const plain: Cipher = { seal: async (text) => text, open: async (text) => text }

// Reads or creates the folder's header and returns how its files are sealed.
async function openFolder(store: SyncStore, names: string[], password: string): Promise<Cipher> {
  if (!names.includes(HEADER)) {
    if (!password) {
      await store.write(HEADER, JSON.stringify({ app: 'tsrs', kind: 'sync', version: 1 }))
      return plain
    }
    const salt = newSalt()
    const key = await deriveKey(password, salt)
    const check = await encryptText(key, CHECK)
    await store.write(HEADER, JSON.stringify({ app: 'tsrs', kind: 'sync', version: 1, salt, check }))
    return { seal: (text) => encryptText(key, text), open: (text) => decryptText(key, text) }
  }
  let header: any
  try {
    header = JSON.parse(await store.read(HEADER))
  } catch {
    header = null
  }
  if (header?.app !== 'tsrs' || header.kind !== 'sync') {
    throw new Error(t('A pasta tem um {file} que não é do TSRS.', { file: HEADER }))
  }
  if (header.version > 1) throw new Error(t('A pasta foi criada por uma versão mais nova do TSRS.'))
  if (!header.salt) {
    if (password) {
      throw new Error(t('Esta pasta não usa senha. Apague a senha da sincronização ou escolha outra pasta.'))
    }
    return plain
  }
  if (!password) throw new Error(t('Esta pasta é protegida por senha. Informe a senha da sincronização.'))
  const key = await deriveKey(password, header.salt)
  try {
    if ((await decryptText(key, header.check)) !== CHECK) throw new Error()
  } catch {
    throw new Error(t('Senha da sincronização incorreta.'))
  }
  return { seal: (text) => encryptText(key, text), open: (text) => decryptText(key, text) }
}

function parse(names: string[]) {
  const chats = new Map<string, Entry[]>()
  const items = new Map<string, Entry[]>()
  const library: Entry[] = []
  const docs = new Map<string, { json?: string; deleted?: string }>()
  const add = (map: Map<string, Entry[]>, id: string, entry: Entry) =>
    map.set(id, [...(map.get(id) ?? []), entry])
  for (const name of names) {
    let match = /^chat~([\w-]+)~(\d+)\.(json|deleted)$/.exec(name)
    if (match) {
      add(chats, match[1], { name, ts: Number(match[2]), deleted: match[3] === 'deleted' })
      continue
    }
    match = /^item~(\w+)~([\w-]+)~(\d+)\.(json|deleted)$/.exec(name)
    if (match && match[1] in KINDS) {
      const entry = { name, ts: Number(match[3]), deleted: match[4] === 'deleted' }
      add(items, `${match[1]}:${match[2]}`, entry)
      continue
    }
    match = /^library~(\d+)\.json$/.exec(name)
    if (match) {
      library.push({ name, ts: Number(match[1]), deleted: false })
      continue
    }
    match = /^doc~([\w-]+)\.(json|deleted)$/.exec(name)
    if (match) {
      const doc = docs.get(match[1]) ?? {}
      doc[match[2] as 'json' | 'deleted'] = name
      docs.set(match[1], doc)
    }
  }
  return { chats, items, library, docs }
}

// The latest of a set of entries; a deletion wins a tie.
function latest(entries: Entry[]): Entry | undefined {
  return entries.reduce<Entry | undefined>(
    (best, e) => (!best || e.ts > best.ts || (e.ts === best.ts && e.deleted) ? e : best),
    undefined,
  )
}

// Ids safe to put in a file name; others stay on their device.
const SAFE_ID = /^[\w-]+$/

export async function runSync(store: SyncStore, local: SyncLocal, password: string): Promise<SyncReport> {
  const names = await store.list()
  const cipher = await openFolder(store, names, password)
  const remote = parse(names)
  const report: SyncReport = { sent: 0, received: 0, removed: 0 }
  const put = async (name: string, value: unknown) =>
    store.write(name, await cipher.seal(JSON.stringify(value)))
  const get = async (name: string) => JSON.parse(await cipher.open(await store.read(name)))

  // The items of an old whole-library file count as written at its time.
  const legacy = latest(remote.library)
  if (legacy) {
    const library: Library = await get(legacy.name)
    for (const [key, value] of itemsOf({
      folders: library.folders ?? [],
      personas: library.personas ?? [],
      prompts: library.prompts ?? [],
      memories: library.memories ?? [],
      knowledgeBases: library.knowledgeBases ?? [],
    })) {
      const entries = remote.items.get(key) ?? []
      remote.items.set(key, [...entries, { name: legacy.name, ts: legacy.ts, deleted: false, value }])
    }
  }

  // One kind of item that changes and can be deleted: chats or library items.
  async function syncAll(kind: {
    ids: Set<string>
    remote: Map<string, Entry[]>
    changedAt: Map<string, number>
    file(id: string, ts: number, ext: 'json' | 'deleted'): string
    read(id: string): Promise<unknown>
    write(id: string, value: unknown, ts: number): Promise<void>
    remove(id: string): Promise<void>
  }) {
    for (const id of kind.ids) {
      const entries = kind.remote.get(id) ?? []
      const theirs = latest(entries)
      const changedAt = kind.changedAt.get(id)
      const deletedAt = local.deleted[id]
      // Older files of the item, left behind by earlier changes.
      const prune = async (keep: string) => {
        for (const entry of entries) {
          if (entry.name !== keep && entry.value === undefined) {
            await store.remove(entry.name).catch(() => {})
          }
        }
      }
      const receive = async (entry: Entry) => {
        const value = entry.value ?? (await get(entry.name))
        await kind.write(id, value, entry.ts)
        report.received++
        // An item from an old library file gets a file of its own.
        const name = entry.value === undefined ? entry.name : kind.file(id, entry.ts, 'json')
        if (entry.value !== undefined) await put(name, value)
        await prune(name)
      }
      if (changedAt !== undefined) {
        if (theirs?.deleted && theirs.ts >= changedAt) {
          await kind.remove(id)
          report.removed++
          await prune(theirs.name)
        } else if (theirs && !theirs.deleted && theirs.ts > changedAt) {
          await receive(theirs)
        } else if (!theirs || changedAt > theirs.ts || theirs.value !== undefined) {
          const name = kind.file(id, changedAt, 'json')
          if (theirs?.name !== name) {
            await put(name, await kind.read(id))
            report.sent++
          }
          await prune(name)
        } else {
          await prune(theirs.name)
        }
      } else if (deletedAt !== undefined) {
        if (theirs && !theirs.deleted && theirs.ts > deletedAt) {
          // Changed elsewhere after it was deleted here: it comes back.
          await receive(theirs)
        } else if (!theirs?.deleted) {
          const name = kind.file(id, deletedAt, 'deleted')
          await store.write(name, '')
          report.sent++
          await prune(name)
        }
      } else if (theirs && !theirs.deleted) {
        await receive(theirs)
      }
    }
  }

  const chatIds = local.chats.map((c) => c.id).filter((id) => SAFE_ID.test(id))
  await syncAll({
    ids: new Set([
      ...chatIds,
      ...Object.keys(local.deleted).filter((key) => SAFE_ID.test(key)),
      ...remote.chats.keys(),
    ]),
    remote: remote.chats,
    changedAt: new Map(local.chats.map((c) => [c.id, c.changedAt])),
    file: (id, ts, ext) => `chat~${id}~${ts}.${ext}`,
    read: (id) => local.readChat(id),
    write: (_id, chat) => local.writeChat(chat as Chat),
    remove: (id) => local.removeChat(id),
  })

  const isItem = (key: string) => {
    const [kind, id] = splitKey(key)
    return kind in KINDS && SAFE_ID.test(id)
  }
  await syncAll({
    ids: new Set([
      ...local.items.map((i) => i.key).filter(isItem),
      ...Object.keys(local.deleted).filter(isItem),
      ...remote.items.keys(),
    ]),
    remote: remote.items,
    changedAt: new Map(local.items.map((i) => [i.key, i.changedAt])),
    file: (key, ts, ext) => `item~${key.replace(':', '~')}~${ts}.${ext}`,
    read: async (key) => local.readItem(key),
    write: async (key, value, ts) => local.writeItem(key, value, ts),
    remove: async (key) => local.removeItem(key),
  })
  for (const entry of remote.library) await store.remove(entry.name).catch(() => {})

  const docs = new Set(local.docIds)
  const deletedDocs = Object.keys(local.deleted)
    .filter((key) => key.startsWith('doc:'))
    .map((key) => key.slice(4))
  for (const id of new Set([...docs, ...deletedDocs, ...remote.docs.keys()])) {
    const theirs = remote.docs.get(id) ?? {}
    if (docs.has(id)) {
      if (theirs.deleted) {
        await local.removeDoc(id)
        report.removed++
      } else if (!theirs.json && SAFE_ID.test(id)) {
        await put(`doc~${id}.json`, await local.readDoc(id))
        report.sent++
      }
    } else if (local.deleted[`doc:${id}`] !== undefined) {
      if (theirs.json) await store.remove(theirs.json).catch(() => {})
      if (!theirs.deleted) {
        await store.write(`doc~${id}.deleted`, '')
        report.sent++
      }
    } else if (theirs.json && !theirs.deleted) {
      await local.writeDoc(await get(theirs.json))
      report.received++
    }
  }
  return report
}
