import { expect, test } from 'vitest'
import { agentFor, folderNote } from './folders'
import { reportFile, reportName, RESEARCH_NOTE } from './research'
import { defaultSettings } from './storage'
import type { Persona } from './types'
import { formatResults, ownSearch, searchKeyId, withSources } from './webSearch'

test('own search needs a service, its key and, for Google, the engine ID', () => {
  const settings = defaultSettings()
  expect(ownSearch(settings)).toBeNull()
  settings.ownSearch = { provider: 'brave' }
  expect(ownSearch(settings)).toBeNull()
  settings.mediaKeys[searchKeyId('brave')] = ' bsa-1 '
  expect(ownSearch(settings)).toEqual({ provider: 'brave', key: 'bsa-1' })
  settings.ownSearch = { provider: 'google' }
  settings.mediaKeys[searchKeyId('google')] = 'g-key'
  expect(ownSearch(settings)).toBeNull()
  settings.ownSearch.googleCx = 'abc123'
  expect(ownSearch(settings)).toEqual({ provider: 'google', key: 'g-key', cx: 'abc123' })
})

test('search results for the model, and sources listed once', () => {
  expect(formatResults([{ title: 'TSRS', url: 'https://x.dev', snippet: 'Um app' }])).toBe('1. TSRS\nhttps://x.dev\nUm app')
  expect(formatResults([])).toBe('No results.')
  expect(withSources([{ url: 'a' }], [{ url: 'a' }, { url: 'b', title: 'B' }, { url: 'b' }])).toEqual([
    { url: 'a' },
    { url: 'b', title: 'B' },
  ])
})

test('a research report is saved with the question and every page consulted', () => {
  const date = new Date('2026-10-15T05:00:00Z')
  expect(reportName('Qual é o mercado de IA no Brasil?', date)).toBe('pesquisas/2026-10-15-qual-e-o-mercado-de-ia-no-brasil.md')
  const file = reportFile('Mercado de IA', 'Resumo [1].', [{ url: 'https://a.br', title: 'Fonte A' }], 'gpt-6-astra', date)
  expect(file).toContain('# Mercado de IA')
  expect(file).toContain('## Relatório\n\nResumo [1].')
  expect(file).toContain('1. [Fonte A](https://a.br)')
  expect(file).toContain('gpt-6-astra')
  expect(RESEARCH_NOTE).toContain('Sources')
})

test('a conversation without an agent uses its folder’s', () => {
  const personas = [{ id: 'p1', name: 'Revisor', system: 'Revise' }, { id: 'p2', name: 'Outro', system: 'x' }] as Persona[]
  const folder = { id: 'f', name: 'Site', instructions: ' Tom direto. ', personaId: 'p1' }
  expect(agentFor(personas, undefined, folder)?.name).toBe('Revisor')
  expect(agentFor(personas, 'p2', folder)?.name).toBe('Outro')
  expect(agentFor(personas, undefined, undefined)).toBeUndefined()
  expect(folderNote(folder)).toBe('Instructions for every conversation in the project folder "Site":\nTom direto.')
})
