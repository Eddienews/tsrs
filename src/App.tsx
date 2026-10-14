import { useCallback, useEffect, useRef, useState } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsMobile } from '@/lib/use-mobile'
import { applyAppearance } from './appearance'
import { branchAt, switchVersion, versions, type Branch } from './branches'
import ChatTopBar from './ChatTopBar'
import CommandPalette, { type PaletteAction } from './CommandPalette'
import CompareDialog from './CompareDialog'
import Composer from './Composer'
import { deriveKey, newSalt, seal, unseal } from './crypto'
import {
  buildBackup,
  chatToMarkdown,
  download,
  fileName,
  parseBackup,
  readAttachment,
} from './files'
import { setLanguage, t } from './i18n'
import LibraryDialog from './LibraryDialog'
import { PreviewContext } from './Markdown'
import MessageView from './MessageView'
import ParamsPanel from './ParamsPanel'
import { forget } from './mcp'
import { artifactName, lastPreviewable, withPreviewHint, type Artifact } from './preview'
import PreviewPanel from './PreviewPanel'
import { getProvider } from './providers'
import SettingsDialog from './SettingsDialog'
import Sidebar from './Sidebar'
import {
  SETTINGS_KEY,
  deleteChat,
  loadChats,
  loadMetas,
  loadSettings,
  loadThread,
  saveChats,
  saveMeta,
  saveSettings,
  saveThread,
  searchThreads,
} from './storage'
import { completeText, streamChat, type Connection, type RequestMessage } from './stream'
import { gatherTools } from './tools'
import ToolsDialog from './ToolsDialog'
import type {
  Attachment,
  ChatMeta,
  ChatParams,
  Folder,
  Message,
  Settings,
  ToolPart,
} from './types'
import UnlockDialog from './UnlockDialog'
import {
  CONTEXT_WARNING,
  contextUse,
  costOf,
  modelInfo,
  totals,
} from './usage'

const TITLE_LENGTH = 60
const TITLE_EXCERPT = 1000
const TITLE_PROMPT =
  'Crie um título curto (no máximo 6 palavras) para a conversa abaixo, no mesmo idioma dela. ' +
  'Responda apenas com o título, sem aspas nem pontuação final.'

// A provider and model other than the ones selected in the toolbar.
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

// Empty replies (aborted or failed) are dropped: providers reject empty turns.
function toRequest(messages: Message[]): RequestMessage[] {
  return messages
    .filter((m) => m.content || m.attachments?.length)
    .map(({ role, content, attachments, parts }) => ({ role, content, attachments, parts }))
}

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

// Secrets kept in the vault: provider keys by provider id, MCP tokens by
// server id under a prefix.
const MCP_SECRET = 'mcp:'

function withoutKeys(settings: Settings): Settings {
  return {
    ...settings,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([id, p]) => [id, { ...p, apiKey: '' }]),
    ),
    mcpServers: settings.mcpServers.map((server) => ({ ...server, token: '' })),
  }
}

function keysOf(settings: Settings): Record<string, string> {
  return Object.fromEntries([
    ...Object.entries(settings.providers)
      .filter(([, p]) => p.apiKey)
      .map(([id, p]) => [id, p.apiKey]),
    ...settings.mcpServers.filter((s) => s.token).map((s) => [MCP_SECRET + s.id, s.token]),
  ])
}

