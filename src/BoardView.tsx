import { ArrowLeft, ArrowRight, CalendarClock, Clapperboard, Columns3, MessageSquare, Plus, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  addCard,
  cardsIn,
  columnName,
  isLate,
  kindName,
  loadBoard,
  moveCard,
  removeCard,
  restoreCard,
  stepCard,
  storeBoard,
  takesOf,
  updateCard,
  type Board,
  type BoardCard,
  type BoardColumn,
  type CardKind,
  type TakeCounts,
} from './board'
import { formatWhen, locale, t } from './i18n'
import PageHeader from './PageHeader'
import type { ChatMeta } from './types'

interface Props {
  chats: ChatMeta[]
  onOpenChat: (id: string) => void
  onBack: () => void
  showMenu: boolean
  onMenu: () => void
}

const KINDS: CardKind[] = ['episodio', 'ad', 'outro']

// The production board: a column per stage, a card per piece of work.
export default function BoardView({ chats, onOpenChat, onBack, showMenu, onMenu }: Props) {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<BoardCard | 'new' | null>(null)
  const [editingColumns, setEditingColumns] = useState(false)
  const [series, setSeries] = useState('')
  const [dragged, setDragged] = useState<string | null>(null)
  const [takes, setTakes] = useState<Record<string, TakeCounts>>({})
  // Saves go one at a time, each with the version the previous one returned.
  const saving = useRef(Promise.resolve())
  const version = useRef(0)

  useEffect(() => {
    loadBoard().then(
      (loaded) => {
        version.current = loaded.version
        setBoard(loaded)
      },
      (err) => setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  const folderOf = (card: BoardCard) =>
    (card.chatId && chats.find((c) => c.id === card.chatId)?.project?.path) || card.projectPath

  // Takes of each card with a project folder, read once the board is in.
  const folders = useMemo(
    () => (board ? [...new Set(board.cards.map(folderOf).filter((p): p is string => !!p))] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board?.cards, chats],
  )
  useEffect(() => {
    for (const folder of folders) {
      if (takes[folder]) continue
      takesOf(folder).then((counts) => setTakes((all) => ({ ...all, [folder]: counts })), () => {})
    }
  }, [folders, takes])

  function change(next: (b: Board) => Board) {
    if (!board) return
    const local = next(board)
    setBoard(local)
    setNote('')
    saving.current = saving.current.then(async () => {
      try {
        const { board: saved, stale } = await storeBoard({ ...local, version: version.current })
        version.current = saved.version
        setBoard(saved)
        if (stale) setNote(t('O quadro mudou em outra aba; esta é a versão mais nova. Refaça a última mudança.'))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  const allSeries = useMemo(
    () => [...new Set((board?.cards ?? []).map((c) => c.series?.trim()).filter((s): s is string => !!s))].sort(),
    [board],
  )
  const shown = (column: BoardColumn) =>
    board ? cardsIn(board, column.id).filter((c) => !series || c.series === series) : []

  return (
    <div className="board-view flex h-full min-w-0 flex-col bg-background">
      <PageHeader title={t('Quadro de produção')} onBack={onBack} showMenu={showMenu} onMenu={onMenu}>
        {allSeries.length > 0 && (
          <select
            aria-label={t('Série')}
            className="select-native h-8 text-xs"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
          >
            <option value="">{t('Todas as séries')}</option>
            {allSeries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" disabled={!board} onClick={() => setEditingColumns(true)}>
          <Columns3 className="size-4" />
          {t('Colunas')}
        </Button>
        <Button size="sm" className="h-8 gap-1.5" disabled={!board} onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('Novo card')}
        </Button>
      </PageHeader>

      {error && <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {note && (
        <p role="status" className="border-b bg-surface-2 px-4 py-1.5 text-xs text-muted-foreground">
          {note}
        </p>
      )}
      {!board ? (
        !error && <p className="p-4 text-sm text-muted-foreground">{t('Carregando…')}</p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {board.columns.map((column, index) => (
            <section
              key={column.id}
              aria-label={columnName(column)}
              className={cn(
                'board-column flex w-64 shrink-0 flex-col rounded-md border bg-surface-2/60',
                dragged && 'outline-dashed outline-1 outline-transparent hover:outline-primary/50',
              )}
              onDragOver={(e) => dragged && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragged) change((b) => moveCard(b, dragged, column.id))
                setDragged(null)
              }}
            >
              <h2 className="flex items-center justify-between px-3 pt-2.5 pb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {columnName(column)}
                <span className="font-mono">{shown(column).length}</span>
              </h2>
              <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {shown(column).map((card) => {
                  const folder = folderOf(card)
                  const counts = folder ? takes[folder] : undefined
                  const chat = card.chatId ? chats.find((c) => c.id === card.chatId) : undefined
                  return (
                    <article
                      key={card.id}
                      draggable
                      data-card={card.title}
                      onDragStart={() => setDragged(card.id)}
                      onDragEnd={() => setDragged(null)}
                      onDragOver={(e) => dragged && dragged !== card.id && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (dragged) change((b) => moveCard(b, dragged, column.id, card.id))
                        setDragged(null)
                      }}
                      className={cn(
                        'board-card group cursor-grab rounded-md border bg-card p-2.5 text-sm shadow-xs',
                        dragged === card.id && 'opacity-50',
                      )}
                    >
                      <button className="block w-full text-left font-medium" onClick={() => setEditing(card)}>
                        {card.title}
                      </button>
                      <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                        <span className="rounded bg-accent px-1.5 py-0.5">{kindName(card.kind)}</span>
                        {card.series && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{card.series}</span>}
                        {card.language && <span className="rounded border px-1.5 py-0.5">{card.language}</span>}
                      </div>
                      {(card.due || counts?.total) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {card.due && (
                            <span className={cn('flex items-center gap-1', isLate(card) && index < board.columns.length - 1 && 'text-destructive')}>
                              <CalendarClock className="size-3" />
                              {new Date(`${card.due}T12:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {!!counts?.total && (
                            <span className="flex items-center gap-1" title={t('Takes aprovados, a refazer e pendentes')}>
                              <Clapperboard className="size-3" />
                              {t('{approved}/{total} takes', { approved: counts.approved, total: counts.total })}
                              {counts.redo > 0 && ` · ${t('{count} a refazer', { count: counts.redo })}`}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={t('Mover para a coluna anterior')}
                          disabled={index === 0}
                          onClick={() => change((b) => stepCard(b, card.id, -1))}
                        >
                          <ArrowLeft className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={t('Mover para a próxima coluna')}
                          disabled={index === board.columns.length - 1}
                          onClick={() => change((b) => stepCard(b, card.id, 1))}
                        >
                          <ArrowRight className="size-3.5" />
                        </Button>
                        {chat && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 gap-1 px-1.5 text-[11px]"
                            onClick={() => onOpenChat(chat.id)}
                          >
                            <MessageSquare className="size-3" />
                            {t('Abrir conversa')}
                          </Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {board && board.removed.length > 0 && (
        <details className="border-t px-4 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t('Cards removidos ({count})', { count: board.removed.length })}</summary>
          <ul className="mt-2 space-y-1">
            {board.removed.map((card) => (
              <li key={card.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{card.title}</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={() => change((b) => restoreCard(b, card.id))}>
                  <Undo2 className="size-3" />
                  {t('Trazer de volta')}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && board && (
        <CardDialog
          card={editing === 'new' ? undefined : editing}
          board={board}
          chats={chats}
          onSave={(fields) => {
            change((b) =>
              editing === 'new' ? addCard(b, fields) : moveCard(updateCard(b, editing.id, fields), editing.id, fields.column ?? editing.column),
            )
            setEditing(null)
          }}
          onRemove={
            editing === 'new'
              ? undefined
              : () => {
                  change((b) => removeCard(b, editing.id))
                  setEditing(null)
                }
          }
          onClose={() => setEditing(null)}
        />
      )}
      {editingColumns && board && (
        <ColumnsDialog
          board={board}
          onSave={(columns) => {
            change((b) => ({ ...b, columns }))
            setEditingColumns(false)
          }}
          onClose={() => setEditingColumns(false)}
        />
      )}
    </div>
  )
}

function CardDialog(props: {
  card?: BoardCard
  board: Board
  chats: ChatMeta[]
  onSave: (fields: Partial<BoardCard> & { title: string }) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const { card, board } = props
  const [title, setTitle] = useState(card?.title ?? '')
  const [column, setColumn] = useState(card?.column ?? board.columns[0].id)
  const [kind, setKind] = useState<CardKind>(card?.kind ?? 'episodio')
  const [series, setSeries] = useState(card?.series ?? '')
  const [language, setLanguage] = useState(card?.language ?? '')
  const [due, setDue] = useState(card?.due ?? '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [chatId, setChatId] = useState(card?.chatId ?? '')
  const [projectPath, setProjectPath] = useState(card?.projectPath ?? '')
  const chats = props.chats.filter((c) => !c.archived).slice(0, 200)
  const field = 'block space-y-1 text-sm'

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="dialog card-dialog max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? t('Editar card') : t('Novo card')}</DialogTitle>
          <DialogDescription>{t('Uma peça de trabalho: um episódio, um anúncio, um vídeo.')}</DialogDescription>
        </DialogHeader>
        <label className={field}>
          <span className="font-medium">{t('Título')}</span>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Ex.: Milo #4 — A chave perdida')} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>
            <span className="font-medium">{t('Etapa')}</span>
            <select aria-label={t('Etapa')} className="select-native w-full" value={column} onChange={(e) => setColumn(e.target.value)}>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {columnName(c)}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            <span className="font-medium">{t('Tipo')}</span>
            <select aria-label={t('Tipo')} className="select-native w-full" value={kind} onChange={(e) => setKind(e.target.value as CardKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindName(k)}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            <span className="font-medium">{t('Série ou cliente')}</span>
            <Input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Milo" list="board-series" />
            <datalist id="board-series">
              {[...new Set(board.cards.map((c) => c.series).filter(Boolean))].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className={field}>
            <span className="font-medium">{t('Idioma ou versão')}</span>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="PT" />
          </label>
          <label className={field}>
            <span className="font-medium">{t('Prazo')}</span>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className={field}>
            <span className="font-medium">{t('Conversa')}</span>
            <select aria-label={t('Conversa do card')} className="select-native w-full" value={chatId} onChange={(e) => setChatId(e.target.value)}>
              <option value="">{t('Nenhuma')}</option>
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!chatId && (
          <label className={field}>
            <span className="font-medium">{t('Pasta do projeto')}</span>
            <Input className="font-mono text-xs" value={projectPath} onChange={(e) => setProjectPath(e.target.value)} placeholder="C:\Users\…\projetos\milo-4" />
            <span className="block text-xs text-muted-foreground">
              {t('Opcional, quando não há conversa: o quadro conta os takes em takes/*.json dessa pasta.')}
            </span>
          </label>
        )}
        <label className={field}>
          <span className="font-medium">{t('Notas')}</span>
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {card && (
          <p className="text-xs text-muted-foreground">
            {t('Criado {created} · mudou {updated}', {
              created: formatWhen(card.createdAt),
              updated: formatWhen(card.updatedAt),
            })}
          </p>
        )}
        <div className="flex items-center gap-2">
          {props.onRemove && (
            <Button variant="ghost" className="text-destructive" onClick={props.onRemove}>
              {t('Remover card')}
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={props.onClose}>
            {t('Cancelar')}
          </Button>
          <Button
            disabled={!title.trim()}
            onClick={() =>
              props.onSave({
                title: title.trim(),
                column,
                kind,
                series: series.trim() || undefined,
                language: language.trim() || undefined,
                due: due || undefined,
                notes: notes.trim() || undefined,
                chatId: chatId || undefined,
                projectPath: chatId ? undefined : projectPath.trim() || undefined,
              })
            }
          >
            {t('Salvar')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Renames, adds and takes away columns; a column with cards stays.
function ColumnsDialog(props: { board: Board; onSave: (columns: BoardColumn[]) => void; onClose: () => void }) {
  const [columns, setColumns] = useState(props.board.columns.map((c) => ({ ...c, name: columnName(c) })))
  const used = (id: string) => props.board.cards.some((c) => c.column === id)
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Colunas do quadro')}</DialogTitle>
          <DialogDescription>{t('As etapas da produção, na ordem. Uma coluna com cards não pode sair.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {columns.map((column, i) => (
            <div key={column.id} className="flex items-center gap-2">
              <Input
                aria-label={t('Nome da coluna {number}', { number: i + 1 })}
                value={column.name}
                onChange={(e) => setColumns((list) => list.map((c) => (c.id === column.id ? { ...c, name: e.target.value } : c)))}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={used(column.id) || columns.length === 1}
                onClick={() => setColumns((list) => list.filter((c) => c.id !== column.id))}
              >
                {t('Remover')}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setColumns((list) => [...list, { id: crypto.randomUUID(), name: t('Nova etapa') }])}
          >
            <Plus className="size-3.5" />
            {t('Adicionar coluna')}
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>
            {t('Cancelar')}
          </Button>
          <Button
            disabled={columns.some((c) => !c.name.trim())}
            onClick={() =>
              props.onSave(
                columns.map((c) => {
                  // A starting column keeps its stored name while shown unchanged, so it keeps following the language.
                  const before = props.board.columns.find((o) => o.id === c.id)
                  return before && columnName(before) === c.name ? before : { id: c.id, name: c.name.trim() }
                }),
              )
            }
          >
            {t('Salvar')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
