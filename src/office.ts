import { t } from './i18n'
import { MAX_UNZIPPED } from './spreadsheet'
import { decodeXml } from './xml'

// Word (.docx) and PowerPoint (.pptx) files read in the browser as text, like
// the spreadsheets: both are zips of XML parts, opened with fflate, so no
// Office library ships. Word keeps headings, lists and tables as Markdown;
// PowerPoint gives one section per slide, in the order of the presentation,
// with the speaker notes.

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function isWord(file: { name: string; type: string }): boolean {
  return /\.doc[xm]$/i.test(file.name) || file.type === DOCX
}

export function isPowerPoint(file: { name: string; type: string }): boolean {
  return /\.pp[st][xm]$/i.test(file.name) || file.type === PPTX
}

// Older or other formats, refused with a hint instead of being read as
// garbled text.
export function isOtherDocument(name: string): boolean {
  return /\.(doc|ppt|pps|odt|odp|rtf|pages|key)$/i.test(name)
}

export function otherDocument(name: string): string {
  return /\.(ppt|pps|odp|key)$/i.test(name)
    ? t('"{name}" é uma apresentação num formato que o TSRS não lê. Salve como .pptx ou PDF.', { name })
    : t('"{name}" é um documento num formato que o TSRS não lê. Salve como .docx ou PDF.', { name })
}

function invalid(name: string): Error {
  return new Error(t('"{name}" está corrompido ou não é um arquivo do Office.', { name }))
}

async function unzip(bytes: Uint8Array, name: string, wanted: (path: string) => boolean): Promise<Record<string, string>> {
  const { strFromU8, unzipSync } = await import('fflate')
  let unzipped = 0
  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes, {
      filter: (file) => {
        if (!wanted(file.name)) return false
        unzipped += file.originalSize
        if (unzipped > MAX_UNZIPPED) throw invalid(name)
        return true
      },
    })
  } catch {
    throw invalid(name)
  }
  return Object.fromEntries(Object.entries(zip).map(([path, data]) => [path, strFromU8(data)]))
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return match ? decodeXml(match[1]) : undefined
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// --- Word -------------------------------------------------------------------

// The text of a Word paragraph: its runs, tabs and line breaks. Deleted text
// (tracked changes) sits in <w:delText> and is left out.
function runsText(xml: string): string {
  let text = ''
  for (const [token, inner] of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:(?:br|cr)\b[^>]*\/>/g)) {
    if (inner !== undefined) text += decodeXml(inner)
    else text += token.startsWith('<w:tab') ? '\t' : '\n'
  }
  return text
}

// Heading level of a paragraph style. Word names the built-in styles by
// language ("Heading2", "Ttulo2" in Portuguese, "berschrift2" in German), so
// the trailing digit after a known prefix is what counts.
function headingLevel(style: string | undefined): number {
  if (!style) return 0
  if (/^(title|ttulo|titre|titel)$/i.test(style)) return 1
  const match = /^(?:heading|ttulo|titulo|título|titre|berschrift|überschrift|kop|rubrik|encabezado)\s*(\d)$/i.exec(style)
  return match ? Math.min(6, Number(match[1])) : 0
}

function paragraph(xml: string): string {
  const props = /<w:pPr\b[\s\S]*?<\/w:pPr>/.exec(xml)?.[0] ?? ''
  const text = runsText(xml).trim()
  if (!text) return ''
  const style = /<w:pStyle\s[^>]*>/.exec(props)
  const level = headingLevel(style ? attr(style[0], 'w:val') : undefined)
  if (level) return `${'#'.repeat(level)} ${text}`
  const styleName = style ? (attr(style[0], 'w:val') ?? '') : ''
  // Numbering set on the paragraph, or a list style ("ListBullet", the
  // Portuguese "PargrafodaLista") that carries it.
  if (/<w:numPr\b/.test(props) || /^(list|pargrafodalista|lista)/i.test(styleName)) {
    const depth = Number(attr(/<w:ilvl\s[^>]*>/.exec(props)?.[0] ?? '', 'w:val') ?? 0)
    return `${'  '.repeat(Math.min(depth, 8))}- ${text}`
  }
  return text
}

function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()
}

