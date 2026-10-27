import { expect, test } from '@playwright/test'
import { freeOllama, makeImage, sdcppStatus } from '../server/sdcpp.mjs'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// A fake sd-server: capabilities, a job queue and the job's states in turn,
// recording what it was sent.
function sdServer(states: object[], modes = ['img_gen']) {
  const sent: { body?: any; polls: number; cancelled: string[] } = { polls: 0, cancelled: [] }
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/sdcpp/v1/capabilities')) return json({ model: { stem: 'z_image_turbo-Q4_K' }, supported_modes: modes })
    if (url.endsWith('/sdcpp/v1/img_gen')) {
      sent.body = JSON.parse(String(init?.body))
      return json({ id: 'job_1', status: 'queued', poll_url: '/sdcpp/v1/jobs/job_1' }, 202)
    }
    if (url.endsWith('/sdcpp/v1/jobs/job_1/cancel')) {
      sent.cancelled.push('job_1')
      return json({ id: 'job_1', status: 'cancelled' })
    }
    if (url.endsWith('/sdcpp/v1/jobs/job_1')) return json(states[Math.min(sent.polls++, states.length - 1)])
    throw new TypeError('fetch failed')
  }
  return { fetchImpl, sent }
}

const done = { status: 'completed', result: { output_format: 'png', images: [{ index: 0, b64_json: 'CQk=' }] }, error: null }

test('queues an image on sd-server, waits for the job and returns the PNG', async () => {
  const { fetchImpl, sent } = sdServer([{ status: 'queued' }, { status: 'generating' }, done])
  const made = await makeImage({ prompt: 'a red bicycle', width: 1000, height: 700, seed: 1 }, fetchImpl, async () => {})
  expect(made).toEqual({ mime: 'image/png', data: 'CQk=', seed: 1, model: 'z_image_turbo-Q4_K' })
  expect(sent.polls).toBe(3)
  // Sizes are rounded to multiples of 16; steps and guidance stay sd-server's.
  expect(sent.body).toEqual({ prompt: 'a red bicycle', width: 1008, height: 704, seed: 1, batch_count: 1, output_format: 'png' })
})

test('sends up to 3 attached images as references and refuses other formats', async () => {
  const { fetchImpl, sent } = sdServer([done])
  const images = ['AQ==', 'Ag==', 'Aw==', 'BA=='].map((data) => ({ mime: 'image/png', data }))
  await makeImage({ prompt: 'same cat, new pose', images }, fetchImpl, async () => {})
  expect(sent.body.ref_images).toEqual(['data:image/png;base64,AQ==', 'data:image/png;base64,Ag==', 'data:image/png;base64,Aw=='])
  expect(sent.body).toMatchObject({ width: 1024, height: 1024 })
  await expect(makeImage({ prompt: 'x', images: [{ mime: 'image/gif', data: 'AQ==' }] }, fetchImpl, async () => {})).rejects.toThrow('PNG')
  await expect(makeImage({ prompt: ' ' }, fetchImpl, async () => {})).rejects.toThrow('Describe')
})

test('reports a failed job, a model that makes no images and an sd-server that is not running', async () => {
  const failed = sdServer([{ status: 'failed', error: { code: 'generation_failed', message: 'out of memory' } }])
  await expect(makeImage({ prompt: 'a' }, failed.fetchImpl, async () => {})).rejects.toThrow('sd-server: out of memory')
  const video = sdServer([done], ['vid_gen'])
  await expect(makeImage({ prompt: 'a' }, video.fetchImpl, async () => {})).rejects.toThrow('does not make images')
  const down = async () => {
    throw new TypeError('fetch failed')
  }
  await expect(makeImage({ prompt: 'a' }, down, async () => {})).rejects.toThrow('sd-server is not answering at http://127.0.0.1:1234')
  expect(await sdcppStatus(down)).toMatchObject({ ok: false })
})

