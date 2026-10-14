// Keeps the app shell available offline. Pages are fetched from the network
// first so a new build is picked up as soon as there is a connection; the
// build's files have hashed names and are served from the cache.
const CACHE = 'tsrs-v1'

async function precache() {
  const cache = await caches.open(CACHE)
  const page = await fetch('/', { cache: 'no-store' })
  const html = await page.clone().text()
  const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1])
  await cache.put('/', page)
  await cache.addAll(assets)
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

async function respond(request) {
  const cache = await caches.open(CACHE)
  if (request.mode === 'navigate') {
    try {
      const fresh = await fetch(request)
      cache.put('/', fresh.clone())
      return fresh
    } catch {
      return (await cache.match('/')) ?? Response.error()
    }
  }
  // The build's files are the same whatever headers the request carries.
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached) return cached
  const fresh = await fetch(request)
  if (fresh.ok) cache.put(request, fresh.clone())
  return fresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Requests to AI providers are never intercepted.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(respond(request))
})
