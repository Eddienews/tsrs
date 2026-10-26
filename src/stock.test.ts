import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from './i18n'
import { creditLine, stockKeyId, stockServices, stockToolSet, type StockClip } from './stock'
import type { Settings } from './types'

const settings = (keys: Record<string, string>) => ({ mediaKeys: keys }) as unknown as Settings
const clip: StockClip = {
  provider: 'pexels',
  id: '7',
  url: 'https://videos.pexels.com/7.mp4',
  width: 1080,
  height: 1920,
  duration: 12,
  page: 'https://www.pexels.com/video/7/',
  author: 'Ana',
  authorUrl: 'https://www.pexels.com/@ana',
  thumbnail: '',
}

afterEach(() => vi.unstubAllGlobals())

describe('stock video', () => {
  it('uses the services with a key, Pexels first', () => {
    expect(stockServices(settings({}))).toEqual([])
    expect(stockServices(settings({ [stockKeyId('pixabay')]: ' pb ', [stockKeyId('pexels')]: 'px' }))).toEqual([
      { id: 'pexels', key: 'px' },
      { id: 'pixabay', key: 'pb' },
    ])
    expect(stockToolSet(settings({}), () => undefined, () => {})).toBeNull()
  })

  it('credits the author and the service', () => {
    expect(creditLine(clip, 'midia/stock/pexels-7.mp4')).toBe(
      '- `midia/stock/pexels-7.mp4`: vídeo de [Ana](https://www.pexels.com/@ana) no [Pexels](https://www.pexels.com/video/7/)',
    )
    expect(creditLine({ ...clip, author: '', authorUrl: '' })).toBe('- vídeo de Pexels no [Pexels](https://www.pexels.com/video/7/)')
  })

  it('searches, falls back to the next service and saves the clips it picks', async () => {
    const calls: { path: string; body: any }[] = []
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      const body = JSON.parse(init.body)
      calls.push({ path: url, body })
      if (url.endsWith('/stock/search')) {
        if (body.provider === 'pexels') return new Response(JSON.stringify({ clips: [] }))
        return new Response(JSON.stringify({ clips: [{ ...clip, provider: 'pixabay', id: '1', duration: 3 }, { ...clip, provider: 'pixabay', id: '2', duration: 15 }] }))
      }
      return new Response(JSON.stringify({ name: `midia/stock/${body.name}.mp4` }))
    })
    const saved: { files: string[]; credits: string[] }[] = []
    const set = stockToolSet(
      settings({ [stockKeyId('pexels')]: 'px', [stockKeyId('pixabay')]: 'pb' }),
      () => ({ path: '/p', name: 'p' }),
      (files, credits) => saved.push({ files, credits }),
    )!
    const result = await set.run({ id: 'c', name: 'project_stock_video', input: { query: 'sea', min_seconds: 10 } })
    expect(result.isError).toBe(false)
    expect(result.content).toBe('midia/stock/pixabay-2.mp4 (1080x1920, 15 s, by Ana)')
    expect(calls.map((c) => [c.path.replace(/^.*__tsrs\/projects/, ''), c.body.provider ?? c.body.name])).toEqual([
      ['/stock/search', 'pexels'],
      ['/stock/search', 'pixabay'],
      ['/stock/download', 'pixabay-2'],
    ])
    expect(calls[1].body).toMatchObject({ key: 'pb', query: 'sea', orientation: 'portrait' })
    expect(saved[0].files).toEqual(['midia/stock/pixabay-2.mp4'])
    expect(saved[0].credits[0]).toContain('[Pixabay]')
  })
})

it('the credits line follows the interface language', () => {
  const clip = { provider: 'pexels', author: '', authorUrl: '', page: 'https://www.pexels.com/video/7/' } as unknown as StockClip
  setLanguage('en')
  try {
    expect(creditLine(clip)).toBe('- video by Pexels on [Pexels](https://www.pexels.com/video/7/)')
  } finally {
    setLanguage('pt')
  }
})
