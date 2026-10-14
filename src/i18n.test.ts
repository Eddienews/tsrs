import { afterEach, describe, expect, it } from 'vitest'
import { formatWhen, locale, setLanguage, t } from './i18n'
import { en } from './locales/en'

// Text of every source file, read through Vite since the project has no Node types.
const SOURCES = import.meta.glob<string>(
  ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./locales/**'],
  { query: '?raw', import: 'default', eager: true },
)
// The key of a t() call: its first argument, a single- or double-quoted literal.
const CALL = /\bt\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g
const PLACEHOLDER = /\{\w+\}/g

function usedKeys(): Set<string> {
  const keys = new Set<string>()
  for (const text of Object.values(SOURCES)) {
    for (const match of text.matchAll(CALL)) {
      keys.add((match[1] ?? match[2]).replace(/\\(.)/g, '$1'))
    }
  }
  return keys
}

describe('English dictionary', () => {
  const keys = usedKeys()

  it('finds the strings in the source', () => {
    expect(Object.keys(SOURCES)).toContain('./App.tsx')
    expect(Object.keys(SOURCES).filter((path) => /\.test\.|locales/.test(path))).toEqual([])
    expect(keys.size).toBeGreaterThan(100)
    expect(keys).toContain('Configurações')
  })

  it('translates every string passed to t()', () => {
    expect([...keys].filter((key) => !(key in en))).toEqual([])
  })

  it('keeps the placeholders of every string', () => {
    const broken = [...keys].filter((key) =>
      (key.match(PLACEHOLDER) ?? []).some((name) => !en[key]?.includes(name)),
    )
    expect(broken).toEqual([])
  })

  it('has no entries left over from removed strings', () => {
    expect(Object.keys(en).filter((key) => !keys.has(key))).toEqual([])
  })
})

describe('t', () => {
  afterEach(() => setLanguage('pt'))

  it('returns the Portuguese text by default', () => {
    expect(t('Configurações')).toBe('Configurações')
    expect(locale()).toBe('pt-BR')
  })

  it('translates and fills placeholders', () => {
    setLanguage('en')
    expect(t('Configurações')).toBe('Settings')
    expect(t('Excluir a conversa "{title}"?', { title: 'Plans' })).toBe('Delete the chat "Plans"?')
    expect(t('{count} resultados', { count: 3 })).toBe('3 results')
    expect(locale()).toBe('en-US')
  })

  it('fills placeholders in Portuguese too', () => {
    expect(t('{count} resultados', { count: 3 })).toBe('3 resultados')
  })

  it('falls back to the Portuguese text and keeps unknown placeholders', () => {
    setLanguage('en')
    expect(t('Texto sem tradução')).toBe('Texto sem tradução')
    expect(t('Olá, {name} e {other}', { name: 'Ana' })).toBe('Olá, Ana e {other}')
  })
})

describe('formatWhen', () => {
  const now = new Date(2026, 9, 14, 18, 0).getTime()

  it('shows the time today, the day this year and the year before', () => {
    expect(formatWhen(new Date(2026, 9, 14, 9, 5).getTime(), now)).toBe('09:05')
    expect(formatWhen(new Date(2026, 2, 3, 9, 5).getTime(), now)).toMatch(/^3 de mar\.?,? 09:05$/)
    expect(formatWhen(new Date(2025, 2, 3, 9, 5).getTime(), now)).toMatch(/2025/)
  })
})
