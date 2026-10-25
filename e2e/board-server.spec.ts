import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { countTakes, readBoard, saveBoard } from '../server/board.mjs'

test('keeps the board in a file, refuses a stale save and keeps the previous version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-board-'))
  const empty = await readBoard(root)
  expect(empty.version).toBe(0)
  expect(empty.columns.map((c: { id: string }) => c.id)).toEqual(['roteiro', 'takes', 'montagem', 'render', 'revisao', 'publicado'])

  const card = { id: 'a', title: 'Milo #4', column: 'roteiro', createdAt: 1, updatedAt: 1 }
  const first = await saveBoard({ ...empty, cards: [card] }, 0, root)
  expect(first).toMatchObject({ ok: true, board: { version: 1, cards: [card] } })

  // Another tab still holding version 0 gets the current board back instead.
  const stale = await saveBoard({ ...empty, cards: [] }, 0, root)
  expect(stale).toMatchObject({ ok: false, board: { version: 1, cards: [card] } })

  const second = await saveBoard({ ...first.board, cards: [{ ...card, column: 'takes' }] }, 1, root)
  expect(second.board.version).toBe(2)
  const previous = JSON.parse(await readFile(join(root, '_producao', 'quadro.anterior.json'), 'utf8'))
  expect(previous.cards[0].column).toBe('roteiro')

  await expect(saveBoard({ ...second.board, cards: [{ ...card, column: 'nada' }] }, 2, root)).rejects.toThrow('column that does not exist')
})

test('counts the takes of a project folder by status', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tsrs-takes-'))
  expect(await countTakes(folder)).toEqual({ total: 0, approved: 0, redo: 0, pending: 0 })
  await mkdir(join(folder, 'takes'))
  await writeFile(join(folder, 'takes', '01.json'), JSON.stringify({ line: 1, status: 'approved' }))
  await writeFile(join(folder, 'takes', '02.json'), JSON.stringify({ line: 2, status: 'redo' }))
  await writeFile(join(folder, 'takes', '03.json'), '{ ainda escrevendo')
  await writeFile(join(folder, 'takes', 'notas.txt'), 'não conta')
  expect(await countTakes(folder)).toEqual({ total: 3, approved: 1, redo: 1, pending: 1 })
  expect(await countTakes('relativo/pasta')).toEqual({ total: 0, approved: 0, redo: 0, pending: 0 })
})
