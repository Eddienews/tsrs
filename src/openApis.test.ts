import { afterEach, expect, test, vi } from 'vitest'
import { OPEN_APIS, catalogHost, describeOpenApi, findOpenApis, runOpenApiTool } from './openApis'

afterEach(() => vi.unstubAllGlobals())

test('every API in the catalogue is https, with its own id and an answer on its terms', () => {
  expect(new Set(OPEN_APIS.map((a) => a.id)).size).toBe(OPEN_APIS.length)
  for (const api of OPEN_APIS) {
    expect(api.example.startsWith('https://')).toBe(true)
    expect(api.docs.startsWith('https://')).toBe(true)
    if (api.use === 'attribution' || api.use === 'non-commercial') expect(api.credit).toBeTruthy()
  }
})

test('finds APIs by what the page needs, in English or Portuguese words', () => {
  expect(findOpenApis('exchange rates dollar').map((a) => a.id)).toContain('frankfurter')
  expect(findOpenApis('weather forecast')[0].category).toBe('weather')
  expect(findOpenApis('CEP brasileiro').map((a) => a.id)).toContain('brasilapi')
  expect(findOpenApis('museum paintings', 'art').every((a) => a.category === 'art')).toBe(true)
  expect(findOpenApis('zzzz')).toEqual([])
  const open = OPEN_APIS.find((a) => a.id === 'open-meteo')!
  expect(describeOpenApi(open)).toContain('free for non-commercial work only')
  expect(describeOpenApi(open)).toContain('credit: Weather data by Open-Meteo.com')
})

test('fetches only the catalogue hosts, over https', () => {
  expect(catalogHost('https://api.frankfurter.app/latest')?.id).toBe('frankfurter')
  expect(catalogHost('http://api.frankfurter.app/latest')).toBeNull()
  expect(catalogHost('https://example.com/x')).toBeNull()
  expect(catalogHost('not a url')).toBeNull()
})

test('a fetch for a video is saved in midia/ with its credit', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"rates":{"BRL":5.4}}', { headers: { 'content-type': 'application/json' } })),
  )
  const saved: { name: string; content: string; credit: string }[] = []
  const result = await runOpenApiTool(
    { id: '1', name: 'open_api_fetch', input: { url: 'https://api.frankfurter.app/latest?from=USD&to=BRL', save_as: 'cambio hoje.json' } },
    async (name, content, _encoding, credit) => {
      saved.push({ name, content, credit })
      return name
    },
  )
  expect(result.isError).toBe(false)
  expect(result.content).toContain('Saved as midia/cambio-hoje.json')
  expect(result.content).toContain('"BRL":5.4')
  expect(saved).toEqual([
    { name: 'midia/cambio-hoje.json', content: '{"rates":{"BRL":5.4}}', credit: 'midia/cambio-hoje.json: Frankfurter (https://frankfurter.dev/)' },
  ])
  const refused = await runOpenApiTool({ id: '2', name: 'open_api_fetch', input: { url: 'https://evil.example/x' } }, async () => '')
  expect(refused.isError).toBe(true)
})
