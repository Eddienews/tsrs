import { describe, expect, it } from 'vitest'
import { chunk, search, tokenize, withReferences } from './knowledge'
import type { KnowledgeDoc } from './types'

const doc = (id: string, chunks: string[]): KnowledgeDoc => ({
  id,
  baseId: 'b',
  name: `${id}.md`,
  addedAt: 0,
  size: 0,
  chunks,
})

describe('tokenize', () => {
  it('folds case and accents, drops common words and plural -s', () => {
    expect(tokenize('Os Relatórios de Férias e a reunião')).toEqual(['relatorio', 'feria', 'reuniao'])
    expect(tokenize('The class passes')).toEqual(['class', 'passe'])
  })
})

describe('chunk', () => {
  it('packs paragraphs up to the size limit', () => {
    const text = ['a'.repeat(500), 'b'.repeat(500), 'c'.repeat(500)].join('\n\n')
    expect(chunk(text).map((c) => c.length)).toEqual([1002, 500])
  })

  it('cuts a long paragraph with some overlap', () => {
    const parts = chunk('x'.repeat(3000))
    expect(parts.map((c) => c.length)).toEqual([1200, 1200, 900])
  })

  it('ignores empty text', () => {
    expect(chunk('\n\n  \n')).toEqual([])
  })
})

describe('search', () => {
  const docs = [
    doc('ferias', ['Política de férias: 30 dias por ano.', 'Horário de trabalho das 9h às 18h.']),
    doc('reembolso', ['Reembolso de despesas em até 10 dias.', 'Férias coletivas em dezembro.']),
  ]

  it('ranks the passages that match the question', () => {
    const hits = search(docs, 'Quantos dias de férias eu tenho?')
    expect(hits[0].text).toBe('Política de férias: 30 dias por ano.')
    expect(hits.map((h) => h.name)).toContain('reembolso.md')
    expect(hits.every((h) => h.score > 0)).toBe(true)
  })

  it('finds nothing for unrelated or empty questions', () => {
    expect(search(docs, 'astronomia')).toEqual([])
    expect(search(docs, 'de a o')).toEqual([])
    expect(search([], 'férias')).toEqual([])
  })

  it('limits the number of passages', () => {
    expect(search(docs, 'férias dias', 1)).toHaveLength(1)
  })
})

describe('withReferences', () => {
  it('appends the passages after the question', () => {
    const text = withReferences('Pergunta?', [{ name: 'a.md', text: 'Trecho.' }])
    expect(text).toMatch(/^Pergunta\?\n\n<knowledge>\n/)
    expect(text).toContain('<passage index="1" document="a.md">\nTrecho.\n</passage>')
    expect(withReferences('Pergunta?', [])).toBe('Pergunta?')
  })
})
