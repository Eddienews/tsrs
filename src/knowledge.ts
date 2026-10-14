import type { KnowledgeDoc, Reference } from './types'

// Knowledge bases are searched by words, without any API: documents are split
// into passages, and the passages that best match the question (BM25) are
// sent with it.

const CHUNK_CHARS = 1200
// Text repeated between passages cut in the middle of a paragraph.
const OVERLAP = 150
export const TOP_PASSAGES = 6

// Too common to tell passages apart, in Portuguese and English.
const STOPWORDS = new Set(
  (
    'de da do das dos a o as os e em um uma uns umas no na nos nas por para com sem que se ' +
    'ao aos à às ou mas como mais menos muito já não sim é ser são foi era está estão ' +
    'eu tu ele ela nós vós eles elas me te lhe isso isto esse essa este esta aquele aquela qual ' +
    'the of and or to in on at by for with from as is are was were be been it its this that ' +
    'these those an not but if then than so do does did have has had you your we our they their'
  ).split(' '),
)

// Lowercase words without accents and with a plural -s dropped, so that
// "Relatórios" matches "relatorio".
export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .match(/[\p{L}\p{N}]+/gu)
  if (!words) return []
  return words
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}

// Splits text into passages of about CHUNK_CHARS, along paragraphs where it can.
export function chunk(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: string[] = []
  let current = ''
  const flush = () => {
    if (current) out.push(current)
    current = ''
  }
  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_CHARS) {
      flush()
      for (let at = 0; at < paragraph.length; at += CHUNK_CHARS - OVERLAP) {
        out.push(paragraph.slice(at, at + CHUNK_CHARS))
        if (at + CHUNK_CHARS >= paragraph.length) break
      }
    } else if (current.length + paragraph.length + 2 > CHUNK_CHARS) {
      flush()
      current = paragraph
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }
  }
  flush()
  return out
}

// Documents never change once added, so their words are worked out once.
const tokenCache = new Map<string, string[][]>()

function tokensOf(doc: KnowledgeDoc): string[][] {
  let tokens = tokenCache.get(doc.id)
  if (!tokens) {
    tokens = doc.chunks.map(tokenize)
    tokenCache.set(doc.id, tokens)
  }
  return tokens
}

export interface Hit extends Reference {
  docId: string
  score: number
}

// The passages of `docs` that best match `query`, best first.
export function search(docs: KnowledgeDoc[], query: string, limit = TOP_PASSAGES): Hit[] {
  const terms = [...new Set(tokenize(query))]
  if (!terms.length) return []
  const passages = docs.flatMap((doc) =>
    tokensOf(doc).map((tokens, i) => ({ doc, text: doc.chunks[i], tokens })),
  )
  if (!passages.length) return []
  const average = passages.reduce((sum, p) => sum + p.tokens.length, 0) / passages.length || 1
  const frequency = new Map<string, number>()
  for (const term of terms) {
    frequency.set(term, passages.filter((p) => p.tokens.includes(term)).length)
  }
  const k1 = 1.2
  const b = 0.75
  const hits: Hit[] = []
  for (const passage of passages) {
    let score = 0
    for (const term of terms) {
      const tf = passage.tokens.filter((t) => t === term).length
      if (!tf) continue
      const df = frequency.get(term)!
      const idf = Math.log(1 + (passages.length - df + 0.5) / (df + 0.5))
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * passage.tokens.length) / average))
    }
    if (score > 0) {
      hits.push({ docId: passage.doc.id, name: passage.doc.name, text: passage.text, score })
    }
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, limit)
}

// The passages, as text to send after the question.
export function withReferences(question: string, references: Reference[]): string {
  if (!references.length) return question
  const passages = references
    .map((r, i) => `<passage index="${i + 1}" document="${r.name}">\n${r.text}\n</passage>`)
    .join('\n')
  return (
    `${question}\n\n<knowledge>\nPassages from the user's documents that may help; use them ` +
    `when relevant and name the document you rely on:\n${passages}\n</knowledge>`
  )
}
