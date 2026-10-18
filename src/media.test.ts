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
    expect(made).toMatchObject({ mime: 'audio/mpeg', data: 'AQID' })
    // Seven characters at the list price of Multilingual v2.
    expect(made.cost).toBeCloseTo((7 / 1000) * 0.08, 10)
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

  it('runs a Krea model under its kind, polls the job and downloads the file', async () => {
    let state = 'processing'
    routes.push([
      /api\.krea\.ai\/jobs\/k1$/,
      () => {
        const now = state
        state = 'completed'
        return json({ job_id: 'k1', status: now, progress: 0.5, result: { urls: ['https://gen.krea.ai/o/v.mp4'] } })
      },
    ])
    routes.push([/api\.krea\.ai\/generate/, () => json({ job_id: 'k1', status: 'queued' })])
    routes.push([/gen\.krea\.ai/, () => file('video/mp4')])
    const settings = settingsWith({ krea: 'kr' })
    const progress: string[] = []
    const target = { source: 'krea', model: 'minimax/h3-max-turbo', options: '{"resolution":"1080p"}' }
    expect((await run(settings, target, 'video', progress)).mime).toBe('video/mp4')
    expect(calls[0].url).toBe('https://api.krea.ai/generate/video/minimax/h3-max-turbo')
    expect(calls[0].body).toEqual({ prompt: 'um gato', resolution: '1080p' })
    expect(calls[0].headers.Authorization).toBe('Bearer kr')
    expect(progress).toContain('50%')
    // A model typed with its kind keeps it; a failed job says why.
    routes.unshift([/api\.krea\.ai\/jobs\/k1$/, () => json({ job_id: 'k1', status: 'failed', error: { code: 'x', message: 'sem créditos' } })])
    await expect(run(settings, { source: 'krea', model: 'enhance/bytedance/seedvr-2', options: '' }, 'video')).rejects.toThrow('Krea: sem créditos')
    expect(calls.some((c) => c.url === 'https://api.krea.ai/generate/enhance/bytedance/seedvr-2')).toBe(true)
  })

  it('fills the fields Krea requires for its default image model and names a refused field', async () => {
    routes.push([/api\.krea\.ai\/jobs\/k2$/, () => json({ job_id: 'k2', status: 'completed', result: { urls: ['https://gen.krea.ai/o/i.png'] } })])
    routes.push([/api\.krea\.ai\/generate/, (call) =>
      call.body.aspect_ratio === '1:1'
        ? new Response(JSON.stringify({ error: 'Validation failed', details: [{ path: 'resolution' }] }), { status: 422 })
        : json({ job_id: 'k2', status: 'queued' })])
    routes.push([/gen\.krea\.ai/, () => file('image/png')])
    const settings = settingsWith({ krea: 'kr' })
    await run(settings, { source: 'krea', model: 'z-image/z-image', options: '' }, 'image')
    expect(calls[0].body).toEqual({ prompt: 'um gato', aspect_ratio: '16:9', resolution: '1K' })
    const typed = { source: 'krea', model: 'z-image/z-image', options: '{"aspect_ratio":"1:1","resolution":"2K"}' }
    await expect(run(settings, typed, 'image')).rejects.toThrow('Krea (422): Validation failed {"details":[{"path":"resolution"}]}')
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

  it('reads text aloud with Gemini, in a voice and style of choice', async () => {
    routes.push([
      /\/interactions$/,
      () =>
        json({
          steps: [
            { type: 'user_input' },
            { type: 'model_output', content: [{ type: 'audio', data: 'UklGRg==' }] },
          ],
        }),
    ])
    const settings = defaultSettings()
    settings.providers.gemini = { ...settings.providers.gemini, apiKey: 'gk' }
    const target = { source: 'gemini', model: 'gemini-3.8-flash-tts', options: '{"voice":"Puck","style":"alegre"}' }
    expect(await run(settings, target, 'audio')).toEqual({ mime: 'audio/wav', data: 'UklGRg==' })
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(calls[0].headers['x-goog-api-key']).toBe('gk')
    expect(calls[0].body).toEqual({
      model: 'gemini-3.8-flash-tts',
      input: [
        {
          type: 'user_input',
          content: [{ type: 'text', text: 'um gato', annotations: [{ type: 'speech_metadata', style: 'alegre' }] }],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'Puck' }] },
    })
  })

  it('sends Stability a form and reads the image it answers with', async () => {
    routes.push([/api\.stability\.ai/, () => file('image/png')])
    const settings = settingsWith({ stability: 'sk' })
    const target = { source: 'stability', model: 'core', options: '{"aspect_ratio":"16:9"}' }
    expect(await run(settings, target, 'image')).toEqual({ mime: 'image/png', data: 'AQID' })
    expect(calls[0].url).toBe('https://api.stability.ai/v2beta/stable-image/generate/core')
    expect(calls[0].headers).toEqual({ Authorization: 'Bearer sk', Accept: 'image/*' })
    const form = calls[0].body as FormData
    expect([...form.entries()]).toEqual([
      ['prompt', 'um gato'],
      ['output_format', 'png'],
      ['aspect_ratio', '16:9'],
    ])
  })

  it('polls Black Forest Labs and downloads the image through the proxy', async () => {
    routes.push([/\/get_result/, () => json({ status: 'Ready', result: { sample: 'https://delivery-eu1.bfl.ai/r/s.png' } })])
    routes.push([/api\.bfl\.ai\/v1\/flux-2-pro$/, () => json({ id: 'b1', polling_url: 'https://api.bfl.ai/v1/get_result?id=b1' })])
    // The delivery link refuses the browser, so only the proxy reaches it.
    routes.push([/^http:\/\/localhost:8787\/https:\/\/delivery/, () => file('image/png')])
    const settings = settingsWith({ bfl: 'bk' }, { proxyUrl: 'http://localhost:8787' })
    const made = await run(settings, { source: 'bfl', model: 'flux-2-pro', options: '' }, 'image')
    expect(made.data).toBe('AQID')
    expect(calls[0].url).toBe('http://localhost:8787/https://api.bfl.ai/v1/flux-2-pro')
    expect(calls[0].headers['x-key']).toBe('bk')
    routes[0] = [/\/get_result/, () => json({ status: 'Content Moderated' })]
    await expect(run(settings, { source: 'bfl', model: 'flux-2-pro', options: '' }, 'image')).rejects.toThrow(
      'Black Forest Labs: o conteúdo foi barrado pela moderação',
    )
  })

  it('makes MiniMax videos and speech', async () => {
    routes.push([/query\/video_generation\/t1$/, () => json({ status: 'succeeded', content: { url: 'https://cdn.minimax.io/v.mp4' } })])
    routes.push([/v2\/video_generation$/, () => json({ task_id: 't1' })])
    routes.push([/cdn\.minimax\.io/, () => file('video/mp4')])
    routes.push([/t2a_v2$/, () => json({ data: { audio: '010203' }, base_resp: { status_code: 0 } })])
    const settings = settingsWith({ minimax: 'mm' })
    await run(settings, { source: 'minimax', model: 'MiniMax-H3', options: '{"duration":6}' }, 'video')
    expect(calls[0].body).toEqual({ model: 'MiniMax-H3', content: [{ type: 'text', text: 'um gato' }], duration: 6 })
    expect(calls[0].headers.Authorization).toBe('Bearer mm')
    const voice = await run(settings, { source: 'minimax', model: 'Portuguese_Wiselady', options: '' }, 'audio')
    expect(voice).toEqual({ mime: 'audio/mpeg', data: 'AQID' })
    expect(calls.at(-1)!.body).toMatchObject({ text: 'um gato', voice_setting: { voice_id: 'Portuguese_Wiselady' } })

    routes[3] = [/t2a_v2$/, () => json({ base_resp: { status_code: 1004, status_msg: 'insufficient balance' } })]
    await expect(run(settings, { source: 'minimax', model: 'v', options: '' }, 'audio')).rejects.toThrow(
      'MiniMax: insufficient balance',
    )
  })

  it('reads text aloud with a Cartesia voice in the app language', async () => {
    routes.push([/api\.cartesia\.ai/, () => file('audio/mpeg')])
    await run(settingsWith({ cartesia: 'ck' }), { source: 'cartesia', model: 'voz1', options: '' }, 'audio')
    expect(calls[0].headers).toMatchObject({ Authorization: 'Bearer ck', 'Cartesia-Version': '2026-08-14' })
    expect(calls[0].body).toMatchObject({ model_id: 'sonic-3.6', transcript: 'um gato', voice: { id: 'voz1' }, language: 'pt' })
  })

  it('makes Grok Imagine videos with the xAI key', async () => {
    routes.push([/videos\/x1$/, () => json({ status: 'done', video: { url: 'https://vidgen.x.ai/v.mp4' } })])
    routes.push([/videos\/generations$/, () => json({ request_id: 'x1' })])
    routes.push([/vidgen\.x\.ai/, () => file('video/mp4')])
    const settings = defaultSettings()
    settings.providers.xai = { ...settings.providers.xai, apiKey: 'xk' }
    expect(mediaSource(settings, 'video', false)).toMatchObject({ source: 'xai', model: 'grok-imagine-video-1.5' })
    const made = await run(settings, { source: 'xai', model: 'grok-imagine-video-1.5', options: '' }, 'video')
    expect(made.data).toBe('AQID')
    expect(calls[0]).toMatchObject({
      url: 'https://api.x.ai/v1/videos/generations',
      body: { model: 'grok-imagine-video-1.5', prompt: 'um gato' },
      headers: { Authorization: 'Bearer xk' },
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
