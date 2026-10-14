import {
  ChevronRight,
  Download,
  Folder as FolderIcon,
  FolderInput,
  FolderOutput,
  FolderPlus,
  Library,
  Moon,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  Wrench,
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
import type { ChatMeta, Folder } from './types'

const SEARCH_DELAY_MS = 200

interface Props {
  chats: ChatMeta[]
  folders: Folder[]
  activeId: string | null
  theme: 'light' | 'dark'
  onSelect: (id: string | null) => void
  onUpdateChat: (id: string, patch: Partial<ChatMeta>) => void
  onDeleteChat: (chat: ChatMeta) => void
  onExportChat: (chat: ChatMeta) => void
  // Ids of the conversations whose messages contain the (lowercase) text.
  onSearch: (needle: string) => Promise<string[]>
  onFoldersChange: (folders: Folder[]) => void
  onDeleteFolder: (folder: Folder) => void
  onOpen: (what: 'library' | 'tools' | 'settings') => void
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
  const results = needle
    ? sorted.filter((c) => c.title.toLowerCase().includes(needle) || contentHits.has(c.id))
    : []

  const folderIds = new Set(folders.map((f) => f.id))
  const pinned = sorted.filter((c) => c.pinned)
  const loose = sorted.filter((c) => !c.pinned && !(c.folderId && folderIds.has(c.folderId)))

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
        {naming === chat.id ? (
          <NameField
            label={t('Novo título da conversa:')}
            initial={chat.title}
            onDone={(title) => {
              if (title) props.onUpdateChat(chat.id, { title })
              setNaming(null)
            }}
          />
        ) : (
          <button
            className="min-w-0 flex-1 px-2 py-1.5 text-left"
            onClick={() => props.onSelect(chat.id)}
          >
            <div className="truncate text-sm">{chat.title}</div>
            <div className="truncate font-mono text-[10.5px] text-muted-foreground">{chat.model}</div>
          </button>
        )}
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => props.onDeleteChat(chat)}
            >
              <Trash2 />
              {t('Excluir')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  function folderRow(folder: Folder) {
    const items = sorted.filter((c) => !c.pinned && c.folderId === folder.id)
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
    ['settings', SettingsIcon, t('Configurações')],
  ] as const

  return (
    <aside className="sidebar flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="flex size-6 items-center justify-center rounded border border-primary/60">
          <span className="live-dot" />
        </div>
        <span className="font-mono text-sm font-semibold tracking-wider">TSRS</span>
        <span className="truncate text-xs text-muted-foreground">The Signal Room Studio</span>
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
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        {needle ? (
          <section>
            <h4 className={heading}>
              {results.length === 1
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
            {chats.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">{t('Nenhuma conversa ainda.')}</p>
            )}
          </>
        )}
      </nav>

      <div className="grid grid-cols-4 gap-1 border-t p-2">
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
