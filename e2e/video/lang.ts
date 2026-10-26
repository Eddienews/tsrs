// The English takes of the tutorial (SERIE_LANG=en): the same specs, with the app
// in English and everything written for the video translated on the way.
//
// - Locators: a Portuguese label a spec looks for becomes the app's English one,
//   from src/locales/en.ts (exact, with {placeholders} filled in, or as a pattern).
// - Text for the video (typed messages, replies, cards, seeded chats): from the
//   episode's dictionary, e2e/video/en/epNN.json, plus e2e/video/en/common.json:
//   { "text": { "pt": "en" }, "anchors": { "scene": { "palavra": "word" } } }.
//   Whole strings are looked up first; longer texts have every known piece replaced.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { en } from '../../src/locales/en'

export const LANG: 'pt' | 'en' = process.env.SERIE_LANG === 'en' ? 'en' : 'pt'
export const EN = LANG === 'en'
export const LOCALE = EN ? 'en-US' : 'pt-BR'

const UI = en as Record<string, string>
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface Dict {
  text: Record<string, string>
  anchors: Record<string, Record<string, string>>
}
const read = (file: string): Dict => {
  if (!existsSync(file)) return { text: {}, anchors: {} }
  const d = JSON.parse(readFileSync(file, 'utf8'))
  return { text: d.text ?? {}, anchors: d.anchors ?? {} }
}
const DIR = join(import.meta.dirname, 'en')
const common = read(join(DIR, 'common.json'))
let dict: Dict = { text: { ...common.text }, anchors: {} }
let pieces: [string, string][] = []
let back: [string, string][] = []

function index() {
  const pairs = Object.entries(dict.text).filter(([pt, en]) => pt && en !== undefined)
  pieces = [...pairs].sort((a, b) => b[0].length - a[0].length)
  back = pairs.map(([pt, en]): [string, string] => [en, pt]).filter(([en]) => en).sort((a, b) => b[0].length - a[0].length)
}
index()

// Loads the dictionary of episode n (with the common one under it).
export function useEpisode(n: number) {
  const own = read(join(DIR, `ep${String(n).padStart(2, '0')}.json`))
  dict = { text: { ...common.text, ...own.text }, anchors: own.anchors }
  index()
}

// The word said in the English narration where the Portuguese one was.
export function anchor(scene: number, word: string): string {
  if (!EN) return word
  return dict.anchors[String(scene)]?.[word] ?? word
}

const replaceAll = (text: string, pairs: [string, string][]) => {
  let out = text
  for (const [from, to] of pairs) if (from.length >= 3 && out.includes(from)) out = out.split(from).join(to)
  return out
}

// Text written for the video, in the language of the take.
export function tr(text: string): string {
  if (!EN || typeof text !== 'string' || !text) return text
  if (text in dict.text) return dict.text[text]
  return replaceAll(text, pieces)
}

// The same, inside JavaScript source (a seed's tweak): quotes in the English are escaped.
export function trCode(code: string): string {
  if (!EN || !code) return code
  return replaceAll(code, pieces.map(([pt, en]): [string, string] => [pt, en.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')]))
}

// Every string inside a value (a reply's tool input, say).
export function trDeep<T>(value: T): T {
  if (!EN) return value
  if (typeof value === 'string') return tr(value) as T
  if (Array.isArray(value)) return value.map(trDeep) as T
  if (value && typeof value === 'object' && !(value instanceof RegExp))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trDeep(v)])) as T
  return value
}

// What the user typed in English, back in the Portuguese the mock's patterns know.
export function untr(text: string): string {
  if (!EN || !text) return text
  return replaceAll(text, back)
}

// --- Interface labels -------------------------------------------------------

const filled = Object.entries(UI)
  .filter(([pt]) => /\{\w+\}/.test(pt))
  .map(([pt, en]) => {
    const names = pt.match(/\{\w+\}/g) ?? []
    const re = new RegExp('^' + pt.split(/\{\w+\}/).map(escape).join('(.+?)') + '$')
    return { re, names, en, pt }
  })

// A Portuguese label as the English app shows it.
export function ui(label: string): string {
  if (!EN) return label
  if (label in UI) return UI[label]
  for (const f of filled) {
    const m = f.re.exec(label)
    if (m) return f.names.reduce((out, name, i) => out.split(name).join(m[i + 1]), f.en)
  }
  if (label in dict.text) return dict.text[label]
  return label
}

// A pattern written against Portuguese labels, made to match the English ones.
export function uiPattern(re: RegExp): RegExp {
  if (!EN) return re
  const test = (s: string) => {
    re.lastIndex = 0
    return re.test(s)
  }
  const alts = new Set<string>()
  for (const [pt, value] of Object.entries(UI)) {
    if (/\{\w+\}/.test(pt)) {
      if (test(pt.replace(/\{\w+\}/g, '0')) || test(pt.replace(/\{\w+\}/g, 'X')))
        alts.add(value.split(/\{\w+\}/).map(escape).join('.+?'))
    } else if (test(pt)) alts.add(escape(value))
  }
  for (const [pt, value] of Object.entries(dict.text)) if (test(pt) && value) alts.add(escape(value))
  if (!alts.size) {
    // Not a label: perhaps text of the video, matched by pieces.
    const source = tr(re.source)
    return source === re.source ? re : new RegExp(source, re.flags)
  }
  const anchored = re.source.startsWith('^')
  return new RegExp(`${anchored ? '^' : ''}(?:${[...alts].join('|')})`, re.flags.replace('g', ''))
}

const label = (x: unknown) => (typeof x === 'string' ? ui(x) : x instanceof RegExp ? uiPattern(x) : x)
const withName = (opts: any) => (opts && 'name' in opts ? { ...opts, name: label(opts.name) } : opts)
const withText = (opts: any) =>
  opts && ('hasText' in opts || 'hasNotText' in opts)
    ? { ...opts, ...('hasText' in opts ? { hasText: label(opts.hasText) } : {}), ...('hasNotText' in opts ? { hasNotText: label(opts.hasNotText) } : {}) }
    : opts

const patched = new WeakSet<object>()
function patch(proto: any) {
  if (!proto || patched.has(proto)) return
  patched.add(proto)
  const wrap = (name: string, fix: (args: any[]) => any[]) => {
    const original = proto[name]
    if (typeof original !== 'function') return
    proto[name] = function (this: unknown, ...args: any[]) {
      return original.apply(this, fix(args))
    }
  }
  wrap('getByRole', ([role, opts]) => [role, withName(opts)])
  for (const m of ['getByText', 'getByLabel', 'getByPlaceholder', 'getByTitle', 'getByAltText'])
    wrap(m, ([text, opts]) => [label(text), opts])
  wrap('locator', ([selector, opts]) => [selector, withText(opts)])
  wrap('filter', ([opts]) => [withText(opts)])
  wrap('selectOption', ([values, opts]) => [
    values && typeof values === 'object' && !Array.isArray(values) && 'label' in values ? { ...values, label: label(values.label) } : values,
    opts,
  ])
}

// Makes a page (and every locator made from it) look for the English labels.
export function localize(page: Page) {
  if (!EN) return
  patch(Object.getPrototypeOf(page))
  patch(Object.getPrototypeOf(page.locator('body') as Locator))
}
