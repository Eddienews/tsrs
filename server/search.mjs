// Web search with the user's own key (Brave, Tavily, Google, Kagi) and page
// reading, run by the TSRS server: these APIs refuse calls from browsers, and
// the answers are the same whatever model asks.

const LIMIT = 30_000

async function json(res, service) {
  const text = await res.text()
  if (!res.ok) {
    let message = text.slice(0, 300)
    try {
      const body = JSON.parse(text)
      message = body.error?.message ?? body.message ?? body.detail ?? body.error ?? message
    } catch {
      // The text itself.
    }
    throw new Error(`${service} ${res.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`)
  }
  return JSON.parse(text)
}

// Results as { title, url, snippet }.
export async function search({ provider, key, cx, query, count = 8 }, fetchImpl = fetch) {
  const q = String(query ?? '').trim()
  if (!q) throw new Error('The query is empty.')
  if (!key) throw new Error(`No key for ${provider}.`)
  const n = Math.min(20, Math.max(1, Number(count) || 8))
  const signal = AbortSignal.timeout(20_000)
  if (provider === 'brave') {
    const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q, count: String(n) })}`
    const body = await json(await fetchImpl(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key }, signal }), 'Brave')
    return (body.web?.results ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: strip(r.description ?? '') }))
  }
  if (provider === 'tavily') {
    const res = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: q, max_results: n }),
      signal,
    })
    const body = await json(res, 'Tavily')
    return (body.results ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.content ?? '' }))
  }
  if (provider === 'google') {
    if (!cx) throw new Error('Google needs the search engine ID (cx).')
    const url = `https://www.googleapis.com/customsearch/v1?${new URLSearchParams({ key, cx, q, num: String(Math.min(10, n)) })}`
    const body = await json(await fetchImpl(url, { signal }), 'Google')
    return (body.items ?? []).map((r) => ({ title: r.title ?? '', url: r.link ?? '', snippet: r.snippet ?? '' }))
  }
  if (provider === 'kagi') {
    const url = `https://kagi.com/api/v0/search?${new URLSearchParams({ q, limit: String(n) })}`
    const body = await json(await fetchImpl(url, { headers: { Authorization: `Bot ${key}` }, signal }), 'Kagi')
    return (body.data ?? []).filter((r) => r.t === 0).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.snippet ?? '' }))
  }
  throw new Error(`Unknown search service: ${provider}`)
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function strip(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
      e[0] === '#'
        ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
}

// The readable text of a page: no scripts, styles, menus or footers, with
// headings and list items on lines of their own.
export function pageText(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  let body = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|title)[\s\S]*?<\/\1>/gi, ' ')
  const main = /<(main|article)[\s\S]*?>([\s\S]*)<\/\1>/i.exec(body)
  if (main && main[2].length > 500) body = main[2]
  const text = strip(
    body
      .replace(/<(h[1-6])[^>]*>/gi, '\n\n## ')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<(p|div|br|tr|section)[^>]*>/gi, '\n'),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*(\n\s*)+/g, '\n\n')
    .trim()
  return { title: strip(title), text }
}

// Addresses the reader refuses: this computer and the local network, so a
// page read on the model's request cannot reach TSRS itself or the router.
export function privateAddress(url) {
  let host
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
    host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return true
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0') return true
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!ip) return false
  const [a, b] = [Number(ip[1]), Number(ip[2])]
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export async function readPage(url, fetchImpl = fetch) {
  // Redirects are followed by hand, so none can lead to a local address.
  let current = url
  let res
  for (let hop = 0; ; hop++) {
    if (privateAddress(current)) throw new Error('Only public http(s) pages can be read.')
    res = await fetchImpl(current, {
      headers: { 'User-Agent': 'Mozilla/5.0 (TSRS page reader)', Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!next) break
    if (hop === 5) throw new Error('The page redirected too many times.')
    current = new URL(next, current).href
  }
  if (!res.ok) throw new Error(`The page answered ${res.status}.`)
  const type = res.headers.get('content-type') ?? ''
  const raw = await res.text()
  const { title, text } = /html/i.test(type) || /<html|<body/i.test(raw.slice(0, 2000)) ? pageText(raw) : { title: '', text: raw.trim() }
  const cut = text.length > LIMIT ? `${text.slice(0, LIMIT)}\n\n[cut at ${LIMIT} characters]` : text
  return { url: current, title, text: cut }
}