test('stops waiting and cancels the job on sd-server when the user stops', async () => {
  const { fetchImpl, sent } = sdServer([{ status: 'queued' }, { status: 'generating' }, done])
  const stop = new AbortController()
  // Stopped while waiting for the second poll.
  const wait = async () => {
    if (sent.polls === 1) stop.abort()
  }
  await expect(makeImage({ prompt: 'a' }, fetchImpl, wait, stop.signal)).rejects.toThrow('stopped')
  expect(sent.polls).toBe(1)
  expect(sent.cancelled).toEqual(['job_1'])
  // Stopped before the job was queued: nothing is sent.
  const early = sdServer([done])
  await expect(makeImage({ prompt: 'a' }, early.fetchImpl, async () => {}, AbortSignal.abort())).rejects.toThrow('stopped')
  expect(early.sent.body).toBeUndefined()
  expect(early.sent.cancelled).toEqual([])
})

test('says what sd-server has loaded, and when another program holds its port', async () => {
  expect(await sdcppStatus(sdServer([done]).fetchImpl)).toMatchObject({ ok: true, model: 'z_image_turbo-Q4_K', modes: ['img_gen'] })
  const other = async () => new Response('Not Found', { status: 404 })
  expect(await sdcppStatus(other)).toMatchObject({ ok: false, error: expect.stringContaining('is not sd-server') })
})

// A fake Ollama next to the fake sd-server: one model on the GPU, one on the
// CPU only; an unloaded model leaves the list after one more look.
function withOllama(server: ReturnType<typeof sdServer>) {
  const ollama = { models: [{ model: 'qwen3:8b', size_vram: 6_000_000_000 }, { model: 'tiny:1b', size_vram: 0 }], unloaded: [] as string[], sdQueuedAfter: [] as string[] }
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (url === 'http://127.0.0.1:11434/api/ps') {
      const listed = { models: ollama.models }
      ollama.models = ollama.models.filter((m) => !ollama.unloaded.includes(m.model))
      return json(listed)
    }
    if (url === 'http://127.0.0.1:11434/api/generate') {
      const body = JSON.parse(String(init?.body))
      expect(body.keep_alive).toBe(0)
      ollama.unloaded.push(body.model)
      return json({ model: body.model, done: true, done_reason: 'unload' })
    }
    if (url.endsWith('/sdcpp/v1/img_gen')) ollama.sdQueuedAfter = [...ollama.unloaded]
    return server.fetchImpl(url, init)
  }
  return { fetchImpl, ollama }
}

test('unloads the Ollama models on the GPU before the image, so the card has room', async () => {
  const { fetchImpl, ollama } = withOllama(sdServer([done]))
  await makeImage({ prompt: 'a' }, fetchImpl, async () => {})
  // Only the model in video memory, and before sd-server was asked.
  expect(ollama.unloaded).toEqual(['qwen3:8b'])
  expect(ollama.sdQueuedAfter).toEqual(['qwen3:8b'])
  expect(await freeOllama(fetchImpl, async () => {})).toEqual([])
})

test('leaves Ollama alone when asked to, or when sd-server runs elsewhere', async () => {
  for (const [name, value] of [['TSRS_SDCPP_KEEP_OLLAMA', '1'], ['TSRS_SDCPP', 'http://192.168.1.20:1234']]) {
    process.env[name] = value
    try {
      const { fetchImpl, ollama } = withOllama(sdServer([done]))
      expect(await freeOllama(fetchImpl, async () => {})).toEqual([])
      expect(ollama.unloaded).toEqual([])
    } finally {
      delete process.env[name]
    }
  }
  // An Ollama that is not running does not stop the image.
  expect(await freeOllama(sdServer([done]).fetchImpl, async () => {})).toEqual([])
})

test('a stop while Ollama unloads sends nothing to sd-server, and a stalled Ollama does not hold the image', async () => {
  const server = sdServer([done])
  const { fetchImpl, ollama } = withOllama(server)
  const stop = new AbortController()
  // Stopped during the wait for the unloaded model to leave Ollama's list.
  await expect(makeImage({ prompt: 'a' }, fetchImpl, async () => stop.abort(), stop.signal)).rejects.toThrow('stopped')
  expect(ollama.unloaded).toEqual(['qwen3:8b'])
  expect(server.sent.body).toBeUndefined()
  // An Ollama that takes the connection and never answers: the wait ends with the signal (or after 10 s).
  const stalled = () => new Promise<Response>(() => {})
  const gone = new AbortController()
  setTimeout(() => gone.abort(), 50)
  expect(await freeOllama(stalled, async () => {}, gone.signal)).toEqual([])
})
