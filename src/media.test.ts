import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mediaSource, type MediaTarget } from './media'
import { fetchMedia, findMediaUrl, generateMedia } from './mediaJobs'
import { defaultSettings } from './storage'
import type { MediaKind, Settings } from './types'

// Calls the app made, and the answers a test gives them in order per URL.
interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: any
}

let calls: Call[]
let routes: [RegExp, (call: Call) => Response | Promise<Response>][]

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const file = (type: string) => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': type } })

beforeEach(() => {
  calls = []
  routes = []
  vi.useFakeTimers()
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
    const call = { url: input, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body }
    calls.push(call)
    const route = routes.find(([pattern]) => pattern.test(input))
    if (!route) throw new TypeError(`Failed to fetch ${input}`)
    return route[1](call)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function settingsWith(keys: Record<string, string>, extra: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), mediaKeys: keys, ...extra }
}

// Runs a generation to the end, letting its polling timers fire at once.
async function run(settings: Settings, target: MediaTarget, kind: MediaKind, progress: string[] = []) {
  const done = generateMedia({ settings, target, kind, prompt: 'um gato', onProgress: (p) => progress.push(p) })
  const settled = done.then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  for (let i = 0; i < 50; i++) await vi.runAllTimersAsync()
  const result = await settled
  if ('error' in result) throw result.error
  return result.value
}

describe('mediaSource', () => {
  it('picks the first source with a key and a default model', () => {
    const settings = settingsWith({ fal: 'k', elevenlabs: 'e' })
    expect(mediaSource(settings, 'image', false)).toMatchObject({ source: 'fal', model: 'fal-ai/flux/schnell' })
    expect(mediaSource(settings, 'video', false)?.source).toBe('fal')
    expect(mediaSource(settings, 'audio', false)?.source).toBe('elevenlabs')
    expect(mediaSource(settingsWith({ runware: 'r' }), 'video', false)).toBeNull()
    expect(mediaSource(settings, 'image', true)).toBeNull()
  })

  it('uses the OpenAI and Gemini keys for speech and Veo, after the media services', () => {
    const base = defaultSettings()
    const withKeys = (ids: string[], media: Record<string, string> = {}) => ({
      ...base,
      mediaKeys: media,
      providers: Object.fromEntries(
        Object.entries(base.providers).map(([id, p]) => [id, { ...p, apiKey: ids.includes(id) ? 'k' : '' }]),
      ),
    })
    const both = withKeys(['openai', 'gemini'])
    expect(mediaSource(both, 'audio', false)).toMatchObject({ source: 'openai', model: 'gpt-4o-mini-tts' })
    expect(mediaSource(both, 'video', false)).toMatchObject({
      source: 'gemini',
      model: 'veo-3.1-fast-generate-preview',
    })
    // A media service key, added for that, comes first.
    expect(mediaSource(withKeys(['openai'], { elevenlabs: 'e' }), 'audio', false)?.source).toBe('elevenlabs')
  })

  it('needs a model for a source chosen by hand that has no default', () => {
    const settings = settingsWith({ runware: 'r' })
    const choose = (model: string) => ({
      ...settings,
      media: { ...settings.media, video: { source: 'runware', model, options: '{"duration":5}' } },
    })
    expect(mediaSource(choose(''), 'video', false)).toBeNull()
    expect(mediaSource(choose('minimax:h3@0'), 'video', false)).toEqual({
      source: 'runware',
      model: 'minimax:h3@0',
      options: '{"duration":5}',
    })
  })
})

