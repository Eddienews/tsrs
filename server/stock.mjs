// Stock video from Pexels and Pixabay, for short videos: searched with the
// user's own key and downloaded into the project folder, with who made each
// clip so the credits can name them. Both APIs are free; Pixabay asks that
// results be cached for 24 hours, which this does for both.

import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const STOCK_SERVICES = ['pexels', 'pixabay']
const DAY = 24 * 3_600_000
const MAX_DOWNLOAD = 300 * 1024 * 1024

// Where clips may be downloaded from: the services' own file hosts.
const HOSTS = [/(^|\.)pexels\.com$/, /(^|\.)pixabay\.com$/, /^player\.vimeo\.com$/, /(^|\.)vimeocdn\.com$/]

// The tests point the services at a local stand-in: TSRS_PEXELS_API for the
// search, TSRS_STOCK_HOSTS (host:port, comma-separated) for its files.
const pexelsApi = () => (process.env.TSRS_PEXELS_API || 'https://api.pexels.com').replace(/\/+$/, '')
const extraHosts = () => (process.env.TSRS_STOCK_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)

export function stockHost(url) {
  try {
    const parsed = new URL(url)
    if (extraHosts().includes(parsed.host)) return true
    return parsed.protocol === 'https:' && HOSTS.some((host) => host.test(parsed.hostname))
  } catch {
    return false
  }
}

// The orientation a width and height have.
export function orientationOf(width, height) {
  if (!width || !height) return 'landscape'
  const ratio = width / height
  return ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square'
}

// The file to download among a clip's renditions: the right orientation
// first, then the smallest one whose short side reaches `wanted` (1080 by
// default), else the largest; 4K files are only taken when nothing else is.
export function pickFile(files, orientation, wanted = 1080) {
  const usable = files.filter((f) => f.url && f.width && f.height)
  if (!usable.length) return null
  const short = (f) => Math.min(f.width, f.height)
  const fitting = usable.filter((f) => orientationOf(f.width, f.height) === orientation)
  const pool = fitting.length ? fitting : usable
  const enough = pool.filter((f) => short(f) >= wanted && short(f) <= 2160).sort((a, b) => short(a) - short(b))
  if (enough.length) return enough[0]
  return [...pool].sort((a, b) => short(b) - short(a)).find((f) => short(f) <= 2160) ?? pool[0]
}

async function json(res, service) {
  const text = await res.text()
  if (!res.ok) {
    let message = text.slice(0, 300)
    try {
      const body = JSON.parse(text)
      message = body.error ?? body.message ?? message
    } catch {
      // Plain text.
    }
    throw new Error(`${service} ${res.status}: ${message}`)
  }
  return JSON.parse(text)
}

// Clips as { provider, id, url, width, height, duration, page, author, authorUrl, thumbnail }.
async function searchPexels({ key, query, orientation, count }, fetchImpl) {
  const params = new URLSearchParams({ query, per_page: String(count), orientation })
  const res = await fetchImpl(`${pexelsApi()}/videos/search?${params}`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await json(res, 'Pexels')
  return (body.videos ?? [])
    .map((video) => {
      const file = pickFile(
        (video.video_files ?? []).map((f) => ({ url: f.link, width: f.width, height: f.height })),
        orientation,
      )
      return file && {
        provider: 'pexels',
        id: String(video.id),
        url: file.url,
        width: file.width,
        height: file.height,
        duration: Number(video.duration) || 0,
        page: video.url ?? '',
        author: video.user?.name ?? '',
        authorUrl: video.user?.url ?? '',
        thumbnail: video.image ?? '',
      }
    })
    .filter(Boolean)
}

async function searchPixabay({ key, query, orientation, count }, fetchImpl) {
  // Pixabay has no orientation filter: more are asked for and sorted after.
  const params = new URLSearchParams({ key, q: query.slice(0, 100), per_page: String(Math.min(200, Math.max(3, count * 3))), safesearch: 'true' })
  const res = await fetchImpl(`https://pixabay.com/api/videos/?${params}`, { signal: AbortSignal.timeout(20_000) })
  const body = await json(res, 'Pixabay')
  const clips = (body.hits ?? [])
    .map((hit) => {
      const files = ['large', 'medium', 'small', 'tiny'].map((size) => hit.videos?.[size]).filter(Boolean)
      const file = pickFile(files.map((f) => ({ url: f.url, width: f.width, height: f.height })), orientation)
      return file && {
        provider: 'pixabay',
        id: String(hit.id),
        url: file.url,
        width: file.width,
        height: file.height,
        duration: Number(hit.duration) || 0,
        page: hit.pageURL ?? '',
        author: hit.user ?? '',
        authorUrl: hit.user && hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : '',
        thumbnail: hit.videos?.tiny?.thumbnail ?? '',
      }
    })
    .filter(Boolean)
  // The right orientation first, keeping the service's order within each group.
  const right = clips.filter((c) => orientationOf(c.width, c.height) === orientation)
  return [...right, ...clips.filter((c) => !right.includes(c))].slice(0, count)
}

const cache = new Map()

export async function searchStock({ provider, key, query, orientation = 'portrait', count = 10 }, fetchImpl = fetch, now = Date.now()) {
  const q = String(query ?? '').trim()
  if (!q) throw new Error('Say what to search for.')
  if (!STOCK_SERVICES.includes(provider)) throw new Error(`Unknown stock service: ${provider}`)
  if (!key) throw new Error(`No key for ${provider === 'pexels' ? 'Pexels' : 'Pixabay'}: add it in Settings → Media.`)
  const shape = ['portrait', 'landscape', 'square'].includes(orientation) ? orientation : 'portrait'
  const n = Math.min(40, Math.max(1, Number(count) || 10))
  const id = `${provider}|${shape}|${n}|${q.toLowerCase()}`
  const kept = cache.get(id)
  if (kept && now - kept.at < DAY) return kept.clips
  const clips = await (provider === 'pexels' ? searchPexels : searchPixabay)({ key, query: q, orientation: shape, count: n }, fetchImpl)
  cache.set(id, { at: now, clips })
  return clips
}

// Downloads a clip to `file`, following redirects by hand so every hop stays
// on the services' hosts, and stopping past 300 MB. A partial file is removed.
export async function downloadStock(url, file, fetchImpl = fetch) {
  let current = url
  let res
  for (let hop = 0; ; hop++) {
    if (!stockHost(current)) throw new Error('Only Pexels and Pixabay files can be downloaded.')
    res = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(120_000) })
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!next) break
    if (hop === 5) throw new Error('The download redirected too many times.')
    current = new URL(next, current).href
  }
  if (!res.ok || !res.body) throw new Error(`The download answered ${res.status}.`)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_DOWNLOAD) throw new Error('The clip passes 300 MB.')
  await mkdir(dirname(file), { recursive: true })
  const partial = `${file}.part`
  let size = 0
  const counted = Readable.fromWeb(res.body).on('data', (chunk) => {
    size += chunk.length
    if (size > MAX_DOWNLOAD) counted.destroy(new Error('The clip passes 300 MB.'))
  })
  try {
    await pipeline(counted, createWriteStream(partial))
    await rename(partial, file)
  } catch (error) {
    if (existsSync(partial)) await rm(partial, { force: true })
    throw error
  }
  return { file, size }
}
