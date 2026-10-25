import { afterEach, describe, expect, it } from 'vitest'
import {
  addCard,
  columnName,
  dueSoon,
  isLate,
  moveCard,
  removeCard,
  restoreCard,
  stageCounts,
  stepCard,
  updateCard,
  type Board,
} from './board'
import { setLanguage } from './i18n'

const NOW = new Date(2026, 9, 25, 12).getTime()

function board(): Board {
  return {
    version: 3,
    columns: [
      { id: 'roteiro', name: 'Roteiro' },
      { id: 'takes', name: 'Takes' },
      { id: 'publicado', name: 'Publicado' },
    ],
    cards: [],
    removed: [],
  }
}

describe('production board', () => {
  afterEach(() => setLanguage('pt'))

  it('adds cards to the first column unless told otherwise, and moves them', () => {
    let b = addCard(board(), { id: 'a', title: 'Milo #3' }, NOW)
    b = addCard(b, { id: 'b', title: 'Seu Silva #12', column: 'takes', series: 'Seu Silva' }, NOW)
    b = addCard(b, { id: 'c', title: 'AD relógio', column: 'nenhuma', kind: 'ad' }, NOW)
    expect(b.cards.map((c) => [c.id, c.column, c.kind])).toEqual([
      ['a', 'roteiro', 'episodio'],
      ['b', 'takes', 'episodio'],
      ['c', 'roteiro', 'ad'],
    ])
    // Moved before another card; the time changes only when the column does.
    b = moveCard(b, 'c', 'takes', 'b', NOW + 1)
    expect(b.cards.map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(b.cards.find((c) => c.id === 'c')).toMatchObject({ column: 'takes', updatedAt: NOW + 1 })
    expect(moveCard(b, 'a', 'nao-existe')).toBe(b)
    b = stepCard(b, 'b', 1, NOW + 2)
    expect(b.cards.find((c) => c.id === 'b')?.column).toBe('publicado')
    expect(stepCard(b, 'b', 1)).toBe(b)
    expect(stageCounts(b).map((s) => s.count)).toEqual([1, 1, 1])
  })

  it('keeps removed cards to bring them back', () => {
    let b = addCard(board(), { id: 'a', title: 'Milo #3', column: 'takes' }, NOW)
    b = removeCard(b, 'a', NOW + 5)
    expect(b.cards).toEqual([])
    expect(b.removed).toEqual([expect.objectContaining({ id: 'a', removedAt: NOW + 5 })])
    b = restoreCard(b, 'a', NOW + 6)
    expect(b.removed).toEqual([])
    expect(b.cards).toEqual([expect.objectContaining({ id: 'a', column: 'takes', updatedAt: NOW + 6 })])
  })

  it('lists what is due this week, late first, leaving out published work', () => {
    let b = board()
    b = addCard(b, { id: 'late', title: 'Atrasado', due: '2026-10-20' }, NOW)
    b = addCard(b, { id: 'soon', title: 'Logo', due: '2026-10-28' }, NOW)
    b = addCard(b, { id: 'far', title: 'Longe', due: '2026-12-01' }, NOW)
    b = addCard(b, { id: 'done', title: 'Feito', due: '2026-10-21', column: 'publicado' }, NOW)
    b = updateCard(b, 'soon', { notes: 'gravar dia 27' }, NOW)
    expect(dueSoon(b, NOW).map((c) => c.id)).toEqual(['late', 'soon'])
    expect(isLate(b.cards[0], NOW)).toBe(true)
    expect(isLate(b.cards[1], NOW)).toBe(false)
  })

  it('names the starting columns in the interface language, and the user\'s own as typed', () => {
    setLanguage('en')
    expect(columnName({ id: 'roteiro', name: 'Roteiro' })).toBe('Script')
    expect(columnName({ id: 'roteiro', name: 'Escrita' })).toBe('Escrita')
    expect(columnName({ id: 'x', name: 'Cor' })).toBe('Cor')
  })
})
