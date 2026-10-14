import { decryptText, deriveKey, encryptText, newSalt } from './crypto'
import type { Library } from './files'
import { t } from './i18n'
import type { Chat, KnowledgeDoc } from './types'

// Devices sync through a folder that a sync service (Dropbox, Google Drive,
// Syncthing…) keeps the same everywhere; there is no TSRS server. Each item is
// a file whose name says what it is and when it last changed, so a device
// learns what to fetch from the folder listing alone:
//
//   tsrs-sync.json             the folder's format, and whether it is encrypted
//   chat~<id>~<time>.json      a conversation: metadata and messages
//   chat~<id>~<time>.deleted   a conversation deleted at <time>
//   library~<time>.json        folders, personas, prompts, memories, bases
//   doc~<id>.json / .deleted   a knowledge base document (they never change)
//
// The most recent change wins, per conversation and for the library as a
// whole. Copies a sync service makes on a conflict get other names and are
// ignored.

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
  // Chats and documents ('doc:' prefix) deleted here, with when.
  deleted: Record<string, number>
  libraryChangedAt: number
  docIds: string[]
  readChat(id: string): Promise<Chat>
  writeChat(chat: Chat): Promise<void>
  removeChat(id: string): Promise<void>
  library(): Library
  // `merge` keeps local items the incoming library lacks: the library here
  // was never edited, so nothing in it was meant to be removed.
  setLibrary(library: Library, changedAt: number, merge: boolean): void
  readDoc(id: string): Promise<KnowledgeDoc>
  writeDoc(doc: KnowledgeDoc): Promise<void>
  removeDoc(id: string): Promise<void>
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
  const library: Entry[] = []
  const docs = new Map<string, { json?: string; deleted?: string }>()
  for (const name of names) {
    let match = /^chat~([\w-]+)~(\d+)\.(json|deleted)$/.exec(name)
    if (match) {
      const entry = { name, ts: Number(match[2]), deleted: match[3] === 'deleted' }
      chats.set(match[1], [...(chats.get(match[1]) ?? []), entry])
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
  return { chats, library, docs }
}

// The latest of a set of entries; a deletion wins a tie.
function latest(entries: Entry[]): Entry | undefined {
  return entries.reduce<Entry | undefined>(
    (best, e) => (!best || e.ts > best.ts || (e.ts === best.ts && e.deleted) ? e : best),
    undefined,
  )
}

export function mergeLibrary(incoming: Library, mine: Library): Library {
  const merge = <T extends { id: string }>(theirs: T[], ours: T[]) => [
    ...theirs,
    ...ours.filter((item) => !theirs.some((x) => x.id === item.id)),
  ]
  return {
    folders: merge(incoming.folders ?? [], mine.folders),
    personas: merge(incoming.personas ?? [], mine.personas),
    prompts: merge(incoming.prompts ?? [], mine.prompts),
    memories: merge(incoming.memories ?? [], mine.memories),
    knowledgeBases: merge(incoming.knowledgeBases ?? [], mine.knowledgeBases),
  }
}

export async function runSync(store: SyncStore, local: SyncLocal, password: string): Promise<SyncReport> {
  const names = await store.list()
  const cipher = await openFolder(store, names, password)
  const remote = parse(names)
  const report: SyncReport = { sent: 0, received: 0, removed: 0 }
  const put = async (name: string, value: unknown) =>
    store.write(name, await cipher.seal(JSON.stringify(value)))
  const get = async (name: string) => JSON.parse(await cipher.open(await store.read(name)))
  // Older files of an item, left behind by earlier changes.
  const prune = async (entries: Entry[], keep: string) => {
    for (const entry of entries) {
      if (entry.name !== keep) await store.remove(entry.name).catch(() => {})
    }
  }

  const mine = new Map(local.chats.map((c) => [c.id, c.changedAt]))
  const ids = new Set([
    ...mine.keys(),
    ...Object.keys(local.deleted).filter((key) => !key.startsWith('doc:')),
    ...remote.chats.keys(),
  ])
  for (const id of ids) {
    const entries = remote.chats.get(id) ?? []
    const theirs = latest(entries)
    const changedAt = mine.get(id)
    const deletedAt = local.deleted[id]
    if (changedAt !== undefined) {
      if (theirs?.deleted && theirs.ts >= changedAt) {
        await local.removeChat(id)
        report.removed++
      } else if (theirs && !theirs.deleted && theirs.ts > changedAt) {
        await local.writeChat(await get(theirs.name))
        report.received++
      } else if (!theirs || changedAt > theirs.ts) {
        const name = `chat~${id}~${changedAt}.json`
        await put(name, await local.readChat(id))
        report.sent++
        await prune(entries, name)
        continue
      }
      if (theirs) await prune(entries, theirs.name)
    } else if (deletedAt !== undefined) {
      if (theirs && !theirs.deleted && theirs.ts > deletedAt) {
        // Changed elsewhere after it was deleted here: it comes back.
        await local.writeChat(await get(theirs.name))
        report.received++
        await prune(entries, theirs.name)
      } else if (!theirs?.deleted) {
        const name = `chat~${id}~${deletedAt}.deleted`
        await store.write(name, '')
        report.sent++
        await prune(entries, name)
      }
    } else if (theirs && !theirs.deleted) {
      await local.writeChat(await get(theirs.name))
      report.received++
      await prune(entries, theirs.name)
    }
  }

  const library = latest(remote.library)
  if (library && library.ts > local.libraryChangedAt) {
    local.setLibrary(await get(library.name), library.ts, local.libraryChangedAt === 0)
    report.received++
    await prune(remote.library, library.name)
  } else if (!library || local.libraryChangedAt > library.ts) {
    // A library never edited still goes out, as time 1 rather than 0 so that
    // other devices that never edited theirs merge it in.
    const name = `library~${Math.max(local.libraryChangedAt, 1)}.json`
    await put(name, local.library())
    report.sent++
    await prune(remote.library, name)
  }

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
      } else if (!theirs.json) {
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
