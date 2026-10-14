import { describe, expect, it } from 'vitest'
import type { Library } from './files'
import { HEADER, mergeLibrary, runSync, type SyncLocal, type SyncStore } from './sync'
import type { Chat, KnowledgeDoc } from './types'

function memoryStore(): SyncStore & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    list: async () => [...files.keys()],
    read: async (name) => {
      if (!files.has(name)) throw new Error(`missing ${name}`)
      return files.get(name)!
    },
    write: async (name, text) => void files.set(name, text),
    remove: async (name) => void files.delete(name),
  }
}

const emptyLibrary = (): Library => ({
  folders: [],
  personas: [],
  prompts: [],
  memories: [],
  knowledgeBases: [],
})

// A device: its chats, library and documents, as the app would hold them.
function device() {
  const state = {
    chats: new Map<string, Chat>(),
    deleted: {} as Record<string, number>,
    library: emptyLibrary(),
    libraryChangedAt: 0,
    docs: new Map<string, KnowledgeDoc>(),
  }
  const local = (): SyncLocal => ({
    chats: [...state.chats.values()].map((c) => ({ id: c.id, changedAt: c.changedAt ?? c.updatedAt })),
    deleted: state.deleted,
    libraryChangedAt: state.libraryChangedAt,
    docIds: [...state.docs.keys()],
    readChat: async (id) => state.chats.get(id)!,
    writeChat: async (chat) => void state.chats.set(chat.id, chat),
    removeChat: async (id) => void state.chats.delete(id),
    library: () => state.library,
    setLibrary: (library, changedAt, merge) => {
      state.library = merge ? mergeLibrary(library, state.library) : library
      state.libraryChangedAt = changedAt
    },
    readDoc: async (id) => state.docs.get(id)!,
    writeDoc: async (doc) => void state.docs.set(doc.id, doc),
    removeDoc: async (id) => void state.docs.delete(id),
  })
  return { state, local }
}

const chat = (id: string, changedAt: number, title = id): Chat => ({
  id,
  title,
  createdAt: 1,
  updatedAt: 1,
  changedAt,
  providerId: 'openai',
  model: 'm',
  messages: [{ id: `${id}-m`, role: 'user', content: `Olá de ${id}` }],
})

const doc: KnowledgeDoc = { id: 'd1', baseId: 'b', name: 'a.md', addedAt: 1, size: 4, chunks: ['Oi'] }

describe('runSync', () => {
  it('copies everything to a device that has nothing', async () => {
    const store = memoryStore()
    const a = device()
    a.state.chats.set('c1', chat('c1', 100))
    a.state.library = { ...emptyLibrary(), prompts: [{ id: 'p', title: 'T', text: 'x' }] }
    a.state.libraryChangedAt = 50
    a.state.docs.set('d1', doc)
    expect(await runSync(store, a.local(), '')).toEqual({ sent: 3, received: 0, removed: 0 })
    expect([...store.files.keys()].sort()).toEqual(
      ['chat~c1~100.json', 'doc~d1.json', HEADER, 'library~50.json'].sort(),
    )

    const b = device()
    expect(await runSync(store, b.local(), '')).toEqual({ sent: 0, received: 3, removed: 0 })
    expect(b.state.chats.get('c1')?.messages[0].content).toBe('Olá de c1')
    expect(b.state.library.prompts).toHaveLength(1)
    expect(b.state.libraryChangedAt).toBe(50)
    expect(b.state.docs.get('d1')).toEqual(doc)
    // Nothing left to do on either side.
    expect(await runSync(store, a.local(), '')).toEqual({ sent: 0, received: 0, removed: 0 })
  })

  it('keeps the latest change of a chat and removes older files', async () => {
    const store = memoryStore()
    const a = device()
    const b = device()
    a.state.chats.set('c1', chat('c1', 100))
    await runSync(store, a.local(), '')
    await runSync(store, b.local(), '')
    b.state.chats.set('c1', chat('c1', 200, 'Renomeada'))
    await runSync(store, b.local(), '')
    expect(store.files.has('chat~c1~100.json')).toBe(false)
    await runSync(store, a.local(), '')
    expect(a.state.chats.get('c1')?.title).toBe('Renomeada')
  })

  it('spreads deletions, unless the chat changed after it', async () => {
    const store = memoryStore()
    const a = device()
    const b = device()
    a.state.chats.set('c1', chat('c1', 100))
    a.state.chats.set('c2', chat('c2', 100))
    await runSync(store, a.local(), '')
    await runSync(store, b.local(), '')

    a.state.chats.delete('c1')
    a.state.deleted.c1 = 150
    a.state.chats.delete('c2')
    a.state.deleted.c2 = 150
    // B changed c2 after A deleted it.
    b.state.chats.set('c2', chat('c2', 300, 'Editada depois'))
    await runSync(store, a.local(), '')
    expect(store.files.has('chat~c1~150.deleted')).toBe(true)
    expect(await runSync(store, b.local(), '')).toMatchObject({ removed: 1, sent: 1 })
    expect(b.state.chats.has('c1')).toBe(false)
    await runSync(store, a.local(), '')
    expect(a.state.chats.get('c2')?.title).toBe('Editada depois')
  })

  it('spreads document deletions', async () => {
    const store = memoryStore()
    const a = device()
    const b = device()
    a.state.docs.set('d1', doc)
    await runSync(store, a.local(), '')
    await runSync(store, b.local(), '')
    a.state.docs.delete('d1')
    a.state.deleted['doc:d1'] = 10
    await runSync(store, a.local(), '')
    expect(store.files.has('doc~d1.json')).toBe(false)
    await runSync(store, b.local(), '')
    expect(b.state.docs.size).toBe(0)
  })

  it('merges a library that was never edited into the incoming one', async () => {
    const store = memoryStore()
    const a = device()
    a.state.library = { ...emptyLibrary(), prompts: [{ id: 'pa', title: 'A', text: 'a' }] }
    await runSync(store, a.local(), '')
    expect(store.files.has('library~1.json')).toBe(true)
    const b = device()
    b.state.library = { ...emptyLibrary(), prompts: [{ id: 'pb', title: 'B', text: 'b' }] }
    await runSync(store, b.local(), '')
    expect(b.state.library.prompts.map((p) => p.id)).toEqual(['pa', 'pb'])
  })

  it('encrypts the files and checks the password', async () => {
    const store = memoryStore()
    const a = device()
    a.state.chats.set('c1', chat('c1', 100))
    await runSync(store, a.local(), 'segredo')
    expect(store.files.get('chat~c1~100.json')).not.toContain('Olá')
    expect(JSON.parse(store.files.get(HEADER)!).salt).toBeTruthy()

    const b = device()
    await expect(runSync(store, b.local(), '')).rejects.toThrow('protegida por senha')
    await expect(runSync(store, b.local(), 'errada')).rejects.toThrow('Senha da sincronização incorreta.')
    await runSync(store, b.local(), 'segredo')
    expect(b.state.chats.get('c1')?.messages[0].content).toBe('Olá de c1')
  }, 20_000)

  it('refuses a password for a folder that has none', async () => {
    const store = memoryStore()
    await runSync(store, device().local(), '')
    await expect(runSync(store, device().local(), 'x')).rejects.toThrow('não usa senha')
  })
})
