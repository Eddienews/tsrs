import {
  Archive,
  ArchiveRestore,
  BarChart3,
  ChevronRight,
  Download,
  FileCode,
  Folder as FolderIcon,
  FolderInput,
  FolderOutput,
  FolderPlus,
  Library,
  Puzzle,
  ListChecks,
  Moon,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  Tag,
  Trash2,
  Wrench,
  X,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t } from './i18n'
import { allTags, hasTag, parseTags, withTag } from './tags'
import type { ChatMeta, Folder } from './types'
import { versionDetails, versionLabel } from './version'
import { activeProfile, profileName, switchProfile } from './profiles'
import { ACTIVE_PROFILE, loadProfiles } from './storage'

const SEARCH_DELAY_MS = 200

interface Props {
  chats: ChatMeta[]
  folders: Folder[]
  activeId: string | null
  theme: 'light' | 'dark'
  onSelect: (id: string | null) => void
  onUpdateChat: (id: string, patch: Partial<ChatMeta>) => void
  // Asks for confirmation once, then deletes them all.
  onDeleteChats: (chats: ChatMeta[]) => void
  onExportChat: (chat: ChatMeta) => void
  onExportHtml: (chat: ChatMeta) => void
  // Ids of the conversations whose messages contain the (lowercase) text.
  onSearch: (needle: string) => Promise<string[]>
  onFoldersChange: (folders: Folder[]) => void
  onDeleteFolder: (folder: Folder) => void
  // Opens the folder's context: instructions, files and agent.
  onEditFolder: (folder: Folder) => void
  // Starts a conversation inside the folder.
  onNewInFolder: (folder: Folder) => void
  onOpen: (what: 'library' | 'tools' | 'extensions' | 'usage' | 'settings') => void
  onToggleTheme: () => void
}

// A text field that replaces a name while it is being typed or changed.
function NameField(props: { label: string; initial?: string; onDone: (name?: string) => void }) {
  return (
    <Input
      autoFocus
      defaultValue={props.initial}
      aria-label={props.label}
      placeholder={props.label}
      className="h-8 text-sm"
      onBlur={(e) => props.onDone(e.target.value.trim() || undefined)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') props.onDone()
      }}
    />
  )
}

const heading = 'px-2 pb-1 text-[11px] font-normal uppercase tracking-wider text-muted-foreground'

