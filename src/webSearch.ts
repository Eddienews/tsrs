import { post } from './extensions'
import type { ToolDef } from './stream'
import { localTools, type ToolSet } from './tools'
import type { Settings, Source } from './types'

// Web search with the user's own key, run by the TSRS server (server/search.mjs):
// it works with every model, and every model gets the same results.
export const SEARCH_SERVICES = [
  { id: 'brave', name: 'Brave Search', keyUrl: 'https://api-dashboard.search.brave.com/app/keys' },
  { id: 'tavily', name: 'Tavily', keyUrl: 'https://app.tavily.com/home' },
  { id: 'google', name: 'Google (Programmable Search)', keyUrl: 'https://developers.google.com/custom-search/v1/introduction' },
  { id: 'kagi', name: 'Kagi', keyUrl: 'https://kagi.com/settings?p=api' },
] as const

// Where the key of each service is kept: with the media keys, so the
// password protection and the backups (which leave keys out) cover it.
export const searchKeyId = (service: string) => `search:${service}`

export function ownSearch(settings: Settings): { provider: string; key: string; cx?: string } | null {
  const provider = settings.ownSearch?.provider
  if (!provider || provider === 'off') return null
  const key = settings.mediaKeys[searchKeyId(provider)]?.trim()
  if (!key) return null
  if (provider === 'google' && !settings.ownSearch?.googleCx?.trim()) return null
  return { provider, key, ...(provider === 'google' ? { cx: settings.ownSearch!.googleCx!.trim() } : {}) }
}

export const WEB_TOOLS: ToolDef[] = [
  {
    name: 'search_web',
    description:
      'Search the web. Returns titles, addresses and snippets; read the pages that matter with ' +
      'read_page before relying on them. Use several focused searches rather than one broad one.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
        count: { type: 'number', description: 'How many results, 1 to 20 (default 8).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_page',
    description: 'Read the text of a web page by its address.',
    schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The full http(s) address.' } },
      required: ['url'],
    },
  },
]

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export function formatResults(results: SearchResult[]): string {
  if (!results.length) return 'No results.'
  return results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`.trim()).join('\n\n')
}

// The search and reading tools; the pages found and read come back as
// sources, listed under the reply.
export function webToolSet(settings: Settings): ToolSet | null {
  const service = ownSearch(settings)
  if (!service) return null
  return localTools(WEB_TOOLS, 'Web', async (call) => {
    const input = (call.input ?? {}) as { query?: string; count?: number; url?: string }
    try {
      if (call.name === 'search_web') {
        const { results } = await post<{ results: SearchResult[] }>('/search', { ...service, query: input.query, count: input.count })
        return {
          content: formatResults(results),
          isError: false,
          sources: results.map((r) => ({ url: r.url, title: r.title })),
        }
      }
      const page = await post<{ url: string; title: string; text: string }>('/read', { url: input.url })
      return {
        content: `# ${page.title || page.url}\n${page.url}\n\n${page.text}`,
        isError: false,
        sources: [{ url: page.url, title: page.title }],
      }
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  })
}

// Sources after the ones already there, each address once.
export function withSources(current: Source[] | undefined, more: Source[]): Source[] {
  const seen = new Set((current ?? []).map((s) => s.url))
  return [...(current ?? []), ...more.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))]
}
