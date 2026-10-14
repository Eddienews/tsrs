import { en } from './locales/en'

// The interface is written in Portuguese; the Portuguese text is also the key
// under which each translation is filed, so an untranslated string falls back
// to something readable instead of an identifier.

export type Language = 'pt' | 'en'

export const LANGUAGES: { id: Language; name: string }[] = [
  { id: 'pt', name: 'Português' },
  { id: 'en', name: 'English' },
]

const dictionaries: Record<Language, Record<string, string>> = { pt: {}, en }

let current: Language = 'pt'

export function detectLanguage(): Language {
  return globalThis.navigator?.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

export function setLanguage(language: Language): void {
  current = language
  if (typeof document !== 'undefined') document.documentElement.lang = locale()
}

// BCP 47 tag for formatting numbers and dates.
export function locale(): string {
  return current === 'pt' ? 'pt-BR' : 'en-US'
}

// When a message was written, as briefly as is clear: the time today, the
// day and time this year, the full date before.
export function formatWhen(ms: number, now = Date.now()): string {
  const when = new Date(ms)
  const today = new Date(now)
  const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  if (when.toDateString() === today.toDateString()) {
    return when.toLocaleTimeString(locale(), time)
  }
  const day: Intl.DateTimeFormatOptions =
    when.getFullYear() === today.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  return when.toLocaleString(locale(), { ...day, ...time })
}

// Translates `text`, filling `{name}` placeholders from `vars`.
export function t(text: string, vars?: Record<string, string | number>): string {
  const template = dictionaries[current][text] ?? text
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  )
}
