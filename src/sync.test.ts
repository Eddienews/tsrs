import { describe, expect, it } from 'vitest'
import type { Library } from './files'
import {
  HEADER,
  itemsOf,
  runSync,
  trackLibrary,
  withItem,
  type SyncLocal,
  type SyncStore,
} from './sync'
import type { Chat, KnowledgeDoc, SyncSettings } from './types'

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
// `edit` changes the library the way the app does, noting what changed.
function device() {
  const state = {
    chats: new Map<string, Chat>(),
    library: emptyLibrary(),
    sync: { folder: '', password: '', deleted: {} } as SyncSettings,
    docs: new Map<string, KnowledgeDoc>(),
  }
  const edit = (change: (library: Library) => Library, at: number) => {
    state.library = change(state.library)
    state.sync = trackLibrary(state.library, state.sync, at) ?? state.sync
  }
  const local = (): SyncLocal => ({
    chats: [...state.chats.values()].map((c) => ({ id: c.id, changedAt: c.changedAt ?? c.updatedAt })),
    items: Object.entries(state.sync.items ?? {}).map(([key, { at }]) => ({ key, changedAt: at })),
    deleted: state.sync.deleted,
    docIds: [...state.docs.keys()],
    readChat: async (id) => state.chats.get(id)!,
    writeChat: async (chat) => void state.chats.set(chat.id, chat),
    removeChat: async (id) => void state.chats.delete(id),
    readItem: (key) => itemsOf(state.library).get(key),
    writeItem: (key, value, at) => {
      state.library = withItem(state.library, key, value)
      state.sync = { ...state.sync, items: { ...state.sync.items, [key]: { hash: '', at } } }
      state.sync = trackLibrary(state.library, state.sync, at) ?? state.sync
    },
    removeItem: (key) => {
      state.library = withItem(state.library, key, null)
      const { [key]: _gone, ...items } = state.sync.items ?? {}
      state.sync = { ...state.sync, items }
    },
    readDoc: async (id) => state.docs.get(id)!,
    writeDoc: async (doc) => void state.docs.set(doc.id, doc),
    removeDoc: async (id) => void state.docs.delete(id),
  })
  return { state, local, edit }
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
    a.edit((l) => ({ ...l, prompts: [{ id: 'p', title: 'T', text: 'x' }] }), 50)
    a.state.docs.set('d1', doc)
    expect(await runSync(store, a.local(), '')).toEqual({ sent: 3, received: 0, removed: 0 })
    expect([...store.files.keys()].sort()).toEqual(
      ['chat~c1~100.json', 'doc~d1.json', HEADER, 'item~prompt~p~50.json'].sort(),
    )

    const b = device()
    expect(await runSync(store, b.local(), '')).toEqual({ sent: 0, received: 3, removed: 0 })
    expect(b.state.chats.get('c1')?.messages[0].content).toBe('Olá de c1')
    expect(b.state.library.prompts).toHaveLength(1)
    expect(b.state.sync.items?.['prompt:p'].at).toBe(50)
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
    a.state.sync.deleted.c1 = 150
    a.state.chats.delete('c2')
    a.state.sync.deleted.c2 = 150
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
    a.state.sync.deleted['doc:d1'] = 10
    await runSync(store, a.local(), '')
    expect(store.files.has('doc~d1.json')).toBe(false)
    await runSync(store, b.local(), '')
    expect(b.state.docs.size).toBe(0)
  })

  it('syncs library items one by one', async () => {
    const store = memoryStore()
    const a = device()
    const b = device()
    const prompt = (id: string, text: string) => ({ id, title: id, text })
    a.edit((l) => ({ ...l, prompts: [prompt('p1', 'a'), prompt('p2', 'a')] }), 10)
    b.edit((l) => ({ ...l, personas: [{ id: 'r', name: 'Revisor', system: 'Revise.' }] }), 20)
    await runSync(store, a.local(), '')
    await runSync(store, b.local(), '')
    await runSync(store, a.local(), '')
    expect(a.state.library.personas.map((p) => p.id)).toEqual(['r'])
    expect(b.state.library.prompts.map((p) => p.id)).toEqual(['p1', 'p2'])

    // Each side edits a different item: both edits survive.
    a.edit((l) => ({ ...l, prompts: [prompt('p1', 'de A'), l.prompts[1]] }), 30)
    b.edit((l) => ({ ...l, prompts: [l.prompts[0], prompt('p2', 'de B')] }), 40)
    // And the same one: the later edit wins.
    a.edit((l) => ({ ...l, personas: [{ ...l.personas[0], system: 'de A' }] }), 50)
    b.edit((l) => ({ ...l, personas: [{ ...l.personas[0], system: 'de B' }] }), 45)
    await runSync(store, a.local(), '')
    await runSync(store, b.local(), '')
    await runSync(store, a.local(), '')
    for (const side of [a, b]) {
      expect(side.state.library.prompts.map((p) => p.text)).toEqual(['de A', 'de B'])
      expect(side.state.library.personas[0].system).toBe('de A')
    }
    expect([...store.files.keys()].filter((n) => n.startsWith('item~prompt~p1'))).toEqual([
      'item~prompt~p1~30.json',
    ])

    // A deletion reaches the other device.
    b.edit((l) => ({ ...l, prompts: l.prompts.filter((p) => p.id !== 'p2') }), 60)
    await runSync(store, b.local(), '')
    expect(store.files.has('item~prompt~p2~60.deleted')).toBe(true)
    expect(await runSync(store, a.local(), '')).toMatchObject({ removed: 1 })
    expect(a.state.library.prompts.map((p) => p.id)).toEqual(['p1'])
    expect(await runSync(store, a.local(), '')).toEqual({ sent: 0, received: 0, removed: 0 })
  })

  it('reads a whole-library file left by an earlier version', async () => {
    const store = memoryStore()
    await runSync(store, device().local(), '')
    const old = { ...emptyLibrary(), prompts: [{ id: 'pa', title: 'A', text: 'a' }] }
    store.files.set('library~5.json', JSON.stringify(old))
    const b = device()
    b.edit((l) => ({ ...l, prompts: [{ id: 'pb', title: 'B', text: 'b' }] }), 1)
    await runSync(store, b.local(), '')
    expect(b.state.library.prompts.map((p) => p.id)).toEqual(['pb', 'pa'])
    expect(store.files.has('library~5.json')).toBe(false)
    expect(store.files.has('item~prompt~pa~5.json')).toBe(true)
    expect(store.files.has('item~prompt~pb~1.json')).toBe(true)
  })

  it('notes which items changed or disappeared', () => {
    const sync: SyncSettings = { folder: '', password: '', deleted: {} }
    const library = { ...emptyLibrary(), folders: [{ id: 'f', name: 'A' }] }
    const first = trackLibrary(library, sync, 100, 7)!
    expect(first.items).toEqual({ 'folder:f': { hash: expect.any(String), at: 7 } })
    expect(trackLibrary(library, first, 200)).toBeNull()
    const renamed = trackLibrary({ ...library, folders: [{ id: 'f', name: 'B' }] }, first, 300)!
    expect(renamed.items?.['folder:f'].at).toBe(300)
    const gone = trackLibrary(emptyLibrary(), renamed, 400)!
    expect(gone.items).toEqual({})
    expect(gone.deleted).toEqual({ 'folder:f': 400 })
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
