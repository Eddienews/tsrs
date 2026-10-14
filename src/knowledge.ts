import type { ToolDef, ToolResult } from './stream'
import type { KnowledgeDoc, Reference } from './types'

// Documents are split into passages, and the passages that best match the
// question are sent with it. Passages are matched by words (BM25), without any
// API, and also by meaning when the documents were indexed with a provider's
// embedding model: the two rankings are then merged.

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

// Vectors are kept as base64 of their float32 bytes, scaled to length 1 so
// that their dot product is the cosine similarity.
export function encodeVector(values: ArrayLike<number>): string {
  const vector = Float32Array.from(values)
  let length = 0
  for (const value of vector) length += value * value
  length = Math.sqrt(length) || 1
  for (let i = 0; i < vector.length; i++) vector[i] /= length
  const bytes = new Uint8Array(vector.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function decodeVector(text: string): Float32Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

const vectorCache = new Map<string, Float32Array[]>()

function vectorsOf(doc: KnowledgeDoc, model: string): Float32Array[] | undefined {
  if (doc.vectors?.model !== model) return undefined
  const key = `${doc.id}\n${model}`
  let vectors = vectorCache.get(key)
  if (!vectors) {
    vectors = doc.vectors.data.map(decodeVector)
    vectorCache.set(key, vectors)
  }
  return vectors
}

function dot(x: Float32Array, y: Float32Array): number {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += x[i] * y[i]
  return sum
}

// The question as a vector of the embedding model `model`.
export interface Meaning {
  model: string
  vector: Float32Array
}

export interface SearchOptions {
  limit?: number
  meaning?: Meaning
}

// Reciprocal rank fusion: a passage near the top of either ranking does well.
const FUSION = 60

// The passages of `docs` that best match `query`, best first.
export function search(docs: KnowledgeDoc[], query: string, options: SearchOptions = {}): Hit[] {
  const limit = options.limit ?? TOP_PASSAGES
  const byWords = searchWords(docs, query)
  const meaning = options.meaning
  if (!meaning) return byWords.slice(0, limit)
  const byMeaning: Hit[] = []
  for (const doc of docs) {
    const vectors = vectorsOf(doc, meaning.model)
    vectors?.forEach((vector, i) => {
      if (vector.length !== meaning.vector.length) return
      const score = dot(vector, meaning.vector)
      byMeaning.push({ docId: doc.id, name: doc.name, text: doc.chunks[i], score })
    })
  }
  if (!byMeaning.length) return byWords.slice(0, limit)
  byMeaning.sort((x, y) => y.score - x.score)
  const fused = new Map<string, Hit>()
  for (const ranking of [byWords, byMeaning.slice(0, limit * 4)]) {
    ranking.forEach((hit, rank) => {
      const key = `${hit.docId}\n${hit.text}`
      const score = (fused.get(key)?.score ?? 0) + 1 / (FUSION + rank + 1)
      fused.set(key, { ...hit, score })
    })
  }
  return [...fused.values()].sort((x, y) => y.score - x.score).slice(0, limit)
}

function searchWords(docs: KnowledgeDoc[], query: string): Hit[] {
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
  return hits.sort((x, y) => y.score - x.score)
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

// Lets the model search again, with words of its own, when the passages sent
// with the question are not enough.
export const KNOWLEDGE_TOOL = 'knowledge_search'

export function knowledgeTool(bases: string[]): ToolDef {
  return {
    name: KNOWLEDGE_TOOL,
    description:
      `Search the user's documents (knowledge bases: ${bases.join(', ')}) for passages ` +
      'relevant to a query. Passages that matched the latest message were already sent with it; ' +
      'call this when they are missing or not enough, with other words, names, synonyms or a ' +
      'narrower question, in the language of the documents. Returns the best passages, each ' +
      'with the name of its document.',
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look for.' } },
      required: ['query'],
    },
  }
}

export function queryOf(input: unknown): string {
  return String((input as { query?: unknown })?.query ?? '').trim()
}

export function hitsResult(hits: Hit[]): ToolResult {
  if (!hits.length) return { content: 'No passage matches that query.', isError: false }
  const references = hits.map(({ name, text }) => ({ name, text }))
  const content = references
    .map((r, i) => `<passage index="${i + 1}" document="${r.name}">\n${r.text}\n</passage>`)
    .join('\n')
  return { content, isError: false, references }
}