function withKeys(settings: Settings, keys: Record<string, string>): Settings {
  return {
    ...settings,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([id, p]) => [id, { ...p, apiKey: keys[id] ?? '' }]),
    ),
    mcpServers: settings.mcpServers.map((server) => ({
      ...server,
      token: keys[MCP_SECRET + server.id] ?? '',
    })),
  }
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
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
  // Parameters for the conversation that has not been created yet.
  const [draftParams, setDraftParams] = useState<ChatParams>({})
  const [showSettings, setShowSettings] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  // The conversation list, when it is a drawer on a narrow screen.
  const [showDrawer, setShowDrawer] = useState(false)
  const [dragging, setDragging] = useState(false)
  const isMobile = useIsMobile()
  // What is open in the preview panel; kept only for the session.
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [artifactId, setArtifactId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const artifactCount = useRef(0)
  // MCP servers that could not be reached for the last reply.
  const [toolProblems, setToolProblems] = useState<string[]>([])
  // Tool calls waiting for the user to allow or deny them, by call id.
  const approvals = useRef(new Map<string, (allowed: boolean) => void>())
  // Position in the conversation of the reply whose versions are shown side
  // by side, and id of the reply waiting for a model to be compared with.
  const [versionsAt, setVersionsAt] = useState<number | null>(null)
  const [compareId, setCompareId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const provider = getProvider(settings.providerId)
  const active = metas.find((c) => c.id === activeId) ?? null
  // Undefined while the active conversation's messages are being read.
  const messages = activeId ? threads[activeId] : undefined
  const params = active ? (active.params ?? {}) : draftParams
  const blocked = blocker(settings, locked)
  const info = modelInfo(settings, provider.id, settings.model)
  const spent = totals(messages ?? [])
  const context = contextUse(messages ?? [], info)

  function commitMetas(next: ChatMeta[]) {
    metasRef.current = next
    setMetas(next)
  }

  function commitThreads(next: Record<string, Message[]>) {
    threadsRef.current = next
    setThreads(next)
  }

  function findMeta(id: string | null): ChatMeta | undefined {
    return metasRef.current.find((c) => c.id === id)
  }

  function updateChat(id: string, fields: Partial<ChatMeta>) {
    commitMetas(metasRef.current.map((c) => (c.id === id ? { ...c, ...fields } : c)))
    const meta = findMeta(id)
    if (meta) saveMeta(meta)
  }

  function patchThread(id: string, patch: (messages: Message[]) => Message[]) {
    const thread = threadsRef.current[id]
    if (thread) commitThreads({ ...threadsRef.current, [id]: patch(thread) })
  }

  function persistThread(id: string) {
    const thread = threadsRef.current[id]
    // A conversation deleted mid-stream must not be written back.
    if (thread && findMeta(id)) saveThread(id, thread)
  }

  useEffect(() => {
    loadMetas().then(commitMetas)
  }, [])

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
    setShowPreview(true)
  }

  // Opening an empty panel shows the conversation's latest previewable block.
  function togglePreview() {
    if (showPreview) return setShowPreview(false)
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
    else if (action === 'preview') togglePreview()
    else if (action === 'tools') setShowTools(true)
    else if (action === 'library') setShowLibrary(true)
    else if (action === 'settings') setShowSettings(true)
    else if (action === 'theme') toggleTheme()
    else lock()
  }

  async function selectChat(id: string | null) {
    setShowDrawer(false)
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
  // `branch` links the reply to the versions it replaces; `target` writes it
  // with another model without changing the one the conversation uses.
  async function generate(
    base: ChatMeta,
    history: Message[],
    { branch, target }: { branch?: Branch; target?: Target } = {},
  ) {
    const using: Target = target ?? { providerId: settings.providerId, model: settings.model }
    const problem = blocker({ ...settings, ...using }, locked)
    if (problem && target) alert(problem.text)
    if (streaming || problem) return
    const via = getProvider(using.providerId)
    const info = modelInfo(settings, via.id, using.model)
    const reply: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      ...using,
      ...branch,
    }
    const meta: ChatMeta = { ...base, updatedAt: Date.now(), ...(target ? {} : using) }
    commitMetas([meta, ...metasRef.current.filter((c) => c.id !== meta.id)])
    commitThreads({ ...threadsRef.current, [meta.id]: [...history, reply] })
    saveMeta(meta)
    setActiveId(meta.id)
    setStreaming(true)
    const abort = new AbortController()
    abortRef.current = abort
    // Stopping the reply also answers any pending permission request.
    abort.signal.addEventListener('abort', () => approvals.current.forEach((answer) => answer(false)))
    setToolProblems([])

    const patchReply = (patch: (m: Message) => Message) =>
      patchThread(meta.id, (thread) => thread.map((m) => (m.id === reply.id ? patch(m) : m)))
    const { baseUrl, apiKey } = settings.providers[via.id]
    const conn: Connection = { provider: via, baseUrl, apiKey }
    let completed = false

    const patchTool = (id: string, fields: Partial<ToolPart>) =>
      patchReply((m) => ({
        ...m,
        parts: m.parts?.map((p) => (p.type === 'tool' && p.id === id ? { ...p, ...fields } : p)),
      }))

    try {
      const servers = settings.mcpServers.filter((s) => s.enabled && s.url)
      const toolset = servers.length ? await gatherTools(servers) : null
      if (toolset?.problems.length) setToolProblems(toolset.problems)
      const system = meta.params?.system?.trim() || settings.systemPrompt
      const stream = streamChat({
        ...conn,
        model: using.model,
        system: settings.previewHint ? withPreviewHint(system, t('Abrir preview')) : system,
        messages: toRequest(history),
        // An effort level chosen for another provider may not exist in this one.
        params: {
          ...meta.params,
          effort: via.efforts.includes(meta.params?.effort ?? '') ? meta.params?.effort : undefined,
        },
        signal: abort.signal,
        tools: toolset?.defs,
        webSearch: settings.webSearch && !!via.webTools,
        webFetch: settings.webFetch && via.webTools === 'anthropic',
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
          return toolset.run(call, abort.signal)
        },
      })
      for await (const event of stream) {
        if (event.type === 'text') {
          patchReply((m) => withText(m, event.text))
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
      completed = true
    } catch (err) {
      if (!abort.signal.aborted) {
        const error = err instanceof Error ? err.message : String(err)
        patchReply((m) => ({ ...m, error }))
      }
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
      setStreaming(false)
      persistThread(meta.id)
    }

    if (completed && settings.autoTitle && history.length === 1) {
      titleChat(meta.id, conn)
    }
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

  function send() {
    const text = draft.trim()
    if ((!text && !attachments.length) || streaming || blocked) return
    const existing = findMeta(activeId)
    const history = existing ? threadsRef.current[existing.id] : []
    if (!history) return // still loading
    const now = Date.now()
    const user: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      ...(attachments.length ? { attachments } : {}),
    }
    const base: ChatMeta = existing ?? {
      id: crypto.randomUUID(),
      title: text.slice(0, TITLE_LENGTH) || attachments[0]?.name || t('Nova conversa'),
      createdAt: now,
      updatedAt: now,
      providerId: provider.id,
      model: settings.model,
      params: draftParams,
    }
    setDraft('')
    setAttachments([])
    setAttachError('')
    if (!existing) setDraftParams({})
    generate(base, [...history, user])
  }

  function edit(id: string, text: string) {
    const meta = findMeta(activeId)
    const thread = meta && threadsRef.current[meta.id]
    const index = thread?.findIndex((m) => m.id === id) ?? -1
    if (!meta || !thread || index < 0) return
    setVersionsAt(null)
    const edited = { ...thread[index], id: crypto.randomUUID(), content: text }
    generate(meta, [...thread.slice(0, index), { ...edited, ...branchAt(thread, index) }])
  }

  function regenerate(id: string, target?: Target) {
    const meta = findMeta(activeId)
    const thread = meta && threadsRef.current[meta.id]
    const index = thread?.findIndex((m) => m.id === id) ?? -1
    if (!meta || !thread || index < 1 || thread[index - 1].role !== 'user') return
    // A reply that failed before writing anything is not kept as a version.
    const branch = branchAt(thread, index, !!thread[index].content)
    setVersionsAt(target ? index : null)
    generate(meta, thread.slice(0, index), { branch, target })
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
  const actions = { edit, regenerate, switchTo, toggleVersions, showArtifact, selectChat, togglePreview }
  const latest = useRef(actions)
  latest.current = actions
  const openPreview = useCallback(
    (code: string, lang: string) => latest.current.showArtifact(lang.toLowerCase(), code),
    [],
  )

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        setShowPalette((open) => !open)
      } else if ((event.metaKey || event.ctrlKey) && key === '.') {
        event.preventDefault()
        latest.current.togglePreview()
      } else if (event.altKey && key === 'n') {
        event.preventDefault()
        latest.current.selectChat(null)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  const onEdit = useCallback((id: string, text: string) => latest.current.edit(id, text), [])
  const onRegenerate = useCallback((id: string) => latest.current.regenerate(id), [])
  const onSwitch = useCallback((id: string, v: number) => latest.current.switchTo(id, v), [])
  const onToggleVersions = useCallback((id: string) => latest.current.toggleVersions(id), [])
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
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  async function removeChat(chat: ChatMeta) {
    if (!confirm(t('Excluir a conversa "{title}"?', { title: chat.title }))) return
    if (chat.id === activeId) {
      abortRef.current?.abort()
      setActiveId(null)
    }
    commitMetas(metasRef.current.filter((c) => c.id !== chat.id))
    const { [chat.id]: _removed, ...rest } = threadsRef.current
    commitThreads(rest)
    await deleteChat(chat.id)
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

  async function exportBackup() {
    const date = new Date().toISOString().slice(0, 10)
    download(
      `tsrs-backup-${date}.json`,
      buildBackup(await loadChats(), {
        folders: settings.folders,
        personas: settings.personas,
        prompts: settings.prompts,
      }),
      'application/json',
    )
  }

  async function importBackup(file: File): Promise<string> {
    const { chats: incoming, ...library } = parseBackup(await file.text())
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
    }))
    return t('{imported} de {total} conversas importadas.', {
      imported: fresh.length,
      total: incoming.length,
    })
  }

  const last = messages?.at(-1)
  const personaId = settings.personas.some((p) => p.id === params.personaId)
    ? (params.personaId ?? '')
    : ''
  const activeTools =
    (settings.webSearch && provider.webTools ? 1 : 0) +
    (settings.webFetch && provider.webTools === 'anthropic' ? 1 : 0) +
    settings.mcpServers.filter((s) => s.enabled && s.url).length

  const sidebar = (
    <Sidebar
      chats={metas}
      folders={settings.folders}
      activeId={activeId}
      theme={settings.appearance.theme}
      onSelect={selectChat}
      onUpdateChat={updateChat}
      onDeleteChat={removeChat}
      onExportChat={exportChat}
      onSearch={searchThreads}
      onFoldersChange={(folders) => setSettings((s) => ({ ...s, folders }))}
      onDeleteFolder={removeFolder}
      onOpen={(what) => {
        setShowDrawer(false)
        if (what === 'library') setShowLibrary(true)
        else if (what === 'tools') setShowTools(true)
        else setShowSettings(true)
      }}
      onToggleTheme={toggleTheme}
    />
  )

  const chat = (
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
        showMenu={isMobile}
        onMenu={() => setShowDrawer(true)}
        onModel={selectModel}
        onPersona={applyPersona}
        onTools={() => setShowTools(true)}
        onParams={() => setShowParams(true)}
        onTogglePreview={togglePreview}
      />

      <section className="messages min-h-0 flex-1 overflow-y-auto">
        {!active && (
          <div className="flex min-h-full flex-col items-center justify-center px-6 py-8 text-center">
            <div className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {t('TSRS · pronto')}
            </div>
            <h1 className="text-xl font-semibold">{t('No que vamos trabalhar?')}</h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {t(
                'Suas conversas e chaves ficam só neste navegador. As mensagens vão direto para o provedor escolhido.',
              )}
            </p>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {[
                t('Explique um conceito difícil em termos simples'),
                t('Revise e melhore um texto meu'),
                t('Crie uma página HTML simples para eu ver no preview'),
                t('Compare os prós e os contras de duas opções'),
              ].map((suggestion) => (
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
        {active && (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
            {!messages && <p className="text-sm text-muted-foreground">{t('Carregando…')}</p>}
            <PreviewContext.Provider value={openPreview}>
              {messages?.map((m, index) => (
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
                />
              ))}
            </PreviewContext.Provider>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        onStop={() => abortRef.current?.abort()}
        streaming={streaming}
        blocked={!!blocked}
        dragging={dragging}
        attachments={attachments}
        onAttach={attach}
        onRemoveAttachment={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
        prompts={settings.prompts}
        onInsertPrompt={(text) => setDraft((d) => (d.trim() ? `${d}\n${text}` : text))}
        onManagePrompts={() => setShowLibrary(true)}
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
              'Esta conversa já ocupa {percent}% do contexto do modelo. Comece uma nova conversa para evitar erros e reduzir o custo.',
              { percent: Math.round(context * 100) },
            )}
          </p>
        )}
        {[...toolProblems, ...(attachError ? [attachError] : [])].map((problem) => (
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

  const preview = (
    <PreviewPanel
      artifacts={artifacts}
      activeId={artifactId}
      onActivate={setArtifactId}
      onCloseTab={closeArtifact}
      onOpenUrl={(url) => showArtifact('url', url, new URL(url).host)}
      onClose={() => setShowPreview(false)}
    />
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
            {showPreview && <div className="fixed inset-0 z-40">{preview}</div>}
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
            {showPreview && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel id="preview" defaultSize="40%" minSize="25%">
                  {preview}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        )}
      </div>

      {showParams && (
        <ParamsPanel
          provider={provider}
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
          onClose={() => setShowSettings(false)}
        />
      )}
      {showLibrary && (
        <LibraryDialog
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowLibrary(false)}
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
          onCompare={(target) => {
            regenerate(compareId, target)
            setCompareId(null)
          }}
          onClose={() => setCompareId(null)}
        />
      )}
      {showPalette && (
        <CommandPalette
          chats={metas}
          settings={settings}
          canLock={!!settings.vault && !locked}
          onChat={selectChat}
          onModel={selectModel}
          onAction={runAction}
          onClose={() => setShowPalette(false)}
        />
      )}
      {showUnlock && locked && (
        <UnlockDialog onUnlock={unlock} onClose={() => setShowUnlock(false)} />
      )}
    </TooltipProvider>
  )
}