function table(xml: string): string {
  const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(([row]) =>
    [...row.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(([c]) =>
      cell([...c.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(([p]) => runsText(p)).join(' ')),
    ),
  )
  if (!rows.length) return ''
  const width = Math.max(...rows.map((r) => r.length))
  const line = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill('')].join(' | ')} |`
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')
}

export function documentText(xml: string): string {
  const body = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml
  const blocks: string[] = []
  // Tables first in the alternation, so their paragraphs are not read twice.
  for (const [block] of body.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g)) {
    blocks.push(block.startsWith('<w:tbl') ? table(block) : paragraph(block))
  }
  // List items stay together; everything else is a paragraph of its own.
  let out = ''
  for (const block of blocks.filter(Boolean)) {
    const item = /^\s*- /.test(block)
    out += out ? (item && /(^|\n)\s*- [^\n]*$/.test(out) ? '\n' : '\n\n') : ''
    out += block
  }
  return tidy(out)
}

export async function readWord(bytes: Uint8Array, name = 'document.docx'): Promise<string> {
  const parts = await unzip(bytes, name, (path) => /^word\/(document|footnotes|endnotes)\.xml$/.test(path))
  const main = parts['word/document.xml']
  if (!main) throw invalid(name)
  const notes = ['word/footnotes.xml', 'word/endnotes.xml']
    .map((path) => parts[path])
    .filter(Boolean)
    .map((xml) =>
      [...xml.matchAll(/<w:(?:footnote|endnote)\s([^>]*)>([\s\S]*?)<\/w:(?:footnote|endnote)>/g)]
        // Ids 0 and -1 are Word's separators, not notes.
        .filter(([, tag]) => Number(attr(` ${tag}`, 'w:id')) > 0)
        .map(([, , inner]) => [...inner.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(([p]) => runsText(p).trim()).join(' '))
        .filter(Boolean),
    )
    .flat()
  const text = documentText(main)
  return notes.length ? `${text}\n\n---\n${notes.map((n, i) => `[${i + 1}] ${n}`).join('\n')}` : text
}

// --- PowerPoint ---------------------------------------------------------------

function relations(xml: string | undefined, base: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [tag] of (xml ?? '').matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(tag, 'Id')
    const target = attr(tag, 'Target')
    if (id && target) map.set(id, resolve(base, target))
  }
  return map
}

// A relationship target, relative to its part's folder or from the zip root.
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').filter(Boolean)
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop()
    else if (piece !== '.') parts.push(piece)
  }
  return parts.join('/')
}

// The text of a slide or notes part: one line per paragraph, in the order
// the shapes appear.
export function slideText(xml: string): string {
  const lines = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map(([p]) => {
    let text = ''
    for (const [token, inner] of p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) {
      text += inner !== undefined ? decodeXml(inner) : token.startsWith('<a:br') ? '\n' : ''
    }
    return text.trim()
  })
  return tidy(lines.filter(Boolean).join('\n'))
}

function slideNumber(path: string): number {
  return Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0)
}

export async function readPowerPoint(bytes: Uint8Array, name = 'presentation.pptx'): Promise<string> {
  const parts = await unzip(bytes, name, (path) =>
    /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/.test(path),
  )
  const presentation = parts['ppt/presentation.xml']
  if (!presentation) throw invalid(name)
  // The order of the presentation, from its slide list; slides hidden from
  // the list or a list that names none fall back to the file numbers.
  const rels = relations(parts['ppt/_rels/presentation.xml.rels'], 'ppt')
  const listed = [...(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(presentation)?.[1] ?? '').matchAll(/<p:sldId\s[^>]*>/g)]
    .map(([tag]) => rels.get(attr(tag, 'r:id') ?? ''))
    .filter((path): path is string => !!path && path in parts)
  const slides = listed.length
    ? listed
    : Object.keys(parts)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
        .sort((a, b) => slideNumber(a) - slideNumber(b))
  const sections = slides.map((path, i) => {
    const relsPath = path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')
    const notesPath = [...relations(parts[relsPath], 'ppt/slides').values()].find((p) => /notesSlide\d+\.xml$/.test(p))
    const text = slideText(parts[path])
    // Notes parts repeat the slide number in a placeholder; keep only the words.
    const notes = notesPath && parts[notesPath] ? slideText(parts[notesPath]).replace(/^\d+$/gm, '').trim() : ''
    return [`## ${t('Slide {n}', { n: i + 1 })}`, text, notes && `${t('Notas')}: ${tidy(notes)}`].filter(Boolean).join('\n\n')
  })
  return sections.join('\n\n')
}

// --- Both -------------------------------------------------------------------

export function isOffice(file: { name: string; type: string }): boolean {
  return isWord(file) || isPowerPoint(file)
}

export async function officeText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const text = isWord(file) ? await readWord(bytes, file.name) : await readPowerPoint(bytes, file.name)
  if (!text.trim()) throw new Error(t('"{name}" não tem texto que dê para ler.', { name: file.name }))
  return text
}
