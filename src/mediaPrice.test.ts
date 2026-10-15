import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { estimateCost } from './mediaPrice'
import { defaultSettings } from './storage'

let asked: { url: string; headers: Record<string, string> }[]

beforeEach(() => {
  asked = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    asked.push({ url, headers: (init.headers ?? {}) as Record<string, string> })
    const json = (value: unknown) => new Response(JSON.stringify(value))
    if (url.startsWith('https://api.fal.ai/v1/models/pricing')) {
      return json({ prices: [{ endpoint_id: 'x', unit_price: 0.07, unit: 'second', currency: 'USD' }] })
    }
    if (url.endsWith('/index.json')) {
      return json([{ air: 'minimax:h3@0', schema: 'https://runware.ai/docs/models/minimax-h3/schema.json' }])
    }
    if (url.endsWith('/schema.json')) {
      return json({
        info: {
          'x-pricing': {
            rates: [
              { display: '$0.05 per second', label: '480p' },
              { display: '$0.10 per second', label: '720p' },
            ],
          },
        },
      })
    }
    throw new TypeError('Failed to fetch')
  })
})

afterEach(() => vi.unstubAllGlobals())

// Currency formats put a no-break space after the symbol.
const plain = (text: string | undefined) => text?.replace(/\u00a0/g, ' ')

test('prices a Veo video from the price list, by resolution and length', async () => {
  const settings = defaultSettings()
  const fast = { source: 'gemini', model: 'veo-3.1-fast-generate-preview', options: '' }
  expect(plain((await estimateCost(settings, fast, 'video'))?.text)).toBe(
    'cerca de US$ 0,80 (8 s em 720p, a US$ 0,10 por segundo)',
  )
  const long = { ...fast, options: '{"resolution":"1080p","durationSeconds":6}' }
  expect(plain((await estimateCost(settings, long, 'video'))?.text)).toMatch(/^cerca de US\$ 0,72 /)
  expect(await estimateCost(settings, { ...fast, model: 'veo-9' }, 'video')).toBeNull()
})

test("asks fal.ai and Runware for their prices, and says nothing for the others", async () => {
  const settings = { ...defaultSettings(), mediaKeys: { fal: 'fk' } }
  const kling = { source: 'fal', model: 'fal-ai/kling', options: '{"duration":"5"}' }
  const fal = await estimateCost(settings, kling, 'video')
  expect(plain(fal?.text)).toBe('cerca de US$ 0,35 (5 s a US$ 0,07 por segundo)')
  expect(fal?.source).toBe('fal.ai')
  expect(asked[0].headers.Authorization).toBe('Key fk')
  const h3 = { source: 'runware', model: 'minimax:h3@0', options: '' }
  expect((await estimateCost(settings, h3, 'video'))?.text).toBe('$0.05 per second (480p); $0.10 per second (720p)')
  expect(await estimateCost(settings, { source: 'replicate', model: 'a/b', options: '' }, 'video')).toBeNull()
})
