import { useEffect, useMemo, useState } from 'react'
import { t } from './i18n'
import type { ChatMeta, Folder } from './types'

const SEARCH_DELAY_MS = 200

interface Props {
  chats: ChatMeta[]
  folders: Folder[]
  activeId: string | null
  onSelect: (id: string | null) => void
  onUpdateChat: (id: string, patch: Partial<ChatMeta>) => void
  onDeleteChat: (chat: ChatMeta) => void
  onExportChat: (chat: ChatMeta) => void
  // Ids of the conversations whose messages contain the (lowercase) text.
  onSearch: (needle: string) => Promise<string[]>
  onFoldersChange: (folders: Folder[]) => void
  onDeleteFolder: (folder: Folder) => void
  onOpenSettings: () => void
}

export default function Sidebar(props: Props) {
  const { chats, folders, activeId } = props
  const [query, setQuery] = useState('')
  // Id of the chat or folder whose menu is open.
  const [menu, setMenu] = useState<string | null>(null)

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

  function act(action: () => void) {
    setMenu(null)
    action()
  }

  function renameChat(chat: ChatMeta) {
    const title = prompt(t('Novo título da conversa:'), chat.title)?.trim()
    if (title) props.onUpdateChat(chat.id, { title })
  }

  function newFolder() {
    const name = prompt(t('Nome da pasta:'))?.trim()
    if (name) props.onFoldersChange([...folders, { id: crypto.randomUUID(), name }])
  }

  function renameFolder(folder: Folder) {
    const name = prompt(t('Novo nome da pasta:'), folder.name)?.trim()
    if (name) {
      props.onFoldersChange(folders.map((f) => (f.id === folder.id ? { ...f, name } : f)))
    }
  }

  function row(chat: ChatMeta) {
    return (
      <div
        key={chat.id}
        className={chat.id === activeId ? 'chat-item active' : 'chat-item'}
        onClick={() => props.onSelect(chat.id)}
      >
        <span className="chat-title">{chat.title}</span>
        <button
          className="icon"
          title={t('Opções')}
          onClick={(e) => {
            e.stopPropagation()
            setMenu(menu === chat.id ? null : chat.id)
          }}
        >
          ⋯
        </button>
        {menu === chat.id && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => act(() => props.onUpdateChat(chat.id, { pinned: !chat.pinned }))}>
              {chat.pinned ? t('Desafixar') : t('Fixar')}
            </button>
            <button onClick={() => act(() => renameChat(chat))}>{t('Renomear')}</button>
            {folders
              .filter((f) => f.id !== chat.folderId)
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() => act(() => props.onUpdateChat(chat.id, { folderId: f.id }))}
                >
                  {t('Mover para “{name}”', { name: f.name })}
                </button>
              ))}
            {chat.folderId && folderIds.has(chat.folderId) && (
              <button onClick={() => act(() => props.onUpdateChat(chat.id, { folderId: undefined }))}>
                {t('Tirar da pasta')}
              </button>
            )}
            <button onClick={() => act(() => props.onExportChat(chat))}>{t('Exportar Markdown')}</button>
            <button className="danger" onClick={() => act(() => props.onDeleteChat(chat))}>
              {t('Excluir')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      {menu && <div className="backdrop" onClick={() => setMenu(null)} />}
      <div className="brand">
        <strong>TSRS</strong>
        <span>The Signal Room Studio</span>
      </div>
      <div className="row">
        <button className="primary grow" onClick={() => props.onSelect(null)}>
          {t('+ Nova conversa')}
        </button>
        <button title={t('Nova pasta')} onClick={newFolder}>
          {t('+ Pasta')}
        </button>
      </div>
      <input
        type="search"
        placeholder={t('Buscar nas conversas…')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <nav className="chats">
        {needle ? (
          <>
            <h4>
              {results.length === 1
                ? t('{count} resultado', { count: results.length })
                : t('{count} resultados', { count: results.length })}
            </h4>
            {results.map(row)}
          </>
        ) : (
          <>
            {pinned.length > 0 && <h4>{t('Fixadas')}</h4>}
            {pinned.map(row)}
            {folders.map((folder) => (
              <details key={folder.id} open>
                <summary>
                  <span className="chat-title">{folder.name}</span>
                  <button
                    className="icon"
                    title={t('Opções da pasta')}
                    onClick={(e) => {
                      e.preventDefault()
                      setMenu(menu === folder.id ? null : folder.id)
                    }}
                  >
                    ⋯
                  </button>
                  {menu === folder.id && (
                    <div className="menu" onClick={(e) => e.preventDefault()}>
                      <button onClick={() => act(() => renameFolder(folder))}>{t('Renomear')}</button>
                      <button className="danger" onClick={() => act(() => props.onDeleteFolder(folder))}>
                        {t('Excluir pasta')}
                      </button>
                    </div>
                  )}
                </summary>
                {sorted.filter((c) => !c.pinned && c.folderId === folder.id).map(row)}
              </details>
            ))}
            {(pinned.length > 0 || folders.length > 0) && loose.length > 0 && <h4>{t('Conversas')}</h4>}
            {loose.map(row)}
          </>
        )}
      </nav>

      <button onClick={props.onOpenSettings}>{t('Configurações')}</button>
    </aside>
  )
}
