import { PROJECTS } from './projects'
import type { ToolCall, ToolDef, ToolResult } from './stream'
import { localTools, type ToolSet } from './tools'
import type { ChatProject, Settings } from './types'

// Stock video from Pexels and Pixabay (server/stock.mjs), for short videos and
// for anyone who wants footage in a project. Keys are the user's own, kept
// with the media keys; clips are saved in the project's midia/stock/ and
// credited by name.

export type StockServiceId = 'pexels' | 'pixabay'
export type Orientation = 'portrait' | 'landscape' | 'square'

export const STOCK_SERVICES: { id: StockServiceId; name: string; keyUrl: string; license: string }[] = [
  { id: 'pexels', name: 'Pexels', keyUrl: 'https://www.pexels.com/api/', license: 'https://www.pexels.com/license/' },
  { id: 'pixabay', name: 'Pixabay', keyUrl: 'https://pixabay.com/api/docs/#api_search_videos', license: 'https://pixabay.com/service/license-summary/' },
]

export const stockKeyId = (id: StockServiceId) => `stock:${id}`

export interface StockClip {
  provider: StockServiceId
  id: string
  url: string
  width: number
  height: number
  duration: number
  page: string
  author: string
  authorUrl: string
  thumbnail: string
}

// The services with a key, in order of preference.
export function stockServices(settings: Settings): { id: StockServiceId; key: string }[] {
  return STOCK_SERVICES.map((s) => ({ id: s.id, key: settings.mediaKeys[stockKeyId(s.id)]?.trim() ?? '' })).filter((s) => s.key)
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${PROJECTS}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    // A TSRS without its server answers with its page.
  }
  if (!res.ok || !json) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json as T
}

// Clips for a search, from the first service with a key that finds any.
export async function searchStock(
  settings: Settings,
  query: string,
  orientation: Orientation,
  count = 10,
  signal?: AbortSignal,
): Promise<StockClip[]> {
  const services = stockServices(settings)
  if (!services.length) throw new Error('No key for Pexels or Pixabay: add one in Settings → Media.')
  let problem: unknown
  for (const service of services) {
    try {
      const { clips } = await post<{ clips: StockClip[] }>(
        '/stock/search',
        { provider: service.id, key: service.key, query, orientation, count },
        signal,
      )
      if (clips.length) return clips
    } catch (error) {
      problem = error
    }
  }
  if (problem) throw problem
  return []
}

export const clipName = (clip: StockClip) => `${clip.provider}-${clip.id}`

// Downloads a clip into the project; the file's path inside the project.
export async function saveClip(project: ChatProject, clip: StockClip, signal?: AbortSignal): Promise<string> {
  return (await post<{ name: string }>('/stock/download', { path: project.path, url: clip.url, name: clipName(clip) }, signal)).name
}

// A credits line, as both services ask: who made it and where it came from.
export function creditLine(clip: StockClip, file?: string): string {
  const service = STOCK_SERVICES.find((s) => s.id === clip.provider)!.name
  const who = clip.author ? (clip.authorUrl ? `[${clip.author}](${clip.authorUrl})` : clip.author) : service
  return `- ${file ? `\`${file}\`: ` : ''}vídeo de ${who} no [${service}](${clip.page || service})`
}

export const STOCK_TOOL: ToolDef = {
  name: 'project_stock_video',
  description:
    'Find free stock video clips (Pexels, Pixabay) and save them in the project folder, in ' +
    'midia/stock/. Search in English with concrete visual words (city street at night, hands ' +
    'typing on a laptop). Returns the saved files with their size and length, and adds the ' +
    'credits to CREDITOS.md.',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What should be seen, in English.' },
      orientation: { type: 'string', enum: ['portrait', 'landscape', 'square'], description: 'portrait for 9:16 (default), landscape for 16:9.' },
      count: { type: 'number', description: 'How many clips to save, 1 to 5 (default 1).' },
      min_seconds: { type: 'number', description: 'Shortest clip to accept, in seconds.' },
    },
    required: ['query'],
  },
}

// The tool, for a conversation with a project folder.
export function stockToolSet(
  settings: Settings,
  project: () => ChatProject | null | undefined | Promise<ChatProject | null | undefined>,
  onSaved: (files: string[], credits: string[]) => void,
): ToolSet | null {
  if (!stockServices(settings).length) return null
  return localTools([STOCK_TOOL], 'Pexels / Pixabay', async (call: ToolCall, signal): Promise<ToolResult> => {
    const where = await project()
    if (!where) return { content: 'This conversation has no project folder.', isError: true }
    const input = (call.input ?? {}) as { query?: string; orientation?: Orientation; count?: number; min_seconds?: number }
    try {
      const want = Math.min(5, Math.max(1, Number(input.count) || 1))
      const found = await searchStock(settings, String(input.query ?? ''), input.orientation ?? 'portrait', 15, signal)
      const long = found.filter((c) => c.duration >= (Number(input.min_seconds) || 0))
      const chosen = (long.length ? long : found).slice(0, want)
      if (!chosen.length) return { content: 'Nothing found; try other words.', isError: false }
      const files: string[] = []
      for (const clip of chosen) files.push(await saveClip(where, clip, signal))
      const credits = chosen.map((clip, i) => creditLine(clip, files[i]))
      onSaved(files, credits)
      return {
        content: chosen.map((c, i) => `${files[i]} (${c.width}x${c.height}, ${c.duration} s, by ${c.author || c.provider})`).join('\n'),
        isError: false,
        sources: chosen.map((c) => ({ url: c.page, title: `${c.author || c.provider} (${c.provider})` })),
      }
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  })
}