export default function Sidebar(props: Props) {
  const { chats, folders, activeId } = props
  const [query, setQuery] = useState('')
  // Id of the chat or folder being renamed, or 'new' for a folder being created.
  const [naming, setNaming] = useState<string | null>(null)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  // Choosing several conversations to act on at once.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const sorted = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats])
  const needle = query.trim().toLowerCase()
  // Titles match instantly; message contents are searched in storage.
  const [contentHits, setContentHits] = useState<Set<string>>(new Set())
  const { onSearch } = props
  useEffect(() => {
    setContentHits(new Set())
    if (!needle) return
    let stale = false
    const timer = setTimeout(async () => {
      const ids = await onSearch(needle)
      if (!stale) setContentHits(new Set(ids))
    }, SEARCH_DELAY_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [needle, onSearch])
  const tags = useMemo(() => allTags(chats), [chats])
  // A tag no conversation has any more filters nothing.
  const filter = tagFilter && tags.some((x) => x.toLowerCase() === tagFilter.toLowerCase())
    ? tagFilter
    : null
  // Searching and filtering by tag both reach archived conversations too.
  const results = needle || filter
    ? sorted.filter(
        (c) =>
          (!needle || c.title.toLowerCase().includes(needle) || contentHits.has(c.id)) &&
          (!filter || hasTag(c, filter)),
      )
    : []

  const folderIds = new Set(folders.map((f) => f.id))
  const current = sorted.filter((c) => !c.archived)
  const archived = sorted.filter((c) => c.archived)
  const pinned = current.filter((c) => c.pinned)
  const loose = current.filter((c) => !c.pinned && !(c.folderId && folderIds.has(c.folderId)))
  const chosen = sorted.filter((c) => selected.has(c.id))

  function toggleSelected(id: string) {
    const next = new Set(selected)
    if (!next.delete(id)) next.add(id)
    setSelected(next)
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
    setNaming(null)
  }

  // Changes every chosen conversation, then leaves selection mode.
  function updateChosen(patch: (chat: ChatMeta) => Partial<ChatMeta>) {
    for (const chat of chosen) props.onUpdateChat(chat.id, patch(chat))
    stopSelecting()
  }

  function toggleFolder(id: string) {
    const next = new Set(closed)
    if (!next.delete(id)) next.add(id)
    setClosed(next)
  }

  function row(chat: ChatMeta) {
    return (
      <div
        key={chat.id}
        className={cn(
          'chat-item group relative flex items-center rounded-md hover:bg-sidebar-accent',
          chat.id === activeId && 'bg-sidebar-accent',
        )}
      >
        {selecting && (
          <input
            type="checkbox"
            className="ml-2 size-3.5 shrink-0 accent-primary"
            aria-label={t('Selecionar "{title}"', { title: chat.title })}
            checked={selected.has(chat.id)}
            onChange={() => toggleSelected(chat.id)}
          />
        )}
        {naming === chat.id ? (
          <NameField
            label={t('Novo título da conversa:')}
            initial={chat.title}
            onDone={(title) => {
              if (title) props.onUpdateChat(chat.id, { title })
              setNaming(null)
            }}
          />
        ) : naming === `tags:${chat.id}` ? (
          <NameField
            label={t('Etiquetas, separadas por vírgula:')}
            initial={(chat.tags ?? []).join(', ')}
            onDone={(text) => {
              props.onUpdateChat(chat.id, { tags: parseTags(text ?? '') })
              setNaming(null)
            }}
          />
        ) : (
          <button
            className="min-w-0 flex-1 px-2 py-1.5 text-left"
            onClick={() => (selecting ? toggleSelected(chat.id) : props.onSelect(chat.id))}
          >
            <div className="flex items-center gap-1 truncate text-sm">
              {chat.archived && (
                <Archive className="size-3 shrink-0 text-muted-foreground" aria-label={t('Arquivada')} />
              )}
              <span className="truncate">{chat.title}</span>
            </div>
            <div className="flex items-center gap-1 truncate font-mono text-[10.5px] text-muted-foreground">
              <span className="truncate">{chat.model}</span>
              {chat.tags?.map((tag) => (
                <span key={tag} className="chat-tag shrink-0 rounded bg-surface-2 px-1">
                  #{tag}
                </span>
              ))}
            </div>
          </button>
        )}
        {!selecting && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('Opções')}
                title={t('Opções')}
                className="mr-1 size-6 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onSelect={() => setNaming(chat.id)}>
                <Pencil />
                {t('Renomear')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onUpdateChat(chat.id, { pinned: !chat.pinned })}>
                {chat.pinned ? <PinOff /> : <Pin />}
                {chat.pinned ? t('Desafixar') : t('Fixar')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNaming(`tags:${chat.id}`)}>
                <Tag />
                {t('Etiquetas')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onUpdateChat(chat.id, { archived: !chat.archived })}>
                {chat.archived ? <ArchiveRestore /> : <Archive />}
                {chat.archived ? t('Desarquivar') : t('Arquivar')}
              </DropdownMenuItem>
              {folders
                .filter((f) => f.id !== chat.folderId)
                .map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onSelect={() => props.onUpdateChat(chat.id, { folderId: f.id })}
                  >
                    <FolderInput />
                    {t('Mover para “{name}”', { name: f.name })}
                  </DropdownMenuItem>
                ))}
              {chat.folderId && folderIds.has(chat.folderId) && (
                <DropdownMenuItem onSelect={() => props.onUpdateChat(chat.id, { folderId: undefined })}>
                  <FolderOutput />
                  {t('Tirar da pasta')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => props.onExportChat(chat)}>
                <Download />
                {t('Exportar Markdown')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onExportHtml(chat)}>
                <FileCode />
                {t('Exportar HTML')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => props.onDeleteChats([chat])}
              >
                <Trash2 />
                {t('Excluir')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    )
  }

  function folderRow(folder: Folder) {
    const items = current.filter((c) => !c.pinned && c.folderId === folder.id)
    const open = !closed.has(folder.id)
    return (
      <div key={folder.id} data-folder={folder.id}>
        {naming === folder.id ? (
          <NameField
            label={t('Novo nome da pasta:')}
            initial={folder.name}
            onDone={(name) => {
              if (name) {
                props.onFoldersChange(folders.map((f) => (f.id === folder.id ? { ...f, name } : f)))
              }
              setNaming(null)
            }}
          />
        ) : (
          <div className="group flex items-center rounded-md hover:bg-sidebar-accent">
            <button
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-sm"
              aria-expanded={open}
              onClick={() => toggleFolder(folder.id)}
            >
              <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
              <FolderIcon className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-left">{folder.name}</span>
              {(folder.instructions?.trim() || folder.files?.length || folder.personaId) && (
                <span className="size-1.5 rounded-full bg-primary" title={t('Esta pasta tem contexto próprio')} />
              )}
              <span className="font-mono text-[11px] text-muted-foreground">{items.length}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('Opções da pasta')}
                  title={t('Opções da pasta')}
                  className="mr-1 size-6 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                <DropdownMenuItem onSelect={() => props.onNewInFolder(folder)}>
                  <Plus />
                  {t('Nova conversa nesta pasta')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => props.onEditFolder(folder)}>
                  <SlidersHorizontal />
                  {t('Contexto da pasta…')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setNaming(folder.id)}>
                  <Pencil />
                  {t('Renomear')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => props.onDeleteFolder(folder)}
                >
                  <Trash2 />
                  {t('Excluir pasta')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {open && items.length > 0 && <div className="ml-4 border-l pl-1">{items.map(row)}</div>}
      </div>
    )
  }

  const footer = [
    ['library', Library, t('Biblioteca')],
    ['tools', Wrench, t('Ferramentas')],
    ['extensions', Puzzle, t('Extensões')],
    ['usage', BarChart3, t('Uso')],
    ['settings', SettingsIcon, t('Configurações')],
  ] as const

  return (
    <aside className="sidebar flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="flex size-6 items-center justify-center rounded border border-primary/60">
          <span className="live-dot" />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tracking-wider">TSRS</span>
            <span className="truncate text-xs text-muted-foreground">The Signal Room Studio</span>
          </div>
          {/* Which code is running, so a screenshot says it too. */}
          <span
            className="truncate font-mono text-[10px] text-muted-foreground"
            title={versionDetails()}
            data-testid="version"
          >
            {versionLabel()}
          </span>
        </div>
        <ProfileSwitch />
      </div>
      <div className="space-y-2 px-3 pb-2">
        <div className="flex gap-2">
          <Button className="flex-1 justify-start gap-2" onClick={() => props.onSelect(null)}>
            <Plus className="size-4" />
            {t('Nova conversa')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('Nova pasta')}
            title={t('Nova pasta')}
            onClick={() => setNaming('new')}
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            variant={selecting ? 'secondary' : 'outline'}
            size="icon"
            aria-label={t('Selecionar conversas')}
            title={t('Selecionar conversas')}
            aria-pressed={selecting}
            disabled={!chats.length}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          >
            <ListChecks className="size-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Buscar nas conversas…')}
            aria-label={t('Buscar nas conversas…')}
            className="h-8 pl-8 text-sm"
          />
        </div>
        {tags.length > 0 && (
          <div className="tag-filter flex flex-wrap gap-1" aria-label={t('Filtrar por etiqueta')}>
            {tags.map((tag) => {
              const on = filter?.toLowerCase() === tag.toLowerCase()
              return (
                <button
                  key={tag}
                  aria-pressed={on}
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-sidebar-accent',
                    on && 'border-primary bg-primary/10 text-foreground',
                  )}
                  onClick={() => setTagFilter(on ? null : tag)}
                >
                  #{tag}
                </button>
              )
            })}
          </div>
        )}
        {selecting && (
          <div className="bulk space-y-1.5 rounded-md border bg-card p-2">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs text-muted-foreground">
                {chosen.length === 1
                  ? t('1 selecionada')
                  : t('{count} selecionadas', { count: chosen.length })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={t('Cancelar a seleção')}
                title={t('Cancelar a seleção')}
                onClick={stopSelecting}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            {naming === 'bulk-tag' ? (
              <NameField
                label={t('Etiqueta para acrescentar:')}
                onDone={(text) => {
                  const [tag] = parseTags(text ?? '')
                  if (tag) updateChosen((chat) => ({ tags: withTag(chat, tag) }))
                  else setNaming(null)
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={!chosen.length}
                  onClick={() => {
                    // Restores when every chosen one is archived, else archives.
                    const archive = !chosen.every((c) => c.archived)
                    updateChosen(() => ({ archived: archive }))
                  }}
                >
                  {chosen.length && chosen.every((c) => c.archived) ? (
                    <ArchiveRestore className="size-3.5" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                  {chosen.length && chosen.every((c) => c.archived) ? t('Desarquivar') : t('Arquivar')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={!chosen.length}
                    >
                      <FolderInput className="size-3.5" />
                      {t('Mover')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {folders.map((f) => (
                      <DropdownMenuItem key={f.id} onSelect={() => updateChosen(() => ({ folderId: f.id }))}>
                        <FolderInput />
                        {t('Mover para “{name}”', { name: f.name })}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={() => updateChosen(() => ({ folderId: undefined }))}>
                      <FolderOutput />
                      {t('Tirar da pasta')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={!chosen.length}
                  onClick={() => setNaming('bulk-tag')}
                >
                  <Tag className="size-3.5" />
                  {t('Etiquetar')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-destructive"
                  disabled={!chosen.length}
                  onClick={() => {
                    props.onDeleteChats(chosen)
                    stopSelecting()
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {t('Excluir')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        {needle || filter ? (
          <section>
            <h4 className={heading}>
              {filter && !needle
                ? t('#{tag} · {count}', { tag: filter, count: results.length })
                : results.length === 1
                  ? t('{count} resultado', { count: results.length })
                  : t('{count} resultados', { count: results.length })}
            </h4>
            {results.map(row)}
          </section>
        ) : (
          <>
            {pinned.length > 0 && (
              <section>
                <h4 className={heading}>{t('Fixadas')}</h4>
                {pinned.map(row)}
              </section>
            )}
            {(folders.length > 0 || naming === 'new') && (
              <section className="space-y-0.5">
                <h4 className={heading}>{t('Pastas')}</h4>
                {folders.map(folderRow)}
                {naming === 'new' && (
                  <NameField
                    label={t('Nome da pasta:')}
                    onDone={(name) => {
                      if (name) props.onFoldersChange([...folders, { id: crypto.randomUUID(), name }])
                      setNaming(null)
                    }}
                  />
                )}
              </section>
            )}
            {loose.length > 0 && (
              <section>
                <h4 className={heading}>{t('Conversas')}</h4>
                {loose.map(row)}
              </section>
            )}
            {archived.length > 0 && (
              <section className="archived">
                <button
                  className={cn(heading, 'flex w-full items-center gap-1 hover:text-foreground')}
                  aria-expanded={showArchived}
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <ChevronRight className={cn('size-3 transition-transform', showArchived && 'rotate-90')} />
                  {t('Arquivadas ({count})', { count: archived.length })}
                </button>
                {showArchived && archived.map(row)}
              </section>
            )}
            {chats.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">{t('Nenhuma conversa ainda.')}</p>
            )}
          </>
        )}
      </nav>

      <div className="grid grid-cols-6 gap-1 border-t p-2">
        {footer.map(([key, Icon, label]) => (
          <Button
            key={key}
            variant="ghost"
            size="icon"
            className="w-full"
            aria-label={label}
            title={label}
            onClick={() => props.onOpen(key)}
          >
            <Icon className="size-4" />
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="w-full"
          aria-label={t('Alternar tema')}
          title={t('Alternar tema')}
          onClick={props.onToggleTheme}
        >
          {props.theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </aside>
  )
}

// With more than one profile, which one is open, and a quick way to the others.
function ProfileSwitch() {
  const { list } = loadProfiles()
  if (list.length < 2) return null
  const current = activeProfile()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="profile-switch ml-auto h-7 max-w-28 gap-1 px-2 text-xs"
          aria-label={t('Perfil: {name}', { name: profileName(current) })}
        >
          <UserRound className="size-3.5 shrink-0" />
          <span className="truncate">{profileName(current)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {list.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            disabled={profile.id === ACTIVE_PROFILE}
            onSelect={() => switchProfile(profile.id)}
          >
            {profileName(profile)}
            {profile.id === ACTIVE_PROFILE && <span className="ml-auto text-xs text-muted-foreground">{t('(em uso)')}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