describe('generateMedia', () => {
  it('reads text aloud with an ElevenLabs voice, or makes sound effects', async () => {
    routes.push([/elevenlabs/, () => file('audio/mpeg')])
    const settings = settingsWith({ elevenlabs: 'xi' })
    const made = await run(settings, { source: 'elevenlabs', model: 'voz1', options: '' }, 'audio')
    expect(made).toEqual({ mime: 'audio/mpeg', data: 'AQID' })
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voz1?output_format=mp3_44100_128')
    expect(calls[0].headers['xi-api-key']).toBe('xi')
    expect(calls[0].body).toEqual({ text: 'um gato', model_id: 'eleven_multilingual_v2' })
    await run(settings, { source: 'elevenlabs', model: 'sound-effects', options: '{"duration_seconds":3}' }, 'audio')
    expect(calls[1].url).toBe('https://api.elevenlabs.io/v1/sound-generation')
    expect(calls[1].body).toEqual({ text: 'um gato', duration_seconds: 3 })
  })

  it('queues a Runware video, reports progress and downloads the result', async () => {
    let polls = 0
    routes.push([
      /api\.runware\.ai/,
      (call) => {
        const task = call.body[0]
        if (task.taskType === 'videoInference') return json({ data: [{ taskType: 'videoInference', taskUUID: task.taskUUID }] })
        polls++
        return json({
          data: [
            polls === 1
              ? { taskUUID: task.taskUUID, status: 'processing', progress: 47 }
              : { taskUUID: task.taskUUID, status: 'success', videoURL: 'https://vm.runware.ai/v/x.mp4', cost: 0.18 },
          ],
        })
      },
    ])
    routes.push([/vm\.runware\.ai/, () => file('video/mp4')])
    const progress: string[] = []
    const target = { source: 'runware', model: 'minimax:h3@0', options: '{"duration":6}' }
    const made = await run(settingsWith({ runware: 'rw' }), target, 'video', progress)
    expect(made).toEqual({ mime: 'video/mp4', data: 'AQID', url: 'https://vm.runware.ai/v/x.mp4', cost: 0.18 })
    expect(progress).toEqual(['47%'])
    expect(calls[0].headers.Authorization).toBe('Bearer rw')
    expect(calls[0].body[0]).toMatchObject({
      taskType: 'videoInference',
      model: 'minimax:h3@0',
      positivePrompt: 'um gato',
      deliveryMethod: 'async',
      includeCost: true,
      duration: 6,
    })
    expect(calls[1].body[0]).toEqual({ taskType: 'getResponse', taskUUID: calls[0].body[0].taskUUID })
  })

  it('reports a Runware error', async () => {
    routes.push([/api\.runware\.ai/, () => json({ errors: [{ message: 'Invalid model' }] })])
    await expect(
      run(settingsWith({ runware: 'rw' }), { source: 'runware', model: 'x', options: '' }, 'image'),
    ).rejects.toThrow('Runware: Invalid model')
  })

  it('follows the fal.ai queue to the result', async () => {
    let checks = 0
    routes.push([/\/status$/, () => json(++checks === 1 ? { status: 'IN_QUEUE', queue_position: 2 } : { status: 'COMPLETED' })])
    routes.push([/\/requests\/r1$/, () => json({ video: { url: 'https://v3.fal.media/files/v.mp4', content_type: 'video/mp4' } })])
    routes.push([
      /queue\.fal\.run\/fal-ai/,
      () =>
        json({
          request_id: 'r1',
          status_url: 'https://queue.fal.run/fal-ai/kling/requests/r1/status',
          response_url: 'https://queue.fal.run/fal-ai/kling/requests/r1',
        }),
    ])
    routes.push([/fal\.media/, () => file('video/mp4')])
    const progress: string[] = []
    const made = await run(settingsWith({ fal: 'fk' }), { source: 'fal', model: 'fal-ai/kling', options: '' }, 'video', progress)
    expect(made.data).toBe('AQID')
    expect(progress).toEqual(['na fila: 2'])
    expect(calls[0]).toMatchObject({ url: 'https://queue.fal.run/fal-ai/kling', method: 'POST', body: { prompt: 'um gato' } })
    expect(calls[0].headers.Authorization).toBe('Key fk')
  })

  it('reaches Higgsfield through the local proxy and reports moderation', async () => {
    const proxy = 'http://localhost:8787/'
    routes.push([
      /\/status$/,
      () => json({ status: 'completed', images: [{ url: 'https://cdn.higgsfield.ai/a.png' }] }),
    ])
    routes.push([
      /api\.higgsfield\.ai\/higgsfield-ai/,
      () => json({ status: 'queued', request_id: 'h1', status_url: 'https://api.higgsfield.ai/requests/h1/status' }),
    ])
    routes.push([/cdn\.higgsfield\.ai/, () => file('image/png')])
    const settings = settingsWith({ higgsfield: 'id:secret' }, { proxyUrl: 'http://localhost:8787' })
    const target = { source: 'higgsfield', model: 'higgsfield-ai/soul/v2/standard', options: '' }
    const made = await run(settings, target, 'image')
    expect(made.mime).toBe('image/png')
    expect(calls[0].url).toBe(`${proxy}https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard`)
    expect(calls[0].headers.Authorization).toBe('Key id:secret')
    expect(calls[1].url).toBe(`${proxy}https://api.higgsfield.ai/requests/h1/status`)

    routes[0] = [/\/status$/, () => json({ status: 'nsfw' })]
    await expect(run(settings, target, 'image')).rejects.toThrow('Higgsfield: o conteúdo foi barrado pela moderação')
    await expect(run({ ...settings, proxyUrl: '' }, target, 'image')).rejects.toThrow('só funciona pelo proxy local')
  })

  it('runs a Replicate model through the proxy, by name or by version', async () => {
    routes.push([
      /predictions\/p1$/,
      () => json({ status: 'succeeded', output: ['https://replicate.delivery/a/out.webp'] }),
    ])
    routes.push([
      /api\.replicate\.com\/v1\/(models|predictions)/,
      () =>
        json({
          id: 'p1',
          status: 'starting',
          urls: {
            get: 'https://api.replicate.com/v1/predictions/p1',
            cancel: 'https://api.replicate.com/v1/predictions/p1/cancel',
          },
        }),
    ])
    routes.push([/replicate\.delivery/, () => file('image/webp')])
    const settings = settingsWith({ replicate: 'r8' }, { proxyUrl: 'http://localhost:8787' })
    const made = await run(settings, { source: 'replicate', model: 'owner/flux', options: '{"seed":1}' }, 'image')
    expect(made.mime).toBe('image/webp')
    expect(calls[0].url).toBe('http://localhost:8787/https://api.replicate.com/v1/models/owner/flux/predictions')
    expect(calls[0].body).toEqual({ input: { prompt: 'um gato', seed: 1 } })
    expect(calls[0].headers.Authorization).toBe('Bearer r8')
    await run(settings, { source: 'replicate', model: 'owner/flux:abc123', options: '' }, 'image')
    const byVersion = calls.find((c) => c.url.endsWith('/v1/predictions') && c.method === 'POST')
    expect(byVersion?.body).toEqual({ version: 'abc123', input: { prompt: 'um gato' } })
  })

  it('polls a WaveSpeedAI prediction and reports its failure', async () => {
    let state = 'completed'
    routes.push([
      /predictions\/w1\/result$/,
      () =>
        json({
          data: { status: state, outputs: ['https://cdn.wavespeed.ai/o/v.mp4'], error: 'sem créditos' },
        }),
    ])
    routes.push([/api\.wavespeed\.ai\/api\/v3\/alibaba/, () => json({ data: { id: 'w1', status: 'created' } })])
    routes.push([/cdn\.wavespeed\.ai/, () => file('video/mp4')])
    const settings = settingsWith({ wavespeed: 'ws' })
    const target = { source: 'wavespeed', model: 'alibaba/wan-2.7/text-to-video', options: '' }
    expect((await run(settings, target, 'video')).url).toBe('https://cdn.wavespeed.ai/o/v.mp4')
    expect(calls[0].headers.Authorization).toBe('Bearer ws')
    state = 'failed'
    await expect(run(settings, target, 'video')).rejects.toThrow('WaveSpeedAI: sem créditos')
  })

  it('makes a Veo video with the Gemini key and downloads it with the key', async () => {
    const base = 'https://generativelanguage.googleapis.com/v1beta'
    let checks = 0
    routes.push([
      /operations\/op1$/,
      () =>
        json(
          ++checks === 1
            ? { name: 'models/veo/operations/op1' }
            : {
                done: true,
                response: {
                  generateVideoResponse: { generatedSamples: [{ video: { uri: `${base}/files/f1:download?alt=media` } }] },
                },
              },
        ),
    ])
    routes.push([/:predictLongRunning$/, () => json({ name: 'models/veo/operations/op1' })])
    routes.push([/files\/f1:download/, () => file('video/mp4')])
    const settings = defaultSettings()
    settings.providers.gemini = { ...settings.providers.gemini, apiKey: 'gk' }
    const target = { source: 'gemini', model: 'veo-3.1-fast-generate-preview', options: '{"aspectRatio":"9:16"}' }
    const made = await run(settings, target, 'video')
    expect(made).toEqual({ mime: 'video/mp4', data: 'AQID' })
    expect(calls[0].url).toBe(`${base}/models/veo-3.1-fast-generate-preview:predictLongRunning`)
    expect(calls[0].headers['x-goog-api-key']).toBe('gk')
    expect(calls[0].body).toEqual({ instances: [{ prompt: 'um gato' }], parameters: { aspectRatio: '9:16' } })
    expect(calls[1].url).toBe(`${base}/models/veo/operations/op1`)
    expect(calls.at(-1)!.headers['x-goog-api-key']).toBe('gk')

    // The link needs the key, so a failed download is an error, not a link.
    routes.unshift([/files\/f1:download/, () => json({}, 403)])
    checks = 1
    await expect(run(settings, target, 'video')).rejects.toThrow('não pôde ser baixado do Gemini')

    // A video blocked by Google's filters says why.
    routes.unshift([
      /operations\/op1$/,
      () => json({ done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['pessoas reais'] } } }),
    ])
    await expect(run(settings, target, 'video')).rejects.toThrow('Veo: o conteúdo foi barrado pela moderação (pessoas reais)')
  })

  it('reads text aloud with OpenAI, with a voice and tone of choice', async () => {
    routes.push([/audio\/speech$/, () => file('audio/mpeg')])
    const settings = defaultSettings()
    settings.providers.openai = { ...settings.providers.openai, apiKey: 'sk' }
    const target = { source: 'openai', model: 'gpt-4o-mini-tts', options: '{"voice":"coral","instructions":"alegre"}' }
    expect(await run(settings, target, 'audio')).toEqual({ mime: 'audio/mpeg', data: 'AQID' })
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/speech')
    expect(calls[0].headers.Authorization).toBe('Bearer sk')
    expect(calls[0].body).toEqual({
      model: 'gpt-4o-mini-tts',
      input: 'um gato',
      voice: 'coral',
      response_format: 'mp3',
      instructions: 'alegre',
    })
  })

  it('says when a key is refused or the options are not JSON', async () => {
    routes.push([/elevenlabs/, () => json({ detail: { message: 'bad key' } }, 401)])
    const settings = settingsWith({ elevenlabs: 'xi' })
    await expect(run(settings, { source: 'elevenlabs', model: 'v', options: '' }, 'audio')).rejects.toThrow(
      'ElevenLabs recusou a chave (401).',
    )
    await expect(run(settings, { source: 'elevenlabs', model: 'v', options: '[1]' }, 'audio')).rejects.toThrow(
      'não são um objeto JSON válido',
    )
  })
})

