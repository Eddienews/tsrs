// The production board: one card per piece of work (an episode, an ad), moved
// through the stages of making it. Kept as a file on this computer,
// _producao/quadro.json in the projects folder, so it survives the browser and
// can be read by any tool. Cards are never deleted for real: a removed card
// goes to `removed`, and the previous version of the file is kept beside it.
//
// A card's project folder may hold its takes, one JSON file each in takes/:
//   { "line"?, "shot"?, "mode"?, "prompt"?, "seed"?, "file"?, "status": "approved" | "redo" | "pending" }
// written by whatever makes them (a script, a coding agent, by hand); the
// board counts them.
//
// Mounted inside the TSRS dev server at /__tsrs/board (board-plugin.mjs):
//   GET  /                         the board: { version, columns, cards, removed }
//   PUT  /   { board, version }    saves it, unless someone saved since `version`
//   GET  /takes?path=              { total, approved, redo, pending } for a project folder

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { projectsRoot } from './projects.mjs'

export const BOARD_FOLDER = '_producao'
const FILE = 'quadro.json'
const MAX_TAKES = 2000

export function defaultColumns() {
  return [
    { id: 'roteiro', name: 'Roteiro' },
    { id: 'takes', name: 'Takes' },
    { id: 'montagem', name: 'Montagem' },
    { id: 'render', name: 'Render' },
    { id: 'revisao', name: 'Revisão' },
    { id: 'publicado', name: 'Publicado' },
  ]
}

export function boardFile(root = projectsRoot()) {
  return join(root, BOARD_FOLDER, FILE)
}

export async function readBoard(root = projectsRoot()) {
  try {
    const board = JSON.parse(await readFile(boardFile(root), 'utf8'))
    return {
      version: Number(board.version) || 0,
      columns: Array.isArray(board.columns) && board.columns.length ? board.columns : defaultColumns(),
      cards: Array.isArray(board.cards) ? board.cards : [],
      removed: Array.isArray(board.removed) ? board.removed : [],
    }
  } catch {
    return { version: 0, columns: defaultColumns(), cards: [], removed: [] }
  }
}

function check(board) {
  if (!board || !Array.isArray(board.columns) || !Array.isArray(board.cards)) throw new Error('Not a board.')
  const columns = new Set(board.columns.map((c) => c?.id))
  if (columns.size !== board.columns.length || [...columns].some((id) => typeof id !== 'string' || !id)) {
    throw new Error('Every column needs an id of its own.')
  }
  for (const card of board.cards) {
    if (typeof card?.id !== 'string' || typeof card.title !== 'string') throw new Error('Every card needs an id and a title.')
    if (!columns.has(card.column)) throw new Error(`The card "${card.title}" is in a column that does not exist.`)
  }
}

// Saves the board when `version` is the one on disk; otherwise the caller got
// a stale copy (another tab saved since) and gets the current one back.
export async function saveBoard(board, version, root = projectsRoot()) {
  check(board)
  const current = await readBoard(root)
  if (Number(version) !== current.version) return { ok: false, board: current }
  const next = {
    version: current.version + 1,
    columns: board.columns,
    cards: board.cards,
    removed: Array.isArray(board.removed) ? board.removed : current.removed,
  }
  const file = boardFile(root)
  await mkdir(join(root, BOARD_FOLDER), { recursive: true })
  if (current.version > 0) {
    await writeFile(join(root, BOARD_FOLDER, 'quadro.anterior.json'), JSON.stringify(current, null, 2))
  }
  await writeFile(`${file}.tmp`, JSON.stringify(next, null, 2))
  await rename(`${file}.tmp`, file)
  return { ok: true, board: next }
}

// The takes in a project folder's takes/, by status.
export async function countTakes(folder) {
  const counts = { total: 0, approved: 0, redo: 0, pending: 0 }
  if (!folder || !isAbsolute(folder) || /(^|[\\/])\.\.([\\/]|$)/.test(folder)) return counts
  let names = []
  try {
    names = (await readdir(join(folder, 'takes'))).filter((n) => n.endsWith('.json')).slice(0, MAX_TAKES)
  } catch {
    return counts
  }
  for (const name of names) {
    let status = 'pending'
    try {
      const take = JSON.parse(await readFile(join(folder, 'takes', name), 'utf8'))
      if (take?.status === 'approved' || take?.status === 'redo') status = take.status
    } catch {
      // A file being written, or not JSON: counted as pending.
    }
    counts.total++
    counts[status]++
  }
  return counts
}

export function boardHandler(root = projectsRoot()) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://tsrs.local')
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    if (req.method === 'GET' && url.pathname === '/') return send(200, await readBoard(root)), true
    if (req.method === 'GET' && url.pathname === '/takes') {
      return send(200, await countTakes(url.searchParams.get('path') ?? '')), true
    }
    if (req.method === 'PUT' && url.pathname === '/') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      try {
        const { board, version } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        const saved = await saveBoard(board, version, root)
        return send(saved.ok ? 200 : 409, saved.board), true
      } catch (error) {
        return send(400, { error: String(error?.message ?? error) }), true
      }
    }
    return false
  }
}
