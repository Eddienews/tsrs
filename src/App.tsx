import { MessageSquareDashed, Pin } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsMobile } from '@/lib/use-mobile'
import { applyAppearance } from './appearance'
import { fileTranscriber, useDictation } from './dictation'
import { branchAt, patchMessage, switchVersion, versions, type Branch } from './branches'
import ChatTopBar from './ChatTopBar'
import type { PaletteAction } from './CommandPalette'
import Composer from './Composer'
import { deriveKey, newSalt, seal, unseal } from './crypto'
import {
  buildBackup,
  chatToMarkdown,
  download,
  fileName,
  parseBackup,
  readAttachment,
  type Backup,
} from './files'
import {
  BACKUP_DELAY,
  BACKUP_MAX_WAIT,
  backupStatus,
  backupToOffer,
  readLatestBackup,
  saveBackupToDisk,
  settingsForBackup,
  type AutoBackupState,
  type BackupMeta,
} from './autoBackup'
import BackupOffer from './BackupOffer'
import { setLanguage, t } from './i18n'
import { PreviewContext } from './Markdown'
import MessageView, { ContextReset } from './MessageView'
import ParamsPanel from './ParamsPanel'
import { forget } from './mcp'
import { artifactName, lastPreviewable, withPreviewHint, type Artifact } from './preview'
import { chatTracks, trackBlob, trackFileName } from './videoRender'
import { ownSearch, webToolSet, withSources } from './webSearch'
import { agentFor, folderNote } from './folders'
import { RESEARCH_NOTE, RESEARCH_ROUNDS, reportFile, reportName } from './research'
import {
  enabledPlugins,
  enabledSkills,
  listPlugins,
  listSkills,
  commandPrompts,
  pluginToolSet,
  skillsNote,
  skillTools,
  type Plugin,
} from './extensions'
import {
  PROJECT_TOOLS,
  copyFiles,
  filesFromReply,
  historyLine,
  openProject,
  projectNote,
  projectNotes,
  projectsRoot,
  runProjectTool,
  saveFiles,
  type SavedFile,
} from './projects'
import { CANVAS_NOTE, CANVAS_TOOLS, newCanvas, runCanvasTool, undo, withCanvas } from './canvas'
import { extractText } from './extract'
import {
  MEDIA_KINDS,
  mediaProblem,
  mediaSource,
  readerSource,
  sourceName,
  type MediaTarget,
} from './media'
import { embedSource, indexDoc, meaningOf } from './embeddings'
import {
  chunk,
  hitsResult,
  knowledgeTool,
  queryOf,
  search,
  withReferences,
  type Meaning,
} from './knowledge'
import { MEMORY_TOOLS, runMemoryTool, withMemories } from './memory'
import { connection, getProvider } from './providers'
import Sidebar from './Sidebar'
import { comboOf, SHORTCUT_ACTIONS, shortcutsOf } from './shortcuts'
import { setBrowserVoice, setReader } from './speech'
import type { PriceEstimate } from './mediaPrice'
import { chime } from './sound'
import {
  SETTINGS_KEY,
  deleteChat,
  deleteDoc,
  deleteEverything,
  loadChats,
  loadDocs,
  loadHandle,
  loadMetas,
  loadSettings,
  loadThread,
  mergeSettings,
  saveChats,
  saveDoc,
  saveHandle,
  saveMeta,
  saveSettings,
  saveThread,
  searchThreads,
} from './storage'
import {
  completeText,
  streamChat,
  type Connection,
  type RequestMessage,
  transcribe,
} from './stream'
import { SUMMARY_PROMPT, contextResetMark, sinceSummary, withSummary } from './summary'
import { agentParams, agentPlugins, agentSkills, findMention, withReply } from './agents'
import { stockToolSet } from './stock'
import { narrator, shortToolSet } from './shortTool'
import {
  hashOf,
  itemsOf,
  runSync,
  trackLibrary,
  withItem,
  type SyncLocal,
  type SyncStore,
} from './sync'
import { canPickFolder, folderStore, mayUse, pickFolder } from './syncFolder'
import { bucketUrl, s3Store, webdavStore } from './syncRemote'
import type { RemoteTarget, SyncKind } from './SyncSection'
import { gatherTools, localTools, mergeTools, type ToolSet } from './tools'
import { keysOf, withKeys, withoutKeys } from './secrets'
import type {
  Attachment,
  Canvas,
  ChatMeta,
  ChatParams,
  Folder,
  KnowledgeBase,
  KnowledgeDoc,
  MediaKind,
  Message,
  Persona,
  Reference,
  PersonaTools,
  Settings,
  ToolPart,
} from './types'
import {
  CONTEXT_WARNING,
  contextUse,
  costOf,
  formatCost,
  modelInfo,
  totals,
} from './usage'

// Loaded after startup, to keep the first download small. They are all
// fetched once the app is idle, so they open at once and work offline.
const chunks = {
  CanvasPanel: () => import('./CanvasPanel'),
  CommandPalette: () => import('./CommandPalette'),
  CompareDialog: () => import('./CompareDialog'),
  LibraryDialog: () => import('./LibraryDialog'),
  PreviewPanel: () => import('./PreviewPanel'),
  SettingsDialog: () => import('./SettingsDialog'),
  SideChat: () => import('./SideChat'),
  ToolsDialog: () => import('./ToolsDialog'),
  ExtensionsDialog: () => import('./ExtensionsDialog'),
  UnlockDialog: () => import('./UnlockDialog'),
  UsageView: () => import('./UsageView'),
}
const CanvasPanel = lazy(chunks.CanvasPanel)
const CommandPalette = lazy(chunks.CommandPalette)
const CompareDialog = lazy(chunks.CompareDialog)
const LibraryDialog = lazy(chunks.LibraryDialog)
const PreviewPanel = lazy(chunks.PreviewPanel)
const SettingsDialog = lazy(chunks.SettingsDialog)
const SideChat = lazy(chunks.SideChat)
const ToolsDialog = lazy(chunks.ToolsDialog)
const ExtensionsDialog = lazy(chunks.ExtensionsDialog)
const AgendaTab = lazy(() => import('./AgendaTab'))
const FolderDialog = lazy(() => import('./FolderDialog'))
const UnlockDialog = lazy(chunks.UnlockDialog)
const UsageView = lazy(chunks.UsageView)
const PREFETCH_DELAY = 2000

const TITLE_LENGTH = 60
// Code blocks that open the preview by themselves, when that is turned on.
const AUTO_PREVIEW = ['html', 'svg', 'jsx', 'tsx', 'react', 'mermaid', 'motion']
const TITLE_EXCERPT = 1000
const TITLE_PROMPT =
  'Crie um título curto (no máximo 6 palavras) para a conversa abaixo, no mesmo idioma dela. ' +
  'Responda apenas com o título, sem aspas nem pontuação final.'

// A provider and model other than the ones selected in the toolbar.
// Media to make from the last message, and who makes it.
interface MediaJob {
  kind: MediaKind
  target: MediaTarget
}

interface Target {
  providerId: string
  model: string
}

interface Blocker {
  text: string
  fix: 'settings' | 'unlock'
}

function blocker(settings: Settings, locked: boolean): Blocker | null {
  const provider = getProvider(settings.providerId)
  const conn = settings.providers[provider.id]
  if (!conn.baseUrl) {
    return {
      text: t('Informe a URL base de {provider} nas configurações.', { provider: provider.name }),
      fix: 'settings',
    }
  }
  if (provider.keyRequired && locked)
    return { text: t('As chaves de API estão bloqueadas por senha.'), fix: 'unlock' }
  if (provider.keyRequired && !conn.apiKey) {
    return {
      text: t('Informe a chave de API de {provider} nas configurações.', { provider: provider.name }),
      fix: 'settings',
    }
  }
  if (!settings.model) return { text: t('Escolha ou digite um modelo.'), fix: 'settings' }
  return null
}

// How a generated file is named in the text sent to the model.
const MADE: Record<MediaKind, string> = { image: 'an image', video: 'a video', audio: 'audio' }

// Empty replies (aborted or failed) are dropped: providers reject empty turns.
// Replies carry no attachments: generated media travels as its prompt.
function toRequest(messages: Message[]): RequestMessage[] {
  return messages
    .map(({ role, content, attachments, parts, imagePrompt, mediaKind }) =>
      role === 'user'
        ? { role, content, attachments, parts }
        : {
            role,
            content:
              imagePrompt === undefined
                ? content
                : `[Generated ${MADE[mediaKind ?? 'image']} for the prompt: ${imagePrompt}]`,
            parts,
          },
    )
    .filter((m) => m.content || m.attachments?.length)
}

// The tools a conversation uses: its agent's, or the ones switched on for all.
function toolsFor(settings: Settings, persona: Persona | undefined): PersonaTools {
  return (
    persona?.tools ?? {
      webSearch: settings.webSearch,
      webFetch: settings.webFetch,
      mcpServers: settings.mcpServers.filter((s) => s.enabled).map((s) => s.id),
    }
  )
}

// Knowledge base passages go with the question they were found for.
function withKnowledge(messages: RequestMessage[], references: Reference[]): RequestMessage[] {
  const last = messages.at(-1)
  if (!references.length || last?.role !== 'user') return messages
  return [...messages.slice(0, -1), { ...last, content: withReferences(last.content, references) }]
}

// References found by a tool, after the ones already there.
function withMore(references: Reference[] | undefined, more: Reference[]): Reference[] {
  const known = references ?? []
  const fresh = more.filter((r) => !known.some((k) => k.name === r.name && k.text === r.text))
  return [...known, ...fresh]
}

// The canvas text goes with the latest question.
function withCanvasText(messages: RequestMessage[], canvas: Canvas | undefined): RequestMessage[] {
  const last = messages.at(-1)
  if (!canvas || last?.role !== 'user') return messages
  return [...messages.slice(0, -1), { ...last, content: withCanvas(last.content, canvas) }]
}

// The files of the conversation's folder and agent go with the first message of every request.
function withFiles(messages: RequestMessage[], files: Attachment[]): RequestMessage[] {
  if (!files.length || !messages.length) return messages
  const [first, ...rest] = messages
  return [{ ...first, attachments: [...files, ...(first.attachments ?? [])] }, ...rest]
}

// The knowledge bases a conversation searches: its own and its agent's.
function basesFor(settings: Settings, params: ChatParams | undefined, persona?: Persona): string[] {
  const wanted = new Set([...(params?.knowledge ?? []), ...(persona?.knowledge ?? [])])
  return settings.knowledgeBases.filter((b) => wanted.has(b.id)).map((b) => b.id)
}

// The question's words plus the one before, so that a follow-up such as
// "and the second one?" still finds what the conversation is about.
function knowledgeQuery(history: Message[]): string {
  return history
    .filter((m) => m.role === 'user')
    .slice(-2)
    .map((m) => m.content)
    .join('\n')
}

// A question about part of a reply, answered beside the conversation.
interface Aside {
  chatId: string
  replyId: string
  quote: string
  messages: Message[]
}

const ASIDE_NOTE =
  'The user is asking a side question about your reply above. Answer it briefly; this exchange ' +
  'is kept apart from the main conversation.'

// Looked up when a call arrives, so the label follows the current language.
const PROVIDER_TOOLS: Record<string, () => string> = {
  web_search: () => t('Busca na web'),
  web_fetch: () => t('Leitura de página'),
}

// Adds a tool call to a reply, or updates the one already there.
function withTool(message: Message, part: ToolPart, label: string): Message {
  const parts = message.parts ?? (message.content ? [{ type: 'text', text: message.content } as const] : [])
  const known = parts.find((p) => p.type === 'tool' && p.id === part.id) as ToolPart | undefined
  if (!known) return { ...message, parts: [...parts, { ...part, label }] }
  // A provider reports the result of its own tools without repeating the call.
  const merged = { ...known, ...part, name: part.name || known.name, input: part.input || known.input }
  return {
    ...message,
    parts: parts.map((p) => (p === known ? { ...merged, label: known.label } : p)),
  }
}

function withText(message: Message, text: string): Message {
  const content = message.content + text
  if (!message.parts) return { ...message, content }
  const last = message.parts.at(-1)
  const parts =
    last?.type === 'text'
      ? [...message.parts.slice(0, -1), { ...last, text: last.text + text }]
      : [...message.parts, { type: 'text' as const, text }]
  return { ...message, content, parts }
}

