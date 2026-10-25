import { t } from './i18n'

// The production board (server/board.mjs): one card per piece of work, moved
// through the stages of making it, kept in _producao/quadro.json in the
// projects folder.
export const BOARD = '/__tsrs/board'

export interface BoardColumn {
  id: string
  name: string
}

export type CardKind = 'episodio' | 'ad' | 'outro'

export interface BoardCard {
  id: string
  title: string
  column: string
  kind?: CardKind
  // A series or client, to group cards ("Milo", "Seu Silva").
  series?: string
  // Language or version ("PT", "EN").
  language?: string
  // Due date, YYYY-MM-DD.
  due?: string
  notes?: string
  // The conversation where the work happens, and its project folder.
  chatId?: string
  projectPath?: string
  createdAt: number
  updatedAt: number
}

export interface Board {
  // Bumped by the server on every save; a save from an older copy is refused.
  version: number
  columns: BoardColumn[]
  cards: BoardCard[]
  removed: (BoardCard & { removedAt: number })[]
}

export interface TakeCounts {
  total: number
  approved: number
  redo: number
  pending: number
}

// The columns a new board starts with; their names show in the interface's language.
const DEFAULT_NAMES: Record<string, [string, () => string]> = {
  roteiro: ['Roteiro', () => t('Roteiro')],
  takes: ['Takes', () => t('Takes')],
  montagem: ['Montagem', () => t('Montagem')],
  render: ['Render', () => t('Render')],
  revisao: ['Revisão', () => t('Revisão')],
  publicado: ['Publicado', () => t('Publicado')],
}

export function columnName(column: BoardColumn): string {
  const known = DEFAULT_NAMES[column.id]
  return known && column.name === known[0] ? known[1]() : column.name
}

export function kindName(kind: CardKind | undefined): string {
  if (kind === 'episodio') return t('Episódio')
  if (kind === 'ad') return t('Anúncio')
  return t('Outro')
}

export function addCard(board: Board, fields: Partial<BoardCard> & { title: string }, now = Date.now()): Board {
  const column = board.columns.some((c) => c.id === fields.column) ? fields.column! : board.columns[0].id
  const card: BoardCard = { kind: 'episodio', ...fields, id: fields.id ?? crypto.randomUUID(), column, createdAt: now, updatedAt: now }
  return { ...board, cards: [...board.cards, card] }
}

export function updateCard(board: Board, id: string, patch: Partial<BoardCard>, now = Date.now()): Board {
  return {
    ...board,
    cards: board.cards.map((c) => (c.id === id ? { ...c, ...patch, id, updatedAt: now } : c)),
  }
}

// Moves a card to a column, before the card `before` (at the end when absent).
export function moveCard(board: Board, id: string, column: string, before?: string, now = Date.now()): Board {
  const card = board.cards.find((c) => c.id === id)
  if (!card || !board.columns.some((c) => c.id === column) || id === before) return board
  const rest = board.cards.filter((c) => c.id !== id)
  const moved = { ...card, column, updatedAt: card.column === column ? card.updatedAt : now }
  const at = before ? rest.findIndex((c) => c.id === before) : -1
  const cards = at >= 0 ? [...rest.slice(0, at), moved, ...rest.slice(at)] : [...rest, moved]
  return { ...board, cards }
}

// The next or previous column, for moving a card without dragging it.
export function stepCard(board: Board, id: string, step: 1 | -1, now = Date.now()): Board {
  const card = board.cards.find((c) => c.id === id)
  const at = board.columns.findIndex((c) => c.id === card?.column)
  const next = board.columns[at + step]
  return card && next ? moveCard(board, id, next.id, undefined, now) : board
}

// Removed cards are kept apart, to be brought back.
export function removeCard(board: Board, id: string, now = Date.now()): Board {
  const card = board.cards.find((c) => c.id === id)
  if (!card) return board
  return { ...board, cards: board.cards.filter((c) => c.id !== id), removed: [...board.removed, { ...card, removedAt: now }] }
}

export function restoreCard(board: Board, id: string, now = Date.now()): Board {
  const card = board.removed.find((c) => c.id === id)
  if (!card) return board
  const { removedAt: _, ...kept } = card
  const column = board.columns.some((c) => c.id === kept.column) ? kept.column : board.columns[0].id
  return {
    ...board,
    removed: board.removed.filter((c) => c.id !== id),
    cards: [...board.cards, { ...kept, column, updatedAt: now }],
  }
}

export function cardsIn(board: Board, column: string): BoardCard[] {
  return board.cards.filter((c) => c.column === column)
}

// How many cards each column has, in order: the board at a glance.
export function stageCounts(board: Board): { column: BoardColumn; count: number }[] {
  return board.columns.map((column) => ({ column, count: cardsIn(board, column.id).length }))
}

const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Cards not yet in the last column that are due within `days` (late ones included), soonest first.
export function dueSoon(board: Board, now = Date.now(), days = 7): BoardCard[] {
  const last = board.columns.at(-1)?.id
  const until = day(new Date(now + days * 86_400_000))
  return board.cards
    .filter((c) => c.due && c.column !== last && c.due <= until)
    .sort((a, b) => a.due!.localeCompare(b.due!))
}

export function isLate(card: BoardCard, now = Date.now()): boolean {
  return !!card.due && card.due < day(new Date(now))
}

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  let res: Response
  try {
    res = await fetch(`${BOARD}${path}`, init)
  } catch {
    throw new Error(t('O quadro precisa do servidor local do TSRS (npm run dev).'))
  }
  let body: any = null
  try {
    body = await res.json()
  } catch {
    // A static build answers with its page.
  }
  if (!body || (!res.ok && res.status !== 409)) {
    throw new Error(body?.error ?? t('O quadro precisa do servidor local do TSRS (npm run dev).'))
  }
  return { status: res.status, body: body as T }
}

export async function loadBoard(): Promise<Board> {
  return (await call<Board>('/')).body
}

// Saves the board; `stale` means another tab saved first and `board` is theirs.
export async function storeBoard(board: Board): Promise<{ board: Board; stale: boolean }> {
  const { status, body } = await call<Board>('/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, version: board.version }),
  })
  return { board: body, stale: status === 409 }
}

export async function takesOf(path: string): Promise<TakeCounts> {
  return (await call<TakeCounts>(`/takes?${new URLSearchParams({ path })}`)).body
}
