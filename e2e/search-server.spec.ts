import { expect, test } from '@playwright/test'
import { pageText, privateAddress, readPage, search } from '../server/search.mjs'

// A fetch that answers from a table and records what was asked.
function fake(answers: Record<string, { status?: number; body: unknown; headers?: Record<string, string> }>) {
  const asked: { url: string; init: any }[] = []
  const impl = async (url: string, init: any) => {
    asked.push({ url, init })
    const key = Object.keys(answers).find((k) => url.startsWith(k))
    const answer = key ? answers[key] : { status: 404, body: 'not found' }
    const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)
    return new Response(text, { status: answer.status ?? 200, headers: answer.headers })
  }
  return { impl: impl as typeof fetch, asked }
}

test('searches with each service and reads its answer the same way', async () => {
  const brave = fake({ 'https://api.search.brave.com': { body: { web: { results: [{ title: 'A', url: 'https://a', description: 'o <strong>A</strong>' }] } } } })
  expect(await search({ provider: 'brave', key: 'k', query: 'tsrs', count: 3 }, brave.impl)).toEqual([{ title: 'A', url: 'https://a', snippet: 'o A' }])
  expect(brave.asked[0].url).toBe('https://api.search.brave.com/res/v1/web/search?q=tsrs&count=3')
  expect(brave.asked[0].init.headers['X-Subscription-Token']).toBe('k')

  const tavily = fake({ 'https://api.tavily.com': { body: { results: [{ title: 'T', url: 'https://t', content: 'c' }] } } })
  expect(await search({ provider: 'tavily', key: 'tv', query: 'q' }, tavily.impl)).toEqual([{ title: 'T', url: 'https://t', snippet: 'c' }])
  expect(tavily.asked[0].init.headers.Authorization).toBe('Bearer tv')

  const google = fake({ 'https://www.googleapis.com': { body: { items: [{ title: 'G', link: 'https://g', snippet: 's' }] } } })
  await expect(search({ provider: 'google', key: 'gk', query: 'q' }, google.impl)).rejects.toThrow('cx')
  expect(await search({ provider: 'google', key: 'gk', cx: 'c1', query: 'q' }, google.impl)).toEqual([{ title: 'G', url: 'https://g', snippet: 's' }])

  const kagi = fake({ 'https://kagi.com': { body: { data: [{ t: 0, title: 'K', url: 'https://k', snippet: 's' }, { t: 1, list: [] }] } } })
  expect(await search({ provider: 'kagi', key: 'kk', query: 'q' }, kagi.impl)).toHaveLength(1)
  expect(kagi.asked[0].init.headers.Authorization).toBe('Bot kk')

  const refused = fake({ 'https://api.search.brave.com': { status: 401, body: { message: 'invalid token' } } })
  await expect(search({ provider: 'brave', key: 'x', query: 'q' }, refused.impl)).rejects.toThrow('Brave 401: invalid token')
  await expect(search({ provider: 'brave', key: '', query: 'q' }, refused.impl)).rejects.toThrow('No key')
})

test('reads public pages only, also after redirects', async () => {
  expect(privateAddress('http://localhost:5173/__tsrs/projects/list')).toBe(true)
  expect(privateAddress('http://192.168.0.1/admin')).toBe(true)
  expect(privateAddress('http://[::1]/')).toBe(true)
  expect(privateAddress('file:///etc/passwd')).toBe(true)
  expect(privateAddress('https://example.com/a')).toBe(false)
  await expect(readPage('http://127.0.0.1:5173/')).rejects.toThrow('public')

  const redirect = fake({ 'https://short.example': { status: 302, body: '', headers: { location: 'http://10.0.0.1/secret' } } })
  await expect(readPage('https://short.example/x', redirect.impl)).rejects.toThrow('public')
  expect(redirect.asked).toHaveLength(1)

  const page = fake({
    'https://news.example': {
      body: '<html><head><title>Notícia</title><style>x{}</style></head><body><nav>menu</nav><article><h1>Título</h1><p>Texto da notícia.</p></article></body></html>',
      headers: { 'content-type': 'text/html' },
    },
  })
  const read = await readPage('https://news.example/a', page.impl)
  expect(read).toEqual({ url: 'https://news.example/a', title: 'Notícia', text: '## Título\nTexto da notícia.' })
  expect(pageText('<p>a &amp; b &#233;</p>').text).toBe('a & b é')
})