// The WebDAV server or bucket the app syncs with, if it syncs with one.
function remoteStore(settings: Settings): SyncStore | null {
  const { sync } = settings
  const proxy = sync.proxy ? settings.proxyUrl.trim() || undefined : undefined
  if (sync.webdav) return webdavStore(sync.webdav, proxy)
  if (sync.s3) return s3Store(sync.s3, proxy)
  return null
}

// Deletions older than this are forgotten; a device offline for longer may
// bring a deleted chat back.
const TOMBSTONE_DAYS = 180
// How long after a change the folder is synced, and how often anyway.
const SYNC_DELAY = 10_000
const SYNC_EVERY = 120_000

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'done' | 'permission' | 'error'
  message?: string
}

function library(settings: Settings) {
  const { folders, personas, prompts, memories, knowledgeBases } = settings
  return { folders, personas, prompts, memories, knowledgeBases }
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  // The latest settings, for tools that change them while a reply streams.
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // Set while rendering so that every t() below already uses the chosen language.
  setLanguage(settings.language)
  // The key that opens the vault, held only in memory while unlocked.
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const locked = !!settings.vault && !vaultKey
  const [showUnlock, setShowUnlock] = useState(locked)
  // Settings taken from another tab, which must not be written back.
  const adopted = useRef<Settings | null>(null)

  // Conversations are kept as a list of metadata plus the messages of the
  // ones opened in this session. The refs are the source of truth, updated
  // synchronously so that a stream in progress and a concurrent rename or pin
  // never overwrite each other.
  const [metas, setMetas] = useState<ChatMeta[]>([])
  const metasRef = useRef<ChatMeta[]>([])
  const [threads, setThreads] = useState<Record<string, Message[]>>({})
  const threadsRef = useRef<Record<string, Message[]>>({})

  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachError, setAttachError] = useState('')
  // Attached audio files whose transcription is on its way; sending waits for it.
  const [transcribing, setTranscribing] = useState<string[]>([])
  // Parameters for the conversation that has not been created yet.
  const [draftParams, setDraftParams] = useState<ChatParams>({})
  const [showSettings, setShowSettings] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showExtensions, setShowExtensions] = useState(false)
  // Installed plugins, for their commands in the prompt list.
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const reloadPlugins = useCallback(() => {
    listPlugins().then(setPlugins, () => setPlugins([]))
  }, [])
  useEffect(reloadPlugins, [reloadPlugins])

  // Answers of scheduled tasks, run by the server while TSRS may have been
  // closed, become messages in a conversation per task.
  const importingAgenda = useRef(false)
  // The list of conversations is read from storage first, or a task's would be made twice.
  const metasLoaded = useRef(false)
  const importAgenda = useCallback(async () => {
    if (importingAgenda.current || !metasLoaded.current) return
    importingAgenda.current = true
    try {
      const { pendingResults, ackResults } = await import('./agenda')
      const results = await pendingResults().catch(() => [])
      for (const result of results) {
        let meta = metasRef.current.find((c) => c.scheduleId === result.taskId)
        if (!meta) {
          meta = {
            id: crypto.randomUUID(),
            title: t('Agenda: {name}', { name: result.name }),
            createdAt: result.at,
            updatedAt: result.at,
            providerId: result.providerId,
            model: result.model,
            scheduleId: result.taskId,
          }
          commitMetas([meta, ...metasRef.current])
          commitThreads({ ...threadsRef.current, [meta.id]: [] })
        }
        const thread = threadsRef.current[meta.id] ?? (await loadThread(meta.id))
        const added: Message[] = [
          { id: crypto.randomUUID(), role: 'user', content: result.prompt, createdAt: result.at },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.text,
            createdAt: result.at + 1,
            providerId: result.providerId,
            model: result.model,
            ...(result.error ? { error: result.error } : {}),
          },
        ]
        const next = [...thread, ...added]
        commitThreads({ ...threadsRef.current, [meta.id]: next })
        const id = meta.id
        commitMetas(metasRef.current.map((c) => (c.id === id ? { ...c, updatedAt: result.at, changedAt: Date.now() } : c)))
        storeThread(id, next)
        const stored = metasRef.current.find((c) => c.id === id)
        if (stored) storeMeta(stored)
      }
      if (results.length) await ackResults(results.map((r) => r.id))
    } finally {
      importingAgenda.current = false
    }
  }, [])
  useEffect(() => {
    void importAgenda()
    const timer = setInterval(() => void importAgenda(), 60_000)
    const onFocus = () => void importAgenda()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [importAgenda])
  const [showPalette, setShowPalette] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  // The conversation list, when it is a drawer on a narrow screen.
  const [showDrawer, setShowDrawer] = useState(false)
  const [dragging, setDragging] = useState(false)
  const isMobile = useIsMobile()
  // What is open in the preview panel; kept only for the session.
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [artifactId, setArtifactId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showCanvas, setShowCanvas] = useState(false)
  // The canvas of the conversation that has not been created yet.
  const [draftCanvas, setDraftCanvas] = useState<Canvas | undefined>()
  // The next conversation is temporary; it stays on until turned off.
  const [draftTemporary, setDraftTemporary] = useState(false)
  // Pending writes of a canvas being typed in, by chat id.
  const canvasSaves = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const artifactCount = useRef(0)
  // MCP servers that could not be reached for the last reply.
  const [toolProblems, setToolProblems] = useState<string[]>([])
  // Whether the user was already told why files could not be saved to a folder.
  const projectWarned = useRef(false)
  // Tool calls waiting for the user to allow or deny them, by call id.
  const approvals = useRef(new Map<string, (allowed: boolean) => void>())
  // Position in the conversation of the reply whose versions are shown side
  // by side, and id of the reply waiting for a model to be compared with.
  const [versionsAt, setVersionsAt] = useState<number | null>(null)
  const [compareId, setCompareId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // The newest send, reply state and conversation, for work that spans
  // renders, such as the steps of a chain.
  const liveRef = useRef({ send, streaming, activeId })
  liveRef.current = { send, streaming, activeId }
  // The next message asks for an image, a video or audio instead of a reply.
  const [mediaMode, setMediaMode] = useState<MediaKind | null>(null)
  // The next message is a deep research request.
  const [research, setResearch] = useState(false)
  // The folder whose context is being edited, and the one a new conversation goes in.
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [draftFolder, setDraftFolder] = useState<string | undefined>(undefined)
  const [aside, setAside] = useState<Aside | null>(null)
  // Knowledge base documents, all kept in memory to search them.
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const docsRef = useRef<KnowledgeDoc[]>([])
  const [syncFolder, setSyncFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' })
  const syncing = useRef(false)
  const [asideBusy, setAsideBusy] = useState(false)
  const asideAbort = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const provider = getProvider(settings.providerId)
  const dictation = useDictation(settings, locked, (text) =>
    setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text)),
  )
  const active = metas.find((c) => c.id === activeId) ?? null
  // Undefined while the active conversation's messages are being read.
  const messages = activeId ? threads[activeId] : undefined
  // Audio of the conversation, offered as the soundtrack of a motion video.
  const tracks = useMemo(() => chatTracks(messages ?? []), [messages])
  const params = active ? (active.params ?? {}) : draftParams
  const canvas = active ? active.canvas : draftCanvas
  const temporary = active ? !!active.temporary : draftTemporary
  // Temporary conversations are left out of every list.
  const listed = useMemo(() => metas.filter((c) => !c.temporary), [metas])
  const persona = settings.personas.find((p) => p.id === params.personaId)
  const mediaTargets = {
    image: mediaSource(settings, 'image', locked),
    video: mediaSource(settings, 'video', locked),
    audio: mediaSource(settings, 'audio', locked),
  }
  const maker = mediaMode ? mediaTargets[mediaMode] : null
  // What the next generation will cost, when the service says beforehand.
  const [price, setPrice] = useState<PriceEstimate | null | 'unknown'>(null)
  // The mode and the target, as text, so that the estimate is asked for again
  // only when one of them changes.
  const priceKey = mediaMode && maker ? JSON.stringify([mediaMode, maker]) : ''
  useEffect(() => {
    setPrice(null)
    if (!mediaMode || !maker) return
    let stale = false
    import('./mediaPrice')
      .then(({ estimateCost }) => estimateCost(settingsRef.current, maker, mediaMode))
      .then((estimate) => !stale && setPrice(estimate ?? 'unknown'))
    return () => {
      stale = true
    }
  }, [priceKey])

  // Replies are read aloud by the voice service chosen, or by the browser.
  useEffect(() => {
    const target = readerSource(settings, locked)
    setReader(target && { settings, target, name: sourceName(target.source) })
    setBrowserVoice(settings.readAloud.source === 'browser' ? settings.readAloud.model : '')
  }, [settings, locked])
  const blocked = mediaMode
    ? maker
      ? null
      : { text: mediaProblem(settings, mediaMode), fix: 'settings' as const }
    : blocker(settings, locked)
  const info = modelInfo(settings, provider.id, settings.model)
  const spent = totals(messages ?? [], (id, model) => modelInfo(settings, id, model))
  const context = contextUse(messages ?? [], info)

  function commitMetas(next: ChatMeta[]) {
    metasRef.current = next
    setMetas(next)
  }

  function commitDocs(next: KnowledgeDoc[]) {
    docsRef.current = next
    setDocs(next)
  }

  // Remembers a deletion so that syncing deletes the item on other devices.
  function tombstone(key: string) {
    setSettings((s) => ({ ...s, sync: { ...s.sync, deleted: { ...s.sync.deleted, [key]: Date.now() } } }))
  }

  async function addDocs(baseId: string, files: File[]): Promise<string[]> {
    const problems: string[] = []
    for (const file of files) {
      try {
        const text = await extractText(file)
        const chunks = chunk(text)
        if (!chunks.length) throw new Error(t('"{name}" está vazio.', { name: file.name }))
        const doc: KnowledgeDoc = {
          id: crypto.randomUUID(),
          baseId,
          name: file.name,
          addedAt: Date.now(),
          size: text.length,
          chunks,
        }
        await saveDoc(doc)
        commitDocs([...docsRef.current, doc])
        const problem = await indexDocs([doc])
        if (problem) problems.push(problem)
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err))
      }
    }
    return problems
  }

  // Adds vectors to the documents that lack them for the current embedding
  // model; returns the problem met, if any. Documents stay searchable by words.
  async function indexDocs(which?: KnowledgeDoc[]): Promise<string | undefined> {
    const current = settingsRef.current
    const source = embedSource(current, latest.current.locked)
    if (!source) return
    const pending = (which ?? docsRef.current).filter((d) => d.vectors?.model !== source.key)
    for (const doc of pending) {
      try {
        const indexed = await indexDoc(current, source, doc)
        // Removed while it was being indexed.
        if (!docsRef.current.some((d) => d.id === doc.id)) continue
        await saveDoc(indexed)
        commitDocs(docsRef.current.map((d) => (d.id === doc.id ? indexed : d)))
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return t('"{name}" não foi indexado por sentido: {error}', { name: doc.name, error })
      }
    }
  }

  // A search typed in the library to try a base out; problems are left out.
  const searchTest = useCallback(
    async (baseId: string, query: string) => (await latest.current.searchBases([baseId], query)).hits,
    [],
  )

  // The passages of the bases that best match `query`, by words and, when the
  // documents are indexed, by meaning.
  async function searchBases(bases: string[], query: string, signal?: AbortSignal) {
    const current = settingsRef.current
    const source = embedSource(current, latest.current.locked)
    const docs = docsRef.current.filter((d) => bases.includes(d.baseId))
    let meaning: Meaning | undefined
    let problem: string | undefined
    if (source && query.trim() && docs.some((d) => d.vectors?.model === source.key)) {
      try {
        meaning = await meaningOf(current, source, query, signal)
      } catch (err) {
        if (signal?.aborted) throw err
        const error = err instanceof Error ? err.message : String(err)
        problem = t('A busca por sentido falhou ({error}); usei só a busca por palavras.', { error })
      }
    }
    return { hits: search(docs, query, { meaning }), problem }
  }

  async function removeDoc(id: string) {
    commitDocs(docsRef.current.filter((d) => d.id !== id))
    tombstone(`doc:${id}`)
    await deleteDoc(id)
  }

  function removeBase(base: KnowledgeBase) {
    const question = t('Excluir a base "{name}" e os documentos dela?', {
      name: base.name || t('Sem nome'),
    })
    if (!confirm(question)) return
    for (const doc of docsRef.current.filter((d) => d.baseId === base.id)) removeDoc(doc.id)
    setSettings((s) => ({ ...s, knowledgeBases: s.knowledgeBases.filter((b) => b.id !== base.id) }))
  }

  function commitThreads(next: Record<string, Message[]>) {
    threadsRef.current = next
    setThreads(next)
  }

  function findMeta(id: string | null): ChatMeta | undefined {
    return metasRef.current.find((c) => c.id === id)
  }

  // Writes a conversation to IndexedDB, unless it is temporary.
  function storeMeta(meta: ChatMeta) {
    if (!meta.temporary) saveMeta(meta)
  }

  function storeThread(id: string, messages: Message[]) {
    if (!findMeta(id)?.temporary) saveThread(id, messages)
  }

  function updateChat(id: string, fields: Partial<ChatMeta>) {
    const changedAt = Date.now()
    commitMetas(metasRef.current.map((c) => (c.id === id ? { ...c, ...fields, changedAt } : c)))
    const meta = findMeta(id)
    if (meta) storeMeta(meta)
  }

  // Typing in the canvas updates it at once and writes it a moment later.
  function setCanvas(next: Canvas | undefined, { now = false } = {}) {
    if (!activeId || !findMeta(activeId)) return setDraftCanvas(next)
    const id = activeId
    const changedAt = Date.now()
    commitMetas(metasRef.current.map((c) => (c.id === id ? { ...c, canvas: next, changedAt } : c)))
    clearTimeout(canvasSaves.current.get(id))
    const save = () => {
      canvasSaves.current.delete(id)
      const meta = findMeta(id)
      if (meta) storeMeta(meta)
    }
    if (now) save()
    else canvasSaves.current.set(id, setTimeout(save, 500))
  }

  function toggleCanvas() {
    if (showCanvas) return setShowCanvas(false)
    if (!canvas) setCanvas(newCanvas(t('Sem título')), { now: true })
    setShowPreview(false)
    setShowCanvas(true)
  }

  function discardCanvas() {
    if (canvas?.content && !confirm(t('Descartar o canvas desta conversa?'))) return
    setCanvas(undefined, { now: true })
    setShowCanvas(false)
  }

  // A request about the canvas, sent to the chat as a message.
  function askCanvas(request: string, selection: string) {
    const quoted = selection ? `> ${selection.replace(/\n/g, '\n> ')}\n\n` : ''
    const text = selection ? `${t('Sobre este trecho do canvas:')}\n\n${quoted}${request}` : request
    send(text)
  }

  function patchThread(id: string, patch: (messages: Message[]) => Message[]) {
    const thread = threadsRef.current[id]
    if (thread) commitThreads({ ...threadsRef.current, [id]: patch(thread) })
  }

  function persistThread(id: string) {
    const thread = threadsRef.current[id]
    // A conversation deleted mid-stream must not be written back.
    if (!thread || !findMeta(id)) return
    storeThread(id, thread)
    updateChat(id, {})
  }

  useEffect(() => {
    loadMetas().then((loaded) => {
      commitMetas(loaded)
      metasLoaded.current = true
      void importAgenda()
      void checkBackup(loaded.length)
    })
    loadDocs().then(commitDocs)
    loadHandle<FileSystemDirectoryHandle>('sync').then((folder) => folder && setSyncFolder(folder))
    const timer = setTimeout(
      () => Object.values(chunks).forEach((load) => load().catch(() => {})),
      PREFETCH_DELAY,
    )
    return () => clearTimeout(timer)
  }, [])

  // The automatic backup on disk. It starts once this browser's conversations
  // are loaded and, when they are gone but the disk has some, only after the
  // user chose whether to bring them back.
  const [backup, setBackup] = useState<AutoBackupState>({ state: 'idle' })
  const [backupOffer, setBackupOffer] = useState<BackupMeta | null>(null)
  const [backupOn, setBackupOn] = useState(false)
  const backupTimer = useRef<{ timer?: number; first?: number }>({})
  const backupBusy = useRef(false)
  const lastBackup = useRef('')

  async function checkBackup(localChats: number) {
    navigator.storage
      ?.persist?.()
      .then((persisted) => setBackup((b) => ({ ...b, persisted })))
      .catch(() => {})
    const status = await backupStatus()
    if (!status || status.off) return setBackup((b) => ({ ...b, state: 'unavailable' }))
    setBackup((b) => ({ ...b, dir: status.dir, latest: status.latest }))
    const offer = backupToOffer(localChats, status)
    setBackupOffer(offer)
    if (!offer) setBackupOn(true)
  }

  async function backupNow() {
    if (backupBusy.current) {
      backupTimer.current.timer = window.setTimeout(() => void backupNow(), BACKUP_DELAY)
      return
    }
    backupBusy.current = true
    try {
      const data: Backup = {
        chats: await loadChats(),
        ...library(settingsRef.current),
        docs: docsRef.current,
        settings: settingsForBackup(localStorage.getItem(SETTINGS_KEY)),
      }
      const body = JSON.stringify(data)
      if (body === lastBackup.current) return
      setBackup((b) => ({ ...b, state: 'saving' }))
      const latest = await saveBackupToDisk(buildBackup(data))
      lastBackup.current = body
      setBackup((b) => ({ ...b, state: 'saved', latest, error: undefined }))
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      setBackup((b) => ({ ...b, state: 'error', error }))
    } finally {
      backupBusy.current = false
    }
  }

  // A few seconds after the last change, and at least once a minute while
  // changes keep coming.
  useEffect(() => {
    if (!backupOn || settings.autoBackup === false) return
    const pending = backupTimer.current
    pending.first ??= Date.now()
    clearTimeout(pending.timer)
    const wait = Math.max(0, Math.min(BACKUP_DELAY, pending.first + BACKUP_MAX_WAIT - Date.now()))
    pending.timer = window.setTimeout(() => {
      pending.first = undefined
      pending.timer = undefined
      void backupNow()
    }, wait)
  }, [metas, settings, docs, backupOn])

  // Leaving the tab saves what is waiting.
  useEffect(() => {
    function hidden() {
      const pending = backupTimer.current
      if (document.visibilityState !== 'hidden' || pending.timer === undefined) return
      clearTimeout(pending.timer)
      pending.timer = pending.first = undefined
      void backupNow()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [])

  // Brings the backup on disk back: its conversations and library are merged
  // in; its settings replace these only when this browser has no keys yet, and
  // its keys come back once the user types the password they were sealed with.
  async function restoreAutoBackup(): Promise<string> {
    const saved = parseBackup(await readLatestBackup())
    const current = settingsRef.current
    const fresh = !current.vault && Object.keys(keysOf(current)).length === 0
    let note = ''
    if (saved.settings && fresh) {
      const restored = mergeSettings(saved.settings)
      setVaultKey(null)
      setSettings(restored)
      if (restored.vault) {
        setShowUnlock(true)
        note = t('Digite a sua senha para trazer as chaves de volta.')
      } else {
        note = t('As chaves não estavam no backup; cole-as de novo nas configurações.')
      }
    }
    const summary = await importBackupData(saved)
    setBackupOffer(null)
    setBackupOn(true)
    return note ? `${summary} ${note}` : summary
  }

  // With a vault, the keys are written only in encrypted form. While locked
  // the in-memory keys are empty and the stored vault is left as it is.
  useEffect(() => {
    if (adopted.current === settings) return
    if (!settings.vault) return saveSettings(settings)
    if (!vaultKey) return saveSettings(withoutKeys(settings))
    let stale = false
    seal(vaultKey, settings.vault.salt, keysOf(settings)).then((vault) => {
      if (!stale) saveSettings({ ...withoutKeys(settings), vault })
    })
    return () => {
      stale = true
    }
  }, [settings, vaultKey])

  // Another tab wrote the settings: adopt them instead of overwriting them
  // later with this tab's copy, which could undo a password set over there.
  useEffect(() => {
    async function adopt(event: StorageEvent) {
      if (event.key !== SETTINGS_KEY) return
      let next = loadSettings()
      let key = next.vault?.salt === settings.vault?.salt ? vaultKey : null
      if (next.vault && key) {
        try {
          next = withKeys(next, await unseal(key, next.vault))
        } catch {
          key = null
        }
      }
      adopted.current = next
      setVaultKey(key)
      setSettings(next)
    }
    window.addEventListener('storage', adopt)
    return () => window.removeEventListener('storage', adopt)
  }, [settings.vault?.salt, vaultKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  useEffect(() => applyAppearance(settings.appearance), [settings.appearance])

  // Each change to a library item gets a time, which decides what syncing
  // keeps. Items are compared by content: settings adopted from another tab
  // are new objects with the same content.
  const libraryText = useMemo(
    () => JSON.stringify(library(settings)),
    [settings.folders, settings.personas, settings.prompts, settings.memories, settings.knowledgeBases],
  )
  useEffect(() => {
    setSettings((s) => {
      // Before items were tracked one by one, the whole library had one time.
      const since = (s as { libraryChangedAt?: number }).libraryChangedAt || 1
      const sync = trackLibrary(library(s), s.sync, Date.now(), since)
      return sync ? { ...s, sync } : s
    })
  }, [libraryText])

  // The app's side of a sync, read from the latest state.
  function syncLocal(): SyncLocal {
    const current = settingsRef.current
    return {
      chats: metasRef.current
        .filter((c) => !c.temporary)
        .map((c) => ({ id: c.id, changedAt: c.changedAt ?? c.updatedAt })),
      deleted: current.sync.deleted,
      items: Object.entries(current.sync.items ?? {}).map(([key, { at }]) => ({ key, changedAt: at })),
      docIds: docsRef.current.map((d) => d.id),
      async readChat(id) {
        const meta = findMeta(id)!
        return { ...meta, messages: threadsRef.current[id] ?? (await loadThread(id)) }
      },
      async writeChat({ messages, ...meta }) {
        await Promise.all([saveMeta(meta), saveThread(meta.id, messages)])
        const others = metasRef.current.filter((c) => c.id !== meta.id)
        commitMetas([...others, meta].sort((x, y) => y.updatedAt - x.updatedAt))
        if (threadsRef.current[meta.id]) {
          commitThreads({ ...threadsRef.current, [meta.id]: messages })
        }
      },
      async removeChat(id) {
        if (latest.current.activeId === id) setActiveId(null)
        commitMetas(metasRef.current.filter((c) => c.id !== id))
        const { [id]: _removed, ...rest } = threadsRef.current
        commitThreads(rest)
        await deleteChat(id)
      },
      readItem: (key) => itemsOf(library(settingsRef.current)).get(key),
      writeItem: (key, value, at) => changeItem(key, value, at),
      removeItem: (key) => changeItem(key, null),
      readDoc: async (id) => docsRef.current.find((d) => d.id === id)!,
      async writeDoc(doc) {
        await saveDoc(doc)
        commitDocs([...docsRef.current.filter((d) => d.id !== doc.id), doc])
      },
      async removeDoc(id) {
        commitDocs(docsRef.current.filter((d) => d.id !== id))
        await deleteDoc(id)
      },
    }
  }

  // A library item received from another device, with the time it changed
  // there, so that it does not count as a change made here.
  function changeItem(key: string, value: unknown, at = 0) {
    const update = (s: Settings): Settings => {
      const { [key]: _old, ...items } = s.sync.items ?? {}
      if (value) items[key] = { hash: hashOf(value), at }
      return { ...s, ...withItem(library(s), key, value), sync: { ...s.sync, items } }
    }
    settingsRef.current = update(settingsRef.current)
    setSettings(update)
  }

  // `ask` lets the browser ask for access to the folder, after a click.
  async function syncNow(ask = false) {
    const remote = remoteStore(settingsRef.current)
    const folder = syncFolder
    // Mid-reply the chat is incomplete; while locked, the passwords are unknown.
    if ((!remote && !folder) || syncing.current || streaming || locked) return
    if (!remote && !(await mayUse(folder!, ask).catch(() => false))) {
      return setSyncStatus({ state: 'permission' })
    }
    syncing.current = true
    setSyncStatus({ state: 'syncing' })
    try {
      const store = remote ?? folderStore(folder!)
      const report = await runSync(store, syncLocal(), settingsRef.current.sync.password)
      const now = Date.now()
      const cutoff = now - TOMBSTONE_DAYS * 86_400_000
      setSettings((s) => ({
        ...s,
        sync: {
          ...s.sync,
          lastSync: now,
          deleted: Object.fromEntries(Object.entries(s.sync.deleted).filter(([, at]) => at > cutoff)),
        },
      }))
      setSyncStatus({
        state: 'done',
        message: t('{sent} enviados, {received} recebidos, {removed} apagados.', { ...report }),
      })
    } catch (err) {
      setSyncStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      syncing.current = false
    }
  }

  // Connecting one place disconnects any other.
  function syncWith(fields: Partial<Settings['sync']>) {
    const update = (s: Settings): Settings => ({
      ...s,
      sync: { ...s.sync, folder: '', webdav: undefined, s3: undefined, lastSync: undefined, ...fields },
    })
    settingsRef.current = update(settingsRef.current)
    setSettings(update)
  }

  async function connectSync() {
    try {
      const folder = await pickFolder()
      await saveHandle('sync', folder)
      setSyncFolder(folder)
      syncWith({ folder: folder.name })
    } catch (err) {
      // Closing the picker is not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setSyncStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // Lists the server's files first, so that a wrong address or password is
  // reported before anything is connected.
  async function connectRemote(target: RemoteTarget): Promise<string | undefined> {
    const fields = { webdav: target.webdav, s3: target.s3, proxy: target.proxy }
    try {
      await remoteStore({ ...settingsRef.current, sync: { ...settingsRef.current.sync, ...fields } })!.list()
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
    if (syncFolder) {
      await saveHandle('sync', null)
      setSyncFolder(null)
    }
    setSyncStatus({ state: 'idle' })
    syncWith(fields)
  }

  async function disconnectSync() {
    await saveHandle('sync', null)
    setSyncFolder(null)
    setSyncStatus({ state: 'idle' })
    syncWith({})
  }

  // What the app syncs with; a change of place syncs at once.
  const syncKind: SyncKind | null = syncFolder
    ? 'folder'
    : settings.sync.webdav
      ? 'webdav'
      : settings.sync.s3
        ? 's3'
        : null
  const syncPlace = syncFolder
    ? `folder:${syncFolder.name}`
    : settings.sync.webdav
      ? `webdav:${settings.sync.webdav.url}`
      : settings.sync.s3
        ? `s3:${bucketUrl(settings.sync.s3)}/${settings.sync.s3.prefix}`
        : ''

  // Syncs on connecting, a moment after each change, on returning to the
  // tab, and every few minutes; never while a reply streams.
  useEffect(() => {
    if (!syncPlace || streaming || locked) return
    const timer = setTimeout(() => latest.current.syncNow(), SYNC_DELAY)
    return () => clearTimeout(timer)
  }, [syncPlace, streaming, locked, metas, docs, settings.sync.items, settings.sync.deleted])
  useEffect(() => {
    if (!syncPlace) return
    latest.current.syncNow()
    const timer = setInterval(() => latest.current.syncNow(), SYNC_EVERY)
    const onFocus = () => latest.current.syncNow()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [syncPlace])

  async function enableVault(password: string) {
    const salt = newSalt()
    const key = await deriveKey(password, salt)
    const vault = await seal(key, salt, keysOf(settings))
    setVaultKey(key)
    setSettings((s) => ({ ...s, vault }))
  }

  async function unlock(password: string) {
    const vault = settings.vault
    if (!vault) return
    const key = await deriveKey(password, vault.salt)
    const keys = await unseal(key, vault)
    setVaultKey(key)
    setSettings((s) => withKeys(s, keys))
  }

  async function lock() {
    if (!settings.vault || !vaultKey) return
    // Seal the current keys first so that unlocking later restores them.
    const vault = await seal(vaultKey, settings.vault.salt, keysOf(settings))
    setVaultKey(null)
    setSettings({ ...withoutKeys(settings), vault })
  }

  function disableVault() {
    setVaultKey(null)
    setSettings((s) => ({ ...s, vault: undefined }))
  }

  function resetVault() {
    settings.mcpServers.forEach((server) => forget(server.id))
    setVaultKey(null)
    setSettings((s) => ({ ...withoutKeys(s), vault: undefined }))
  }

  function selectModel(providerId: string, model: string) {
    setSettings((s) => ({ ...s, providerId, model }))
  }

  function toggleTheme() {
    setSettings((s) => ({
      ...s,
      appearance: { ...s.appearance, theme: s.appearance.theme === 'dark' ? 'light' : 'dark' },
    }))
  }

  function showArtifact(lang: string, code: string, name?: string) {
    const open = artifacts.find((a) => a.lang === lang && a.code === code)
    const artifact = open ?? {
      id: crypto.randomUUID(),
      name: name ?? artifactName(lang, ++artifactCount.current),
      lang,
      code,
    }
    if (!open) setArtifacts((list) => [...list, artifact])
    setArtifactId(artifact.id)
    setShowCanvas(false)
    setShowPreview(true)
  }

  // Opening an empty panel shows the conversation's latest previewable block.
  function togglePreview() {
    if (showPreview) return setShowPreview(false)
    setShowCanvas(false)
    const block = artifacts.length
      ? null
      : (messages ?? [])
          .filter((m) => m.role === 'assistant')
          .map((m) => lastPreviewable(m.content))
          .findLast(Boolean)
    if (block) showArtifact(block.lang, block.code)
    else setShowPreview(true)
  }

  function closeArtifact(id: string) {
    const rest = artifacts.filter((a) => a.id !== id)
    setArtifacts(rest)
    if (id === artifactId) setArtifactId(rest.at(-1)?.id ?? null)
  }

  function runAction(action: PaletteAction) {
    if (action === 'new') selectChat(null)
    else if (action === 'temporary') {
      selectChat(null)
      setDraftTemporary(true)
    }
    else if (action === 'preview') togglePreview()
    else if (action === 'tools') setShowTools(true)
    else if (action === 'library') setShowLibrary(true)
    else if (action === 'settings') setShowSettings(true)
    else if (action === 'usage') setShowUsage(true)
    else if (action === 'theme') toggleTheme()
    else if (action === 'clear') clearContext()
    else lock()
  }

  async function selectChat(id: string | null) {
    setDraftFolder(undefined)
    if (id !== activeId) closeAside()
    // Leaving a temporary conversation throws it away.
    const left = findMeta(activeId)
    if (left?.temporary && id !== left.id) {
      if (streaming) abortRef.current?.abort()
      commitMetas(metasRef.current.filter((c) => c.id !== left.id))
      const { [left.id]: _gone, ...rest } = threadsRef.current
      commitThreads(rest)
    }
    setShowDrawer(false)
    setShowUsage(false)
    setActiveId(id)
    setVersionsAt(null)
    const meta = findMeta(id)
    if (!id || !meta) return
    // Continue a conversation with the model it was last using.
    setSettings((s) => ({ ...s, providerId: meta.providerId, model: meta.model }))
    if (!threadsRef.current[id]) {
      const loaded = await loadThread(id)
      // A message sent while loading has already created the thread.
      if (!threadsRef.current[id]) commitThreads({ ...threadsRef.current, [id]: loaded })
    }
  }

  // Streams a reply to `history`, whose last message must be the user's turn.
  // `branch` links the reply to the versions it replaces. `targets` writes it
  // with other models, all at once, without changing the one the conversation
  // uses: the first becomes the current version and the rest sit beside it.
  // `media` makes an image, video or audio from the last message instead of
  // replying to it.
  async function generate(
    base: ChatMeta,
    history: Message[],
    { branch, targets, media }: { branch?: Branch; targets?: Target[]; media?: MediaJob } = {},
  ) {
    // An agent called with @name answers this turn, with its own model if it has one.
    const turn = history.at(-1)
    const called =
      !media && !targets && turn?.role === 'user' && turn.agentId
        ? settings.personas.find((p) => p.id === turn.agentId)
        : undefined
    const usings: Target[] = media
      ? [{ providerId: media.target.source, model: media.target.model }]
      : targets?.length
        ? targets
        : [
            called?.model
              ? { providerId: called.providerId ?? settings.providerId, model: called.model }
              : { providerId: settings.providerId, model: settings.model },
          ]
    const problems = media ? [] : usings.map((using) => blocker({ ...settings, ...using }, locked))
    const problem = problems.find(Boolean)
    if (problem && targets) alert(problem.text)
    if (streaming || problem) return
    const now = Date.now()
    const agentOf =
      called ?? agentFor(settings.personas, base.params?.personaId, settings.folders.find((f) => f.id === base.folderId))
    const bases = media ? [] : basesFor(settings, base.params, agentOf)
    let references: Reference[] = []
    const replies: Message[] = usings.map((using) => ({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: now,
      ...using,
      ...(called ? { agentName: called.name } : {}),
      ...(media
        ? {
            imagePrompt: history.at(-1)?.content ?? '',
            ...(media.kind === 'image' ? {} : { mediaKind: media.kind }),
          }
        : {}),
    }))
    const [first, ...others] = replies
    const alts = [...(branch?.alts ?? []), ...others.map((reply) => [reply])]
    const current: Message = alts.length
      ? { ...first, alts, altIndex: branch?.altIndex ?? 0 }
      : first
    const meta: ChatMeta = {
      ...base,
      updatedAt: now,
      changedAt: now,
      // A model an @agent brought answers once; the conversation keeps its own.
      ...(targets || media || called?.model ? {} : usings[0]),
    }
    commitMetas([meta, ...metasRef.current.filter((c) => c.id !== meta.id)])
    commitThreads({ ...threadsRef.current, [meta.id]: [...history, current] })
    storeMeta(meta)
    setActiveId(meta.id)
    setStreaming(true)
    const abort = new AbortController()
    abortRef.current = abort
    // Stopping the reply also answers any pending permission request.
    abort.signal.addEventListener('abort', () => approvals.current.forEach((answer) => answer(false)))
    setToolProblems([])

    // The reply may be the current version or one beside it.
    const patcher = (id: string) => (patch: (m: Message) => Message) =>
      patchThread(meta.id, (thread) => patchMessage(thread, id, patch))
    // The folder's context, and its agent when the conversation has none.
    const folder = settings.folders.find((f) => f.id === meta.folderId)
    const agent = called ?? agentFor(settings.personas, meta.params?.personaId, folder)
    const tools = toolsFor(settings, agent)
    const recent = sinceSummary(history)
    let system = called
      ? called.system.trim() || meta.params?.system?.trim() || settings.systemPrompt
      : meta.params?.system?.trim() || agent?.system?.trim() || settings.systemPrompt
    if (folder?.instructions?.trim()) system = `${system ? `${system}\n\n` : ''}${folderNote(folder)}`
    const contextFiles = [...(folder?.files ?? []), ...(agent?.files ?? [])]
    // A temporary conversation neither reads nor saves memories.
    const remember = settings.memory && !meta.temporary
    if (remember) system = withMemories(system, settings.memories)
    system = withSummary(system, recent.summary)
    // Comparing models would let each of them change the same canvas.
    const sharedCanvas = !media && !targets ? meta.canvas : undefined
    if (sharedCanvas) system = `${system ? `${system}\n\n` : ''}${CANVAS_NOTE}`
    // The project folder, read when the request is sent: an earlier reply may have made it.
    const project = settings.projects !== false && !targets ? findMeta(meta.id)?.project : undefined
    if (project) system = `${system ? `${system}\n\n` : ''}${projectNote(project)}`
    // The conversation's own parameters, else its agent's.
    const callParams = agentParams(meta.params, agent)
    let toolset: ToolSet | null = null
    // A deep research request: searched in rounds, answered with a report.
    const asked = history.at(-1)
    const researching = !media && !targets && asked?.role === 'user' && !!asked.research
    if (researching) system = `${system ? `${system}\n\n` : ''}${RESEARCH_NOTE}`
    // Search with the user's own key replaces the provider's, for every model.
    const webSet = !media && (tools.webSearch || researching) ? webToolSet(settings) : null

    async function paint(reply: Message, job: MediaJob): Promise<boolean> {
      const patchReply = patcher(reply.id)
      try {
        const { generateMedia } = await import('./mediaJobs')
        const made = await generateMedia({
          settings,
          target: job.target,
          kind: job.kind,
          prompt: reply.imagePrompt ?? '',
          signal: abort.signal,
          onProgress: (mediaProgress) => patchReply((m) => ({ ...m, mediaProgress })),
        })
        const extension = made.mime.split('/')[1]?.replace('mpeg', 'mp3').replace(/[^a-z0-9]/g, '')
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          name: fileName(reply.imagePrompt ?? '', extension || 'bin'),
          mime: made.mime,
          kind: job.kind,
          data: made.data,
          ...(made.url && !made.data ? { url: made.url } : {}),
        }
        // The file is kept in the conversation's folder too, in midia/.
        if (made.data && settings.projects !== false && !meta.temporary) {
          void saveToProject(
            meta.id,
            [{ name: `midia/${attachment.name}`, content: made.data, encoding: 'base64' }],
            sourceName(job.target.source),
          )
        }
        patchReply((m) => ({
          ...m,
          content: made.revised ?? '',
          attachments: [attachment],
          mediaProgress: undefined,
          ...(made.cost === undefined ? {} : { usage: { input: 0, output: 0, cost: made.cost } }),
        }))
        return true
      } catch (err) {
        if (!abort.signal.aborted) {
          const error = err instanceof Error ? err.message : String(err)
          patchReply((m) => ({ ...m, error, mediaProgress: undefined }))
        } else {
          patchReply((m) => ({ ...m, mediaProgress: undefined }))
        }
        return false
      }
    }

    async function write(reply: Message, using: Target): Promise<boolean> {
      const patchReply = patcher(reply.id)
      const via = getProvider(using.providerId)
      const info = modelInfo(settings, via.id, using.model)
      const patchTool = (id: string, fields: Partial<ToolPart>) =>
        patchReply((m) => ({
          ...m,
          parts: m.parts?.map((p) => (p.type === 'tool' && p.id === id ? { ...p, ...fields } : p)),
        }))
      try {
        const stream = streamChat({
          ...connection(settings, via.id),
          model: using.model,
          system: settings.previewHint ? withPreviewHint(system, t('Abrir preview')) : system,
          messages: withFiles(
            withCanvasText(withKnowledge(toRequest(recent.messages), references), sharedCanvas),
            contextFiles,
          ),
          // An effort level chosen for another provider may not exist in this one.
          params: {
            ...callParams,
            effort: via.efforts.includes(callParams.effort ?? '') ? callParams.effort : undefined,
          },
          signal: abort.signal,
          tools: toolset?.defs,
          webSearch: (tools.webSearch || researching) && !!via.webTools && !webSet,
          webFetch: (tools.webFetch || researching) && via.webTools === 'anthropic' && !webSet,
          ...(researching ? { maxRounds: RESEARCH_ROUNDS } : {}),
          showThinking: settings.showThinking,
          // Automatic caching is a feature of Anthropic's own API.
          promptCache: settings.promptCache && via.id === 'anthropic',
          async runTool(call) {
            if (!toolset) throw new Error(`No tool named ${call.name}.`)
            if (!toolset.autoApprove(call.name)) {
              patchTool(call.id, { status: 'approval' })
              const allowed = await new Promise<boolean>((answer) =>
                approvals.current.set(call.id, answer),
              )
              approvals.current.delete(call.id)
              if (!allowed) return { content: 'The user declined this tool call.', isError: true }
              patchTool(call.id, { status: 'running' })
            }
            const result = await toolset.run(call, abort.signal)
            if (result.references?.length) {
              patchReply((m) => ({ ...m, references: withMore(m.references, result.references!) }))
            }
            if (result.sources?.length) {
              patchReply((m) => ({ ...m, sources: withSources(m.sources, result.sources!) }))
            }
            return result
          },
        })
        for await (const event of stream) {
          if (event.type === 'text') {
            patchReply((m) => withText(m, event.text))
          } else if (event.type === 'sources') {
            patchReply((m) => ({ ...m, sources: event.sources }))
          } else if (event.type === 'thinking') {
            if (settings.showThinking) {
              patchReply((m) => ({ ...m, thinking: (m.thinking ?? '') + event.text }))
            }
          } else if (event.type === 'tool') {
            const { part } = event
            const label = part.provider
              ? (PROVIDER_TOOLS[part.name]?.() ?? part.name)
              : (toolset?.label(part.name) ?? part.name)
            patchReply((m) => withTool(m, part, label))
          } else if (event.type === 'usage') {
            const cost = costOf(event.usage, info)
            patchReply((m) => ({ ...m, usage: { ...event.usage, cost } }))
          } else {
            patchReply((m) => ({ ...m, truncated: true }))
          }
        }
        return true
      } catch (err) {
        if (!abort.signal.aborted) {
          const error = err instanceof Error ? err.message : String(err)
          patchReply((m) => ({ ...m, error }))
        }
        return false
      } finally {
        // A reply that stopped midway leaves no call waiting or running.
        patchReply((m) =>
          m.parts?.some((p) => p.type === 'tool' && p.status !== 'done')
            ? {
                ...m,
                parts: m.parts.map((p) =>
                  p.type === 'tool' && p.status !== 'done'
                    ? { ...p, status: 'done' as const, error: true }
                    : p,
                ),
              }
            : m,
        )
      }
    }

    let completed = false
    try {
      const problems: string[] = []
      if (bases.length) {
        const found = await searchBases(bases, knowledgeQuery(history), abort.signal)
        references = found.hits.map(({ name, text }) => ({ name, text }))
        if (found.problem) problems.push(found.problem)
        if (references.length) {
          replies.forEach((reply) => patcher(reply.id)((m) => ({ ...m, references })))
        }
      }
      if (!media) {
        // Skills and plugins on disk; a TSRS without its server has none.
        const [skills, plugins] = await Promise.all([
          listSkills().catch(() => []),
          listPlugins().catch(() => [] as Plugin[]),
        ])
        const skillsOn = agentSkills(enabledSkills(skills, settings), agent)
        if (skillsOn.length) system = `${system ? `${system}\n\n` : ''}${skillsNote(skillsOn)}`
        const pluginSet = pluginToolSet(agentPlugins(enabledPlugins(plugins, settings), agent))
        const servers = settings.mcpServers.filter(
          (s) => s.url && tools.mcpServers.includes(s.id),
        )
        toolset = mergeTools([
          ...(sharedCanvas ? [canvasTools(meta.id)] : []),
          ...(project ? [projectTools(meta.id, usings[0].model)] : []),
          ...(project ? [stockTools(meta.id, usings[0].model)].filter((set): set is ToolSet => !!set) : []),
          ...(project ? [shortTools(meta.id, first.id, usings[0].model)].filter((set): set is ToolSet => !!set) : []),
          ...(remember ? [memoryTools()] : []),
          ...(bases.length ? [knowledgeTools(bases)] : []),
          ...(skillsOn.length ? [skillTools()] : []),
          ...(pluginSet ? [pluginSet] : []),
          ...(webSet ? [webSet] : []),
          ...(servers.length ? [await gatherTools(servers)] : []),
        ])
        problems.push(...(toolset?.problems ?? []))
      }
      if (problems.length) setToolProblems(problems)
      const results = await Promise.all(
        replies.map((reply, i) => (media ? paint(reply, media) : write(reply, usings[i]))),
      )
      completed = results[0]
      if (completed && settings.doneSound) chime()
    } catch (err) {
      if (!abort.signal.aborted) {
        const error = err instanceof Error ? err.message : String(err)
        replies.forEach((reply) => patcher(reply.id)((m) => ({ ...m, error })))
      }
    } finally {
      setStreaming(false)
      persistThread(meta.id)
    }

    // A research report is kept in the project folder, with every page consulted.
    if (completed && researching && settings.projects !== false && !meta.temporary) {
      const reply = threadsRef.current[meta.id]?.find((m) => m.id === first.id)
      if (reply?.content.trim()) {
        const at = new Date()
        const question = asked!.content
        void saveToProject(
          meta.id,
          [{ name: reportName(question, at), content: reportFile(question, reply.content, reply.sources ?? [], usings[0].model, at) }],
          usings[0].model,
        )
      }
    }

    // The files the reply made go to the conversation's folder.
    if (completed && !targets && !media && settings.projects !== false && !meta.temporary) {
      const reply = threadsRef.current[meta.id]?.find((m) => m.id === first.id)
      const files = reply ? filesFromReply(reply.content) : []
      if (files.length) void saveToProject(meta.id, files, usings[0].model)
    }

    if (completed && !targets && !media && settings.autoPreview) {
      const reply = threadsRef.current[meta.id]?.find((m) => m.id === first.id)
      const block = reply && lastPreviewable(reply.content, AUTO_PREVIEW)
      if (block) latest.current.showArtifact(block.lang, block.code)
    }

    // A temporary conversation is listed nowhere, so its title is not worth a request.
    const titled = settings.autoTitle && !meta.temporary
    if (completed && !targets && !media && titled && history.length === 1) {
      titleChat(meta.id, connection(settings, usings[0].providerId))
    }
  }

  // Writing and editing the chat's canvas, which opens to show the change.
  function canvasTools(chatId: string): ToolSet {
    return localTools(CANVAS_TOOLS, t('Canvas'), (call) => {
      const current = findMeta(chatId)?.canvas
      if (!current) return { content: 'The canvas was closed.', isError: true }
      const { canvas: next, result } = runCanvasTool(current, call)
      if (next !== current) {
        updateChat(chatId, { canvas: next })
        if (chatId === latest.current.activeId) {
          setShowPreview(false)
          setShowCanvas(true)
        }
      }
      return result
    })
  }

  // The folder a conversation saves into, made the first time it has files.
  async function ensureProject(chatId: string) {
    const meta = findMeta(chatId)
    if (!meta) return null
    if (meta.project) return meta.project
    const thread = threadsRef.current[chatId] ?? []
    const request = thread.find((m) => m.role === 'user')?.content ?? meta.title
    const project = await openProject({
      name: meta.title || request.slice(0, 48),
      notes: projectNotes(meta.title || t('Projeto'), request, new Date()),
    })
    updateChat(chatId, { project })
    return project
  }

  function warnProject(error: string) {
    if (projectWarned.current) return
    projectWarned.current = true
    setToolProblems((list) => [...list, error])
  }

  // Saves files into the conversation's folder and notes it in NOTAS.md.
  async function saveToProject(chatId: string, files: SavedFile[], who: string) {
    try {
      if (!findMeta(chatId)?.project && !(await projectsRoot())) {
        return warnProject(
          t(
            'Os arquivos desta conversa não foram salvos numa pasta: abra o TSRS pelo npm run dev na pasta do projeto para isso.',
          ),
        )
      }
      const project = await ensureProject(chatId)
      if (!project) return
      const written = await saveFiles(project.path, files)
      await saveFiles(project.path, [{ name: 'NOTAS.md', content: historyLine(written, who, new Date()), append: true }])
    } catch (err) {
      warnProject(
        t('Os arquivos desta conversa não foram salvos na pasta: {error}', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  // Reading and writing the conversation's folder, without asking: it is its own.
  function projectTools(chatId: string, who: string): ToolSet {
    return localTools(PROJECT_TOOLS, t('Pasta do projeto'), async (call) => {
      const project = findMeta(chatId)?.project
      if (!project) return { content: 'This conversation has no project folder.', isError: true }
      return runProjectTool(project, call, (written) => {
        void saveFiles(project.path, [{ name: 'NOTAS.md', content: historyLine(written, who, new Date()), append: true }])
      })
    })
  }

  // Stock video saved into the project, credited in CREDITOS.md.
  function stockTools(chatId: string, who: string): ToolSet | null {
    return stockToolSet(
      settingsRef.current,
      () => findMeta(chatId)?.project,
      (files, credits) => {
        const project = findMeta(chatId)?.project
        if (!project) return
        void saveFiles(project.path, [
          { name: 'CREDITOS.md', content: `${credits.join('\n')}\n`, append: true },
          { name: 'NOTAS.md', content: historyLine(files, who, new Date()), append: true },
        ])
      },
    )
  }

  // Short videos made in the project; the video shows in the reply as it is done.
  function shortTools(chatId: string, replyId: string, who: string): ToolSet | null {
    const current = settingsRef.current
    const patchReply = (patch: (m: Message) => Message) => patchThread(chatId, (thread) => patchMessage(thread, replyId, patch))
    return shortToolSet({
      settings: current,
      project: () => findMeta(chatId)?.project,
      voice: narrator(current, locked, mediaTargets.audio),
      musicTarget: current.mediaKeys.elevenlabs?.trim() ? { source: 'elevenlabs', model: 'music', options: '' } : null,
      onStep: (callId, progress) =>
        patchReply((m) => ({
          ...m,
          parts: m.parts?.map((p) => (p.type === 'tool' && p.id === callId ? { ...p, progress } : p)),
        })),
      onDone: (result) => {
        const project = findMeta(chatId)?.project
        if (project) void saveFiles(project.path, [{ name: 'NOTAS.md', content: historyLine([result.file], who, new Date()), append: true }])
        patchReply((m) => ({
          ...m,
          attachments: [
            ...(m.attachments ?? []),
            { id: crypto.randomUUID(), name: result.file.split('/').pop()!, mime: 'video/mp4', kind: 'video', data: '', url: result.url },
          ],
        }))
      },
    })
  }

  // Points the conversation at another folder, bringing its files along.
  async function moveProject(chatId: string, path: string) {
    const meta = findMeta(chatId)
    const next = await openProject({ path, name: meta?.title })
    if (meta?.project && meta.project.path !== next.path) await copyFiles(meta.project.path, next.path)
    updateChat(chatId, { project: next })
  }

  // Searching the conversation's knowledge bases again, with the model's words.
  function knowledgeTools(bases: string[]): ToolSet {
    const names = settingsRef.current.knowledgeBases
      .filter((b) => bases.includes(b.id))
      .map((b) => b.name || t('Sem nome'))
    return localTools([knowledgeTool(names)], t('Busca na base'), async (call, signal) => {
      const query = queryOf(call.input)
      if (!query) return { content: 'The query is empty.', isError: true }
      const { hits, problem } = await searchBases(bases, query, signal)
      if (problem) setToolProblems((list) => [...new Set([...list, problem])])
      return hitsResult(hits)
    })
  }

  // Saving and deleting memories, run without asking: the list is in the library.
  function memoryTools(): ToolSet {
    return localTools(MEMORY_TOOLS, t('Memória'), (call) => {
      const { memories, result } = runMemoryTool(settingsRef.current.memories, call)
      settingsRef.current = { ...settingsRef.current, memories }
      setSettings((s) => ({ ...s, memories }))
      return result
    })
  }

  // Marks the end of the conversation so far: later requests start after it.
  function clearContext() {
    const meta = findMeta(activeId)
    const thread = meta && threadsRef.current[meta.id]
    if (!meta || !thread?.length || streaming || thread.at(-1)?.contextReset) return
    commitThreads({ ...threadsRef.current, [meta.id]: [...thread, contextResetMark()] })
    persistThread(meta.id)
  }

  function undoClearContext(id: string) {
    const meta = findMeta(activeId)
    if (!meta || streaming) return
    patchThread(meta.id, (messages) => messages.filter((m) => m.id !== id))
    persistThread(meta.id)
  }

  // Replaces what came before with a summary the next requests start from.
  async function summarize() {
    const meta = findMeta(activeId)
    const thread = meta && threadsRef.current[meta.id]
    if (!meta || !thread?.length || streaming || blocker(settings, locked)) return
    const recent = sinceSummary(thread)
    const info = modelInfo(settings, provider.id, settings.model)
    const reply: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      summary: true,
      providerId: provider.id,
      model: settings.model,
    }
    const patchReply = (patch: (m: Message) => Message) =>
      patchThread(meta.id, (messages) => patchMessage(messages, reply.id, patch))
    commitThreads({ ...threadsRef.current, [meta.id]: [...thread, reply] })
    setStreaming(true)
    setToolProblems([])
    const abort = new AbortController()
    abortRef.current = abort
    try {
      const system = withSummary(meta.params?.system?.trim() || settings.systemPrompt, recent.summary)
      const stream = streamChat({
        ...connection(settings, provider.id),
        model: settings.model,
        system,
        messages: [...toRequest(recent.messages), { role: 'user', content: SUMMARY_PROMPT }],
        signal: abort.signal,
      })
      for await (const event of stream) {
        if (event.type === 'text') patchReply((m) => ({ ...m, content: m.content + event.text }))
        if (event.type === 'usage') {
          const usage = { ...event.usage, context: event.usage.output }
          patchReply((m) => ({ ...m, usage: { ...usage, cost: costOf(usage, info) } }))
        }
      }
      if (abort.signal.aborted) throw abort.signal.reason
    } catch (err) {
      // A summary that did not finish must not stand in for the conversation.
      patchThread(meta.id, (messages) => messages.filter((m) => m.id !== reply.id))
      if (!abort.signal.aborted) {
        setToolProblems([err instanceof Error ? err.message : String(err)])
      }
    } finally {
      setStreaming(false)
      persistThread(meta.id)
    }
  }

  // Asks about part of a reply, with the conversation up to it as context.
  async function askAside(text: string) {
    const current = aside
    const thread = current && threadsRef.current[current.chatId]
    const at = thread?.findIndex((m) => m.id === current?.replyId) ?? -1
    if (!current || !thread || at < 0 || asideBusy || blocker(settings, locked)) return
    const question: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const answer: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      providerId: provider.id,
      model: settings.model,
    }
    const exchange = [...current.messages, question]
    const update = (patch: (m: Message) => Message) =>
      setAside((open) =>
        open && open.replyId === current.replyId
          ? { ...open, messages: open.messages.map((m) => (m.id === answer.id ? patch(m) : m)) }
          : open,
      )
    setAside({ ...current, messages: [...exchange, answer] })
    setAsideBusy(true)
    const abort = new AbortController()
    asideAbort.current = abort
    const recent = sinceSummary(thread.slice(0, at + 1))
    const meta = findMeta(current.chatId)
    const system = withSummary(meta?.params?.system?.trim() || settings.systemPrompt, recent.summary)
    // The excerpt goes with the first question, which the panel shows apart.
    const quoted = `> ${current.quote.replace(/\n/g, '\n> ')}`
    const asked = exchange.map((m, i) =>
      i === 0 && current.quote
        ? { ...m, content: `About this part of your reply:\n\n${quoted}\n\n${m.content}` }
        : m,
    )
    try {
      const info = modelInfo(settings, provider.id, settings.model)
      const stream = streamChat({
        ...connection(settings, provider.id),
        model: settings.model,
        system: `${system ? `${system}\n\n` : ''}${ASIDE_NOTE}`,
        messages: toRequest([...recent.messages, ...asked]),
        signal: abort.signal,
      })
      for await (const event of stream) {
        if (event.type === 'text') update((m) => ({ ...m, content: m.content + event.text }))
        if (event.type === 'usage') {
          update((m) => ({ ...m, usage: { ...event.usage, cost: costOf(event.usage, info) } }))
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        const error = err instanceof Error ? err.message : String(err)
        update((m) => ({ ...m, error }))
      }
    } finally {
      setAsideBusy(false)
    }
  }

  function openAside(replyId: string, quote: string) {
    if (!activeId) return
    asideAbort.current?.abort()
    setAside({ chatId: activeId, replyId, quote, messages: [] })
  }

  function closeAside() {
    asideAbort.current?.abort()
    setAside(null)
  }

  async function titleChat(id: string, conn: Connection) {
    const meta = findMeta(id)
    const [question, answer] = threadsRef.current[id] ?? []
    if (!meta || !answer?.content) return
    try {
      const raw = await completeText({
        ...conn,
        model: settings.titleModel || meta.model,
        system: '',
        messages: [
          {
            role: 'user',
            content:
              `${TITLE_PROMPT}\n\nUsuário: ${question.content.slice(0, TITLE_EXCERPT)}` +
              `\n\nAssistente: ${answer.content.slice(0, TITLE_EXCERPT)}`,
          },
        ],
      })
      const title = raw
        .trim()
        .split('\n')[0]
        .replace(/^["'#*\s]+|["'*.\s]+$/g, '')
        .slice(0, 80)
      if (title) updateChat(id, { title })
    } catch {
      // keep the provisional title
    }
  }

  // Sends the draft, or `request` (from the canvas) leaving the draft alone.
  function send(request?: string): Promise<void> | undefined {
    const typed = request === undefined
    const text = (request ?? draft).trim()
    const files = typed ? attachments : []
    if ((!text && !files.length) || streaming || blocked) return
    if (typed && transcribing.length) return
    if (mediaMode && typed && !text) return
    const researching = typed && research && !mediaMode
    if (researching && !ownSearch(settings) && !provider.webTools) {
      setAttachError(
        t(
          'A pesquisa profunda precisa de busca na web: configure uma Busca própria em Ferramentas, ou use um modelo da Anthropic ou do OpenRouter.',
        ),
      )
      return
    }
    const existing = findMeta(activeId)
    const history = existing ? threadsRef.current[existing.id] : []
    if (!history) return // still loading
    const now = Date.now()
    // "@Name" calls that agent to answer this message.
    const called = mediaMode && typed ? undefined : findMention(text, settings.personas)
    const user: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: now,
      ...(files.length ? { attachments: files } : {}),
      ...(researching ? { research: true } : {}),
      ...(called ? { agentId: called.id } : {}),
    }
    if (researching) setResearch(false)
    const base: ChatMeta = existing ?? {
      id: crypto.randomUUID(),
      title: text.slice(0, TITLE_LENGTH) || files[0]?.name || t('Nova conversa'),
      createdAt: now,
      updatedAt: now,
      providerId: provider.id,
      model: settings.model,
      params: draftParams,
      ...(draftFolder ? { folderId: draftFolder } : {}),
      ...(draftCanvas ? { canvas: draftCanvas } : {}),
      ...(draftTemporary ? { temporary: true } : {}),
    }
    if (typed) {
      setDraft('')
      setAttachments([])
      setAttachError('')
    }
    if (!existing) {
      setDraftParams({})
      setDraftCanvas(undefined)
    }
    if (mediaMode && typed && maker) {
      setMediaMode(null)
      return generate(base, [...history, user], { media: { kind: mediaMode, target: maker } })
    }
    return generate(base, [...history, user])
  }

  // A chain: each prompt is sent once the reply to the one before is done.
  // Steps run in later renders, so they go through the latest send.
  async function runChain(steps: string[]) {
    for (const [i, step] of steps.entries()) {
      const previous = i ? (threadsRef.current[liveRef.current.activeId ?? '']?.at(-1)?.content ?? '') : ''
      const running = liveRef.current.send(i ? withReply(step, previous) : step)
      if (!running) return
      await running
      // Wait for the render that ends the reply, then stop if it was stopped or failed.
      for (let tries = 0; tries < 250 && liveRef.current.streaming; tries++) await new Promise((r) => setTimeout(r, 20))
      const reply = threadsRef.current[liveRef.current.activeId ?? '']?.at(-1)
      if (abortRef.current?.signal.aborted || !reply || reply.role !== 'assistant' || reply.error) return
    }
  }

  function edit(id: string, text: string) {
    const meta = findMeta(activeId)
    const thread = meta && threadsRef.current[meta.id]
    const index = thread?.findIndex((m) => m.id === id) ?? -1
    if (!meta || !thread || index < 0) return
    setVersionsAt(null)
    const edited = { ...thread[index], id: crypto.randomUUID(), content: text, createdAt: Date.now() }
    generate(meta, [...thread.slice(0, index), { ...edited, ...branchAt(thread, index) }])
  }

  function regenerate(id: string, targets?: Target[]) {
    const meta = findMeta(activeId)
    const thread = meta && threadsRef.current[meta.id]
    const index = thread?.findIndex((m) => m.id === id) ?? -1
    if (!meta || !thread || index < 1 || thread[index - 1].role !== 'user') return
    // A reply that failed before writing anything is not kept as a version.
    const replaced = thread[index]
    const branch = branchAt(thread, index, !!replaced.content || !!replaced.attachments?.length)
    setVersionsAt(targets ? index : null)
    if (replaced.imagePrompt !== undefined) {
      const kind = replaced.mediaKind ?? 'image'
      const target = mediaTargets[kind]
      if (!target) return alert(mediaProblem(settings, kind))
      return generate(meta, thread.slice(0, index), { branch, media: { kind, target } })
    }
    generate(meta, thread.slice(0, index), { branch, targets })
  }

  // A new conversation with the current path up to message `id`.
  function forkChat(id: string) {
    const meta = findMeta(activeId)
    const thread = meta && threadsRef.current[meta.id]
    const index = thread?.findIndex((m) => m.id === id) ?? -1
    if (!meta || !thread || index < 0) return
    const now = Date.now()
    const fork: ChatMeta = {
      ...meta,
      id: crypto.randomUUID(),
      title: t('{title} (ramificação)', { title: meta.title }),
      createdAt: now,
      updatedAt: now,
      pinned: false,
    }
    const messages = thread
      .slice(0, index + 1)
      .map(({ alts: _alts, altIndex: _altIndex, ...m }) => ({ ...m, id: crypto.randomUUID() }))
    commitMetas([fork, ...metasRef.current])
    commitThreads({ ...threadsRef.current, [fork.id]: messages })
    storeMeta(fork)
    storeThread(fork.id, messages)
    selectChat(fork.id)
  }

  function togglePin(id: string) {
    if (!activeId || streaming) return
    patchThread(activeId, (thread) =>
      thread.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m)),
    )
    persistThread(activeId)
  }

  function switchTo(id: string, version: number) {
    if (!activeId || streaming) return
    patchThread(activeId, (thread) =>
      switchVersion(
        thread,
        thread.findIndex((m) => m.id === id),
        version,
      ),
    )
    persistThread(activeId)
  }

  function toggleVersions(id: string) {
    const index = messages?.findIndex((m) => m.id === id) ?? -1
    setVersionsAt(versionsAt === index ? null : index)
  }

  function applyPersona(id: string) {
    const persona = settings.personas.find((p) => p.id === id)
    const { system: _system, personaId: _personaId, ...rest } = params
    const next = persona ? { ...rest, system: persona.system, personaId: persona.id } : rest
    if (active) updateChat(active.id, { params: next })
    else setDraftParams(next)
    if (persona?.providerId && persona.model) {
      const { providerId, model } = persona
      setSettings((s) => ({ ...s, providerId, model }))
    }
  }

  // MessageView is memoized, so it gets callbacks whose identity never changes
  // but which always run the latest edit/regenerate.
  const actions = {
    edit,
    regenerate,
    switchTo,
    toggleVersions,
    showArtifact,
    selectChat,
    togglePreview,
    forkChat,
    togglePin,
    openAside,
    activeId,
    locked,
    runAction,
    searchBases,
    syncNow,
  }
  const latest = useRef(actions)
  latest.current = actions
  const openPreview = useCallback(
    (code: string, lang: string) => latest.current.showArtifact(lang.toLowerCase(), code),
    [],
  )

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const combo = comboOf(event)
      if (!combo) return
      const keys = shortcutsOf(settingsRef.current.shortcuts)
      const action = SHORTCUT_ACTIONS.find((a) => keys[a] === combo)
      if (!action) return
      event.preventDefault()
      if (action === 'palette') setShowPalette((open) => !open)
      else if (action === 'preview') latest.current.togglePreview()
      else latest.current.runAction(action)
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  const onEdit = useCallback((id: string, text: string) => latest.current.edit(id, text), [])
  const onRegenerate = useCallback((id: string) => latest.current.regenerate(id), [])
  const onSwitch = useCallback((id: string, v: number) => latest.current.switchTo(id, v), [])
  const onToggleVersions = useCallback((id: string) => latest.current.toggleVersions(id), [])
  const onFork = useCallback((id: string) => latest.current.forkChat(id), [])
  const onTogglePin = useCallback((id: string) => latest.current.togglePin(id), [])
  const onAside = useCallback(
    (id: string, quote: string) => latest.current.openAside(id, quote),
    [],
  )
  const onApprove = useCallback(
    (callId: string, allowed: boolean) => approvals.current.get(callId)?.(allowed),
    [],
  )

  async function attach(files: File[]) {
    setAttachError('')
    for (const file of files) {
      try {
        const attachment = await readAttachment(file)
        setAttachments((list) => [...list, attachment])
        if (attachment.kind === 'audio') void transcribeAttachment(attachment)
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  // The model reads what an attached audio file says: chat APIs take no audio.
  // Without a provider that transcribes, the file still goes along (the motion
  // preview can use it as a soundtrack) and the model is told it cannot hear it.
  async function transcribeAttachment(attachment: Attachment) {
    const providerId = fileTranscriber(settings, locked)
    if (!providerId) return
    setTranscribing((list) => [...list, attachment.id])
    try {
      const text = await transcribe(
        connection(settings, providerId),
        trackBlob(attachment),
        '',
        trackFileName(attachment),
      )
      setAttachments((list) => list.map((a) => (a.id === attachment.id ? { ...a, transcript: text } : a)))
    } catch (err) {
      setAttachError(
        t('Não foi possível transcrever "{name}": {error}', {
          name: attachment.name,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      setTranscribing((list) => list.filter((id) => id !== attachment.id))
    }
  }

  async function removeChats(chats: ChatMeta[]) {
    if (!chats.length) return
    const question =
      chats.length === 1
        ? t('Excluir a conversa "{title}"?', { title: chats[0].title })
        : t('Excluir {count} conversas?', { count: chats.length })
    if (!confirm(question)) return
    const ids = new Set(chats.map((c) => c.id))
    if (activeId && ids.has(activeId)) {
      abortRef.current?.abort()
      setActiveId(null)
    }
    commitMetas(metasRef.current.filter((c) => !ids.has(c.id)))
    const rest = { ...threadsRef.current }
    for (const id of ids) {
      tombstone(id)
      delete rest[id]
    }
    commitThreads(rest)
    await Promise.all([...ids].map(deleteChat))
  }

  function removeFolder(folder: Folder) {
    const question = t('Excluir a pasta "{name}"? As conversas dela são mantidas.', {
      name: folder.name,
    })
    if (!confirm(question)) return
    for (const chat of metasRef.current.filter((c) => c.folderId === folder.id)) {
      updateChat(chat.id, { folderId: undefined })
    }
    setSettings((s) => ({ ...s, folders: s.folders.filter((f) => f.id !== folder.id) }))
  }

  async function exportChat(chat: ChatMeta) {
    const thread = threadsRef.current[chat.id] ?? (await loadThread(chat.id))
    download(
      fileName(chat.title, 'md'),
      chatToMarkdown({ ...chat, messages: thread }),
      'text/markdown',
    )
  }

  async function eraseEverything() {
    if (!confirm(t('Apagar todas as conversas, chaves de API e configurações deste navegador?'))) return
    abortRef.current?.abort()
    settings.mcpServers.forEach((server) => forget(server.id))
    // Written settings would bring the deleted ones back before the reload.
    adopted.current = settings
    await deleteEverything()
    location.reload()
  }

  async function exportChatHtml(chat: ChatMeta) {
    const thread = threadsRef.current[chat.id] ?? (await loadThread(chat.id))
    const { chatToHtml } = await import('./exportHtml')
    download(fileName(chat.title, 'html'), await chatToHtml({ ...chat, messages: thread }), 'text/html')
  }

  async function exportBackup() {
    const date = new Date().toISOString().slice(0, 10)
    download(
      `tsrs-backup-${date}.json`,
      buildBackup({
        chats: await loadChats(),
        folders: settings.folders,
        personas: settings.personas,
        prompts: settings.prompts,
        memories: settings.memories,
        knowledgeBases: settings.knowledgeBases,
        docs: docsRef.current,
      }),
      'application/json',
    )
  }

  async function importBackup(file: File): Promise<string> {
    return importBackupData(parseBackup(await file.text()))
  }

  async function importBackupData(backup: Backup): Promise<string> {
    const { chats: incoming, docs: incomingDocs, settings: _settings, ...library } = backup
    const newDocs = incomingDocs.filter((d) => !docsRef.current.some((x) => x.id === d.id))
    await Promise.all(newDocs.map(saveDoc))
    commitDocs([...docsRef.current, ...newDocs])
    const current = new Map(metasRef.current.map((c) => [c.id, c]))
    // On conflict the most recently updated copy wins.
    const fresh = incoming.filter((c) => {
      const existing = current.get(c.id)
      return !existing || c.updatedAt > existing.updatedAt
    })
    await saveChats(fresh)
    const nextThreads = { ...threadsRef.current }
    for (const { messages: thread, ...meta } of fresh) {
      current.set(meta.id, meta)
      // Only refresh conversations already open; the rest load on demand.
      if (nextThreads[meta.id]) nextThreads[meta.id] = thread
    }
    commitMetas([...current.values()])
    commitThreads(nextThreads)
    // Items already in the library are kept as they are.
    const merge = <T extends { id: string }>(mine: T[], theirs: T[]) => [
      ...mine,
      ...theirs.filter((item) => !mine.some((x) => x.id === item.id)),
    ]
    setSettings((s) => ({
      ...s,
      folders: merge(s.folders, library.folders),
      personas: merge(s.personas, library.personas),
      prompts: merge(s.prompts, library.prompts),
      memories: merge(s.memories, library.memories),
      knowledgeBases: merge(s.knowledgeBases, library.knowledgeBases),
    }))
    return t('{imported} de {total} conversas importadas.', {
      imported: fresh.length,
      total: incoming.length,
    })
  }

  const last = messages?.at(-1)
  const pinnedMessages = messages?.filter((m) => m.pinned) ?? []
  const personaId = settings.personas.some((p) => p.id === params.personaId)
    ? (params.personaId ?? '')
    : ''
  const tools = toolsFor(settings, persona)
  const activeTools =
    (tools.webSearch && provider.webTools ? 1 : 0) +
    (tools.webFetch && provider.webTools === 'anthropic' ? 1 : 0) +
    settings.mcpServers.filter((s) => s.url && tools.mcpServers.includes(s.id)).length +
    (settings.memory && !temporary ? 1 : 0) +
    basesFor(settings, params, persona).length
  const starters = persona?.starters?.filter((s) => s.trim()).length
    ? persona.starters.filter((s) => s.trim())
    : [
        t('Explique um conceito difícil em termos simples'),
        t('Revise e melhore um texto meu'),
        t('Crie uma página HTML simples para eu ver no preview'),
        t('Compare os prós e os contras de duas opções'),
      ]

  const sidebar = (
    <Sidebar
      chats={listed}
      folders={settings.folders}
      activeId={showUsage ? null : activeId}
      theme={settings.appearance.theme}
      onSelect={selectChat}
      onUpdateChat={updateChat}
      onDeleteChats={removeChats}
      onExportChat={exportChat}
      onExportHtml={exportChatHtml}
      onSearch={searchThreads}
      onFoldersChange={(folders) => setSettings((s) => ({ ...s, folders }))}
      onDeleteFolder={removeFolder}
      onEditFolder={setEditingFolder}
      onNewInFolder={(folder) => {
        void selectChat(null)
        setDraftFolder(folder.id)
        const persona = settings.personas.find((p) => p.id === folder.personaId)
        setDraftParams(persona ? { system: persona.system, personaId: persona.id } : {})
        if (persona?.providerId && persona.model) {
          const { providerId, model } = persona
          setSettings((s) => ({ ...s, providerId, model }))
        }
      }}
      onOpen={(what) => {
        setShowDrawer(false)
        if (what === 'library') setShowLibrary(true)
        else if (what === 'tools') setShowTools(true)
        else if (what === 'extensions') setShowExtensions(true)
        else if (what === 'usage') setShowUsage(true)
        else setShowSettings(true)
      }}
      onToggleTheme={toggleTheme}
    />
  )

  const chat = showUsage ? (
    <Suspense fallback={null}>
      <UsageView
        load={loadChats}
        price={(id, model) => modelInfo(settings, id, model)}
        onBack={() => setShowUsage(false)}
        showMenu={isMobile}
        onMenu={() => setShowDrawer(true)}
      />
    </Suspense>
  ) : (
    <main
      className="main flex h-full min-w-0 flex-col bg-background"
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        attach([...e.dataTransfer.files])
      }}
    >
      <ChatTopBar
        settings={settings}
        provider={provider}
        personaId={personaId}
        spent={spent}
        context={context}
        activeTools={activeTools}
        paramsOpen={showParams}
        previewOpen={showPreview}
        canvasOpen={showCanvas && !!canvas}
        onToggleCanvas={toggleCanvas}
        showMenu={isMobile}
        onMenu={() => setShowDrawer(true)}
        onModel={selectModel}
        onPersona={applyPersona}
        project={settings.projects !== false ? active?.project : undefined}
        onOpenUrl={(url, name) => showArtifact('url', url, name)}
        onMoveProject={(path) => (active ? moveProject(active.id, path) : Promise.resolve())}
        onPrice={(providerId, model, price) =>
          setSettings((s) => {
            const prices = { ...s.modelPrices }
            if (price) prices[`${providerId}/${model}`] = price
            else delete prices[`${providerId}/${model}`]
            return { ...s, modelPrices: prices }
          })
        }
        onTools={() => setShowTools(true)}
        onParams={() => setShowParams(true)}
        onTogglePreview={togglePreview}
        temporary={temporary}
        onToggleTemporary={active ? undefined : () => setDraftTemporary((on) => !on)}
        onClearContext={messages?.length && !messages.at(-1)?.contextReset && !streaming ? clearContext : undefined}
      />
      {!active && draftFolder && (
        <p
          role="status"
          className="folder-note flex items-center justify-center gap-1.5 border-b bg-surface-2 px-4 py-1.5 text-center text-xs text-muted-foreground"
        >
          {t('Nova conversa na pasta “{name}”, com o contexto dela.', {
            name: settings.folders.find((f) => f.id === draftFolder)?.name ?? '',
          })}
        </p>
      )}
      {temporary && (
        <p
          role="status"
          className="temporary-note flex items-center justify-center gap-1.5 border-b bg-surface-2 px-4 py-1.5 text-center text-xs text-muted-foreground"
        >
          <MessageSquareDashed className="size-3.5 shrink-0" />
          {t('Conversa temporária: não fica no histórico, não é sincronizada nem usa a memória. Some quando você sair dela.')}
        </p>
      )}

      <section className="messages min-h-0 flex-1 overflow-y-auto">
        {!active && (
          <div className="flex min-h-full flex-col items-center justify-center px-6 py-8 text-center">
            <div className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {t('TSRS · pronto')}
            </div>
            <h1 className="text-xl font-semibold">
              {persona ? persona.name || t('Sem nome') : t('No que vamos trabalhar?')}
            </h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {t(
                'Suas conversas e chaves ficam só neste navegador. As mensagens vão direto para o provedor escolhido.',
              )}
            </p>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {starters.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-md border bg-card px-3 py-2.5 text-left text-sm hover:border-primary/60 hover:bg-accent"
                  onClick={() => setDraft(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {active && pinnedMessages.length > 0 && (
          <nav
            aria-label={t('Mensagens fixadas')}
            className="pinned sticky top-0 z-10 border-b bg-background/95 px-4 py-1.5 backdrop-blur"
          >
            <div className="mx-auto flex max-w-3xl items-center gap-1.5 overflow-x-auto text-xs">
              <Pin className="size-3.5 shrink-0 text-primary" aria-hidden />
              {pinnedMessages.map((m) => (
                <button
                  key={m.id}
                  className="max-w-56 shrink-0 truncate rounded border bg-card px-2 py-0.5 hover:bg-accent"
                  onClick={() =>
                    document
                      .getElementById(`message-${m.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  {(m.content || m.attachments?.[0]?.name || '').slice(0, 80)}
                </button>
              ))}
            </div>
          </nav>
        )}
        {active && (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
            {!messages && <p className="text-sm text-muted-foreground">{t('Carregando…')}</p>}
            <PreviewContext.Provider value={openPreview}>
              {messages?.map((m, index) =>
                m.contextReset ? (
                  <ContextReset key={m.id} busy={streaming} onUndo={() => undoClearContext(m.id)} />
                ) : (
                <MessageView
                  key={m.id}
                  message={m}
                  busy={streaming}
                  streaming={streaming && m === last}
                  lang={settings.language}
                  versions={
                    index === versionsAt && m.alts?.length
                      ? versions(messages, index).map((v) => (v[0].id === m.id ? m : v[0]))
                      : undefined
                  }
                  onEdit={onEdit}
                  onRegenerate={onRegenerate}
                  onSwitch={onSwitch}
                  onCompare={setCompareId}
                  onApprove={onApprove}
                  onToggleVersions={onToggleVersions}
                  onFork={onFork}
                  onTogglePin={onTogglePin}
                  onAside={onAside}
                />
                ),
              )}
            </PreviewContext.Provider>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => send()}
        onStop={() => abortRef.current?.abort()}
        streaming={streaming}
        blocked={!!blocked}
        dragging={dragging}
        attachments={attachments}
        transcribing={transcribing}
        onAttach={attach}
        onRemoveAttachment={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
        prompts={[...settings.prompts, ...commandPrompts(enabledPlugins(plugins, settings))]}
        onRunChain={runChain}
        agents={settings.personas}
        onInsertPrompt={(text) => setDraft((d) => (d.trim() ? `${d}\n${text}` : text))}
        onManagePrompts={() => setShowLibrary(true)}
        dictation={dictation}
        mediaMode={mediaMode}
        mediaKinds={MEDIA_KINDS.filter((kind) => mediaTargets[kind] || mediaMode === kind)}
        onMediaMode={(kind) => {
          setMediaMode(kind)
          if (kind) setResearch(false)
        }}
        research={research}
        onResearch={(on) => {
          setResearch(on)
          if (on) setMediaMode(null)
        }}
      >
        {blocked && (
          <p className="notice rounded-md border border-warning/50 px-3 py-2 text-xs text-warning">
            {blocked.text}{' '}
            <button
              className="underline underline-offset-2"
              onClick={() =>
                blocked.fix === 'unlock' ? setShowUnlock(true) : setShowSettings(true)
              }
            >
              {blocked.fix === 'unlock' ? t('Desbloquear') : t('Abrir configurações')}
            </button>
          </p>
        )}
        {context !== undefined && context >= CONTEXT_WARNING && (
          <p className="notice rounded-md border border-warning/50 px-3 py-2 text-xs text-warning">
            {t(
              'Esta conversa já ocupa {percent}% do contexto do modelo. Resuma a conversa para continuar com menos tokens, ou comece uma nova.',
              { percent: Math.round(context * 100) },
            )}{' '}
            <button
              className="underline underline-offset-2 disabled:opacity-50"
              disabled={streaming}
              onClick={summarize}
            >
              {t('Resumir a conversa')}
            </button>{' '}
            <button
              className="underline underline-offset-2 disabled:opacity-50"
              disabled={streaming}
              onClick={clearContext}
            >
              {t('Limpar o contexto')}
            </button>
          </p>
        )}
        {mediaMode && maker && price && (
          <p className="media-price rounded-md border px-3 py-2 text-xs text-muted-foreground">
            {price === 'unknown'
              ? t('{name} só informa o custo depois de gerar.', { name: sourceName(maker.source) })
              : t('Custo estimado: {estimate}. Fonte: {source}.', {
                  estimate: price.text,
                  source: price.source,
                })}
            {price !== 'unknown' && price.perCharacter && draft.trim() && (
              <>
                {' '}
                {t('Esta mensagem: {count} caracteres, cerca de {total}.', {
                  count: draft.trim().length,
                  total: formatCost(draft.trim().length * price.perCharacter),
                })}
              </>
            )}
          </p>
        )}
        {[...toolProblems, ...[attachError, dictation.error].filter(Boolean)].map((problem) => (
          <p
            key={problem}
            role="alert"
            className="error rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive"
          >
            {problem}
          </p>
        ))}
      </Composer>
    </main>
  )

  // The panel beside the chat: the canvas or the preview, one at a time.
  const sideOpen = (showCanvas && !!canvas) || showPreview
  const side = (
    // Only this panel waits while its code loads, not the whole layout.
    <Suspense fallback={null}>
      {showCanvas && canvas ? (
        <CanvasPanel
          canvas={canvas}
          busy={streaming}
          blocked={blocker(settings, locked)?.text}
          onChange={(next) => setCanvas(next)}
          onUndo={() => setCanvas(undo(canvas), { now: true })}
          onAsk={askCanvas}
          onPreview={(lang, code) => showArtifact(lang, code)}
          onDiscard={discardCanvas}
          onClose={() => setShowCanvas(false)}
        />
      ) : (
        <PreviewPanel
          artifacts={artifacts}
          activeId={artifactId}
          onActivate={setArtifactId}
          onCloseTab={closeArtifact}
          onOpenUrl={(url) => showArtifact('url', url, new URL(url).host)}
          onClose={() => setShowPreview(false)}
          tracks={tracks}
          project={settings.projects !== false ? active?.project?.path : undefined}
        />
      )}
    </Suspense>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app h-dvh w-full overflow-hidden">
        {isMobile ? (
          <>
            <Sheet open={showDrawer} onOpenChange={setShowDrawer}>
              <SheetContent side="left" className="w-[85vw] max-w-80 p-0 [&>button]:hidden">
                <SheetTitle className="sr-only">{t('Conversas')}</SheetTitle>
                <SheetDescription className="sr-only">TSRS</SheetDescription>
                {sidebar}
              </SheetContent>
            </Sheet>
            {chat}
            {sideOpen && <div className="fixed inset-0 z-40">{side}</div>}
          </>
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel id="sidebar" defaultSize="20%" minSize="14%" maxSize="32%">
              {sidebar}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="chat" minSize="30%">
              {chat}
            </ResizablePanel>
            {sideOpen && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel id="preview" defaultSize="40%" minSize="25%">
                  {side}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        )}
      </div>

      <Suspense fallback={null}>
      {showParams && (
        <ParamsPanel
          provider={provider}
          bases={settings.knowledgeBases}
          params={params}
          onChange={(next) =>
            active ? updateChat(active.id, { params: next }) : setDraftParams(next)
          }
          onClose={() => setShowParams(false)}
        />
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          locked={locked}
          onChange={setSettings}
          onEnableVault={enableVault}
          onDisableVault={disableVault}
          onLock={lock}
          onUnlock={() => setShowUnlock(true)}
          onResetVault={resetVault}
          onExport={exportBackup}
          onImport={importBackup}
          autoBackup={{ ...backup, onRestore: restoreAutoBackup }}
          onDeleteEverything={eraseEverything}
          sync={{
            supported: canPickFolder(),
            connected: syncKind,
            status: syncStatus,
            onConnect: connectSync,
            onConnectRemote: connectRemote,
            onDisconnect: disconnectSync,
            onSyncNow: () => syncNow(true),
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showLibrary && (
        <LibraryDialog
          settings={settings}
          onChange={setSettings}
          docs={docs}
          onAddDocs={addDocs}
          onDeleteDoc={removeDoc}
          onDeleteBase={removeBase}
          embedder={embedSource(settings, locked)}
          onIndex={() => indexDocs()}
          onSearch={searchTest}
          onClose={() => setShowLibrary(false)}
        />
      )}
      {editingFolder && (
        <FolderDialog
          folder={editingFolder}
          personas={settings.personas}
          onSave={(folder) =>
            setSettings((s) => ({ ...s, folders: s.folders.map((f) => (f.id === folder.id ? folder : f)) }))
          }
          onClose={() => setEditingFolder(null)}
        />
      )}
      {showExtensions && (
        <ExtensionsDialog
          settings={settings}
          onChange={setSettings}
          onChanged={reloadPlugins}
          onClose={() => setShowExtensions(false)}
          agenda={
            <AgendaTab
              settings={settings}
              providerId={provider.id}
              model={settings.model}
              locked={locked}
              onRan={() => void importAgenda()}
            />
          }
        />
      )}
      {showTools && (
        <ToolsDialog
          settings={settings}
          provider={provider}
          locked={locked}
          onChange={setSettings}
          onClose={() => setShowTools(false)}
        />
      )}
      {compareId && (
        <CompareDialog
          settings={settings}
          onCompare={(targets) => {
            regenerate(compareId, targets)
            setCompareId(null)
          }}
          onClose={() => setCompareId(null)}
        />
      )}
      {showPalette && (
        <CommandPalette
          chats={listed}
          settings={settings}
          canLock={!!settings.vault && !locked}
          canClear={!!messages?.length && !messages.at(-1)?.contextReset && !streaming}
          onChat={selectChat}
          onModel={selectModel}
          onAction={runAction}
          onClose={() => setShowPalette(false)}
        />
      )}
      {aside && (
        <SideChat
          quote={aside.quote}
          messages={aside.messages}
          busy={asideBusy}
          blocked={blocker(settings, locked)?.text}
          onSend={askAside}
          onStop={() => asideAbort.current?.abort()}
          onClose={closeAside}
        />
      )}
      {backupOffer && (
        <BackupOffer
          meta={backupOffer}
          onRestore={restoreAutoBackup}
          onDismiss={() => {
            setBackupOffer(null)
            setBackupOn(true)
          }}
        />
      )}
      {showUnlock && locked && (
        <UnlockDialog onUnlock={unlock} onClose={() => setShowUnlock(false)} />
      )}
      </Suspense>
    </TooltipProvider>
  )
}