describe('stopping', () => {
  it('cancels a queued fal.ai job', async () => {
    routes.push([/\/status$/, () => json({ status: 'IN_QUEUE', queue_position: 1 })])
    routes.push([/\/cancel$/, () => json({ status: 'CANCELLATION_REQUESTED' }, 202)])
    routes.push([
      /queue\.fal\.run\/fal-ai\/kling$/,
      () =>
        json({
          request_id: 'r1',
          status_url: 'https://queue.fal.run/fal-ai/kling/requests/r1/status',
          cancel_url: 'https://queue.fal.run/fal-ai/kling/requests/r1/cancel',
        }),
    ])
    const abort = new AbortController()
    const settings = settingsWith({ fal: 'fk' })
    const done = generateMedia({
      settings,
      target: { source: 'fal', model: 'fal-ai/kling', options: '' },
      kind: 'video',
      prompt: 'p',
      signal: abort.signal,
    }).catch((err) => err)
    await vi.advanceTimersByTimeAsync(5000)
    abort.abort()
    await done
    const cancel = calls.find((c) => c.url.endsWith('/cancel'))
    expect(cancel).toMatchObject({ method: 'PUT', headers: { Authorization: 'Key fk' } })
  })
})

describe('fetchMedia', () => {
  it('tries the local proxy, then keeps the link', async () => {
    routes.push([/^http:\/\/localhost:8787\//, () => file('video/mp4')])
    const viaProxy = await fetchMedia('https://cdn.example/x.mp4', 'video', 'http://localhost:8787')
    expect(viaProxy.data).toBe('AQID')
    const linkOnly = await fetchMedia('https://cdn.example/x.webm', 'video', undefined)
    expect(linkOnly).toEqual({ mime: 'video/webm', data: '', url: 'https://cdn.example/x.webm' })
  })
})

describe('findMediaUrl', () => {
  it('finds the file of the right kind wherever the service put it', () => {
    const result = {
      thumbnail: { url: 'https://x/thumb.png', content_type: 'image/png' },
      audio_file: { url: 'https://x/song', content_type: 'audio/wav' },
    }
    expect(findMediaUrl(result, 'audio')).toBe('https://x/song')
    expect(findMediaUrl({ images: [{ url: 'https://x/a.jpg' }] }, 'image')).toBe('https://x/a.jpg')
    expect(findMediaUrl({ nothing: true }, 'video')).toBeUndefined()
  })
})
