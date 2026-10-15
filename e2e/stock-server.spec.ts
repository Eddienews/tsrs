import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { downloadStock, orientationOf, pickFile, searchStock, stockHost } from '../server/stock.mjs'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('picks the rendition that fits the shape, without 4K when there is less', () => {
  expect(orientationOf(1080, 1920)).toBe('portrait')
  expect(orientationOf(1920, 1080)).toBe('landscape')
  expect(orientationOf(1080, 1080)).toBe('square')
  const files = [
    { url: 'a', width: 3840, height: 2160 },
    { url: 'b', width: 1920, height: 1080 },
    { url: 'c', width: 1280, height: 720 },
    { url: 'd', width: 1080, height: 1920 },
    { url: 'e', width: 2160, height: 3840 },
  ]
  expect(pickFile(files, 'portrait')?.url).toBe('d')
  expect(pickFile(files, 'landscape')?.url).toBe('b')
  // Only small files of the shape: the largest of them.
  expect(pickFile([{ url: 's', width: 540, height: 960 }, { url: 't', width: 360, height: 640 }], 'portrait')?.url).toBe('s')
  // None of the shape: the best of the others, to be cropped.
  expect(pickFile(files.slice(0, 3), 'portrait')?.url).toBe('b')
  expect(pickFile([], 'portrait')).toBeNull()
})

test('searches Pexels and Pixabay with the user key, and caches for a day', async () => {
  const asked: { url: string; auth?: string }[] = []
  const fetchImpl = async (url: string, init: any) => {
    asked.push({ url, auth: init?.headers?.Authorization })
    if (url.startsWith('https://api.pexels.com/')) {
      return json({
        videos: [
          {
            id: 7,
            duration: 12,
            url: 'https://www.pexels.com/video/7/',
            image: 'https://images.pexels.com/7.jpg',
            user: { name: 'Ana', url: 'https://www.pexels.com/@ana' },
            video_files: [
              { link: 'https://videos.pexels.com/video-files/7/hd.mp4', width: 1080, height: 1920 },
              { link: 'https://videos.pexels.com/video-files/7/sd.mp4', width: 540, height: 960 },
            ],
          },
        ],
      })
    }
    return json({
      hits: [
        { id: 1, duration: 8, pageURL: 'https://pixabay.com/videos/1/', user: 'leo', user_id: 9, videos: { medium: { url: 'https://cdn.pixabay.com/1-m.mp4', width: 1920, height: 1080 } } },
        { id: 2, duration: 9, pageURL: 'https://pixabay.com/videos/2/', user: 'bia', user_id: 3, videos: { medium: { url: 'https://cdn.pixabay.com/2-m.mp4', width: 1080, height: 1920 } } },
      ],
    })
  }
  const now = Date.UTC(2026, 9, 15)
  const pexels = await searchStock({ provider: 'pexels', key: 'px-key', query: 'café', orientation: 'portrait', count: 3 }, fetchImpl, now)
  expect(pexels).toEqual([
    {
      provider: 'pexels',
      id: '7',
      url: 'https://videos.pexels.com/video-files/7/hd.mp4',
      width: 1080,
      height: 1920,
      duration: 12,
      page: 'https://www.pexels.com/video/7/',
      author: 'Ana',
      authorUrl: 'https://www.pexels.com/@ana',
      thumbnail: 'https://images.pexels.com/7.jpg',
    },
  ])
  expect(asked[0]).toEqual({ url: 'https://api.pexels.com/videos/search?query=caf%C3%A9&per_page=3&orientation=portrait', auth: 'px-key' })

  // Pixabay has no orientation filter: the portrait clip comes first.
  const pixabay = await searchStock({ provider: 'pixabay', key: 'pb-key', query: 'mar', orientation: 'portrait', count: 2 }, fetchImpl, now)
  expect(pixabay.map((c) => c.id)).toEqual(['2', '1'])
  expect(pixabay[0]).toMatchObject({ author: 'bia', authorUrl: 'https://pixabay.com/users/bia-3/' })
  expect(asked[1].url).toContain('key=pb-key&q=mar')

  // The same search within a day is not asked again.
  await searchStock({ provider: 'pixabay', key: 'pb-key', query: 'mar', orientation: 'portrait', count: 2 }, fetchImpl, now + 3_600_000)
  expect(asked).toHaveLength(2)
  await expect(searchStock({ provider: 'pexels', key: '', query: 'x' }, fetchImpl)).rejects.toThrow('No key for Pexels')
  await expect(searchStock({ provider: 'outro', key: 'k', query: 'x' }, fetchImpl)).rejects.toThrow('Unknown stock service')
  const failing = async () => json({ error: 'Invalid key' }, 401)
  await expect(searchStock({ provider: 'pexels', key: 'bad', query: 'erro' }, failing)).rejects.toThrow('Pexels 401: Invalid key')
})

test('downloads only from the services, following redirects there', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tsrs-stock-'))
  expect(stockHost('https://videos.pexels.com/a.mp4')).toBe(true)
  expect(stockHost('https://cdn.pixabay.com/a.mp4')).toBe(true)
  expect(stockHost('http://videos.pexels.com/a.mp4')).toBe(false)
  expect(stockHost('https://pexels.com.evil.example/a.mp4')).toBe(false)
  expect(stockHost('http://127.0.0.1:5173/')).toBe(false)

  const hops: string[] = []
  const fetchImpl = async (url: string) => {
    hops.push(url)
    if (url.endsWith('/start.mp4')) return new Response(null, { status: 302, headers: { location: 'https://videos.pexels.com/final.mp4' } })
    if (url.endsWith('/escape.mp4')) return new Response(null, { status: 302, headers: { location: 'http://192.168.0.1/x' } })
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-length': '4' } })
  }
  const file = join(folder, 'midia', 'stock', 'pexels-7.mp4')
  expect(await downloadStock('https://videos.pexels.com/start.mp4', file, fetchImpl)).toEqual({ file, size: 4 })
  expect([...(await readFile(file))]).toEqual([1, 2, 3, 4])
  expect(hops).toEqual(['https://videos.pexels.com/start.mp4', 'https://videos.pexels.com/final.mp4'])
  await expect(downloadStock('https://videos.pexels.com/escape.mp4', join(folder, 'x.mp4'), fetchImpl)).rejects.toThrow('Only Pexels and Pixabay')
  await expect(downloadStock('https://example.com/a.mp4', join(folder, 'y.mp4'), fetchImpl)).rejects.toThrow('Only Pexels and Pixabay')
  const big = async () => new Response(new Uint8Array(1), { status: 200, headers: { 'content-length': String(400 * 1024 * 1024) } })
  await expect(downloadStock('https://cdn.pixabay.com/big.mp4', join(folder, 'big.mp4'), big)).rejects.toThrow('300 MB')
  // Nothing half-written is left behind.
  expect((await readdir(folder)).sort()).toEqual(['midia'])
})
