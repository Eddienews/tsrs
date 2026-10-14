import { decodeVector, encodeVector, type Meaning } from './knowledge'
import { connection, PROVIDERS } from './providers'
import { embed } from './stream'
import type { KnowledgeDoc, Settings } from './types'

// Passages sent per request; providers cap how many texts one request takes.
const BATCH = 64

export interface EmbedSource {
  providerId: string
  model: string
  // Stored with the vectors: vectors of different models cannot be compared.
  key: string
}

// The provider and model that index knowledge bases by meaning, or null when
// that is off or no provider can do it. 'auto' takes only a provider with a
// key, so a local server that is not running is never picked by itself.
export function embedSource(settings: Settings, locked: boolean): EmbedSource | null {
  if (locked || settings.embedProvider === 'off') return null
  const auto = settings.embedProvider === 'auto'
  const provider = auto
    ? PROVIDERS.find((p) => p.embedding && p.keyRequired && settings.providers[p.id]?.apiKey)
    : PROVIDERS.find((p) => p.id === settings.embedProvider)
  if (!provider) return null
  const conn = settings.providers[provider.id]
  if (!conn?.baseUrl || (provider.keyRequired && !conn.apiKey)) return null
  // A model typed in applies only to the provider chosen by hand.
  const model = (auto ? '' : settings.embedModel.trim()) || provider.embedding
  if (!model) return null
  return { providerId: provider.id, model, key: `${provider.id}/${model}` }
}

// The document with one vector per passage.
export async function indexDoc(
  settings: Settings,
  source: EmbedSource,
  doc: KnowledgeDoc,
  signal?: AbortSignal,
): Promise<KnowledgeDoc> {
  const conn = connection(settings, source.providerId)
  const data: string[] = []
  for (let at = 0; at < doc.chunks.length; at += BATCH) {
    const vectors = await embed(conn, source.model, doc.chunks.slice(at, at + BATCH), signal)
    data.push(...vectors.map(encodeVector))
  }
  return { ...doc, vectors: { model: source.key, data } }
}

// The question as a vector, to search documents indexed by the same model.
export async function meaningOf(
  settings: Settings,
  source: EmbedSource,
  query: string,
  signal?: AbortSignal,
): Promise<Meaning> {
  const [vector] = await embed(connection(settings, source.providerId), source.model, [query], signal)
  // Through the stored form, so it is scaled like the passages.
  return { model: source.key, vector: decodeVector(encodeVector(vector)) }
}
