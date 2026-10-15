import { t } from './i18n'
import { mediaService, type MediaService, type MediaTarget } from './media'
import { connection } from './providers'
import { generateImage } from './stream'
import type { MediaKind, Settings } from './types'

// Making media: the request to each service, the wait for queued jobs (video
// and most audio take a while) and the download of the file, so that it stays
// in the chat after the service's link expires.

export interface GeneratedMedia {
  mime: string
  // Base64; empty when only `url` could be had.
  data: string
  url?: string
  // The prompt as the service rewrote it, when it did.
  revised?: string
  // US dollars, when the service says.
  cost?: number
}

interface Job {
  settings: Settings
  target: MediaTarget
  kind: MediaKind
  prompt: string
  signal?: AbortSignal
  // Progress to show while waiting, such as '47%'.
  onProgress?: (text: string) => void
}

// Files past this are kept as a link instead of being downloaded.
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024
// How long a queued job may take before giving up.
const MAX_WAIT_MS = 20 * 60_000

function parseOptions(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text)
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  } catch {
    // reported below
  }
  throw new Error(t('As opções do modelo não são um objeto JSON válido.'))
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    })
  })
}

function viaProxy(url: string, proxy: string | undefined): string {
  return proxy ? `${proxy.replace(/\/+$/, '')}/${url}` : url
}

// Who answers a request, for messages; and whether it is reached through
// the local proxy.
type Who = Pick<MediaService, 'name' | 'needsProxy'>

async function call(
  service: Who,
  url: string,
  init: RequestInit,
  proxy?: string,
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(viaProxy(url, proxy), init)
  } catch (err) {
    if (init.signal?.aborted) throw err
    throw new Error(
      proxy
        ? t('Não foi possível conectar ao proxy local em {url}. Inicie-o com npm run proxy.', { url: proxy })
        : t('Não foi possível conectar a {name}.', { name: service.name }),
    )
  }
  if (res.ok) return res
  if (res.status === 401 || res.status === 403) {
    throw new Error(t('{name} recusou a chave ({status}).', { name: service.name, status: res.status }))
  }
  const text = await res.text().catch(() => '')
  let message = text
  try {
    const json = JSON.parse(text)
    message = json.detail?.message ?? json.detail ?? json.message ?? json.error?.message ?? json.error ?? text
    if (Array.isArray(json.errors) && json.errors[0]?.message) message = json.errors[0].message
    if (typeof message !== 'string') message = JSON.stringify(message)
  } catch {
    // not JSON
  }
  throw new Error(`${service.name} (${res.status}): ${message.slice(0, 300)}`)
}

const binaryText = (bytes: Uint8Array) => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return binary
}

async function toBase64(blob: Blob): Promise<string> {
  return btoa(binaryText(new Uint8Array(await blob.arrayBuffer())))
}

const FALLBACK_MIME: Record<MediaKind, string> = {
  image: 'image/png',
  video: 'video/mp4',
  audio: 'audio/mpeg',
}

// Downloads a generated file so it outlives the service's link. When the
// service's storage refuses the browser, the local proxy is tried; failing
// that, or for a very large file, the link is kept instead.
export async function fetchMedia(
  url: string,
  kind: MediaKind,
  proxy: string | undefined,
  signal?: AbortSignal,
): Promise<GeneratedMedia> {
  const attempts = [url, ...(proxy ? [viaProxy(url, proxy)] : [])]
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt, { signal })
      if (!res.ok) continue
      if (Number(res.headers.get('content-length') ?? 0) > MAX_MEDIA_BYTES) break
      const blob = await res.blob()
      if (blob.size > MAX_MEDIA_BYTES) break
      const mime = blob.type && blob.type !== 'application/octet-stream' ? blob.type : mimeOf(url, kind)
      return { mime, data: await toBase64(blob), url }
    } catch (err) {
      if (signal?.aborted) throw err
    }
  }
  return { mime: mimeOf(url, kind), data: '', url }
}

const KNOWN_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
}

function extensionOf(url: string): string {
  return /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? ''
}

function mimeOf(url: string, kind: MediaKind): string {
  return KNOWN_MIME[extensionOf(url)] ?? FALLBACK_MIME[kind]
}

// The first file of the right kind anywhere in a service's result: services
// put it under images[].url, video.url, audio_file.url, or give bare URLs.
export function findMediaUrl(result: unknown, kind: MediaKind): string | undefined {
  const found: { url: string; type: string; field: boolean }[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      found.push({ url: value, type: '', field: false })
    }
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    const item = value as Record<string, unknown>
    if (typeof item.url === 'string' && /^https?:\/\//.test(item.url)) {
      found.push({ url: item.url, type: String(item.content_type ?? item.contentType ?? ''), field: true })
    }
    for (const [name, inner] of Object.entries(item)) if (name !== 'url') walk(inner)
  }
  walk(result)
  const byType = found.find((f) => f.type.startsWith(`${kind}/`))
  const byExtension = found.find((f) => !f.type && KNOWN_MIME[extensionOf(f.url)]?.startsWith(`${kind}/`))
  // A url field of unknown type is likely the file; a bare link may be anything.
  return (byType ?? byExtension ?? found.find((f) => f.field && !f.type))?.url
}

function tooSlow(service: Who): Error {
  return new Error(t('{name} demorou demais para responder.', { name: service.name }))
}

function proxyFor(settings: Settings, service: Who): string | undefined {
  if (!service.needsProxy) return undefined
  const proxy = settings.proxyUrl.trim()
  if (!proxy) {
    throw new Error(
      t('{name} só funciona pelo proxy local. Informe o endereço dele em Configurações → Provedores.', {
        name: service.name,
      }),
    )
  }
  return proxy
}

async function elevenlabs(job: Job, key: string, options: Record<string, unknown>): Promise<GeneratedMedia> {
  const service = mediaService('elevenlabs')!
  const base = 'https://api.elevenlabs.io/v1'
  const { model } = job.target
  const prompt = job.prompt
  const [path, body] =
    model === 'sound-effects'
      ? ['/sound-generation', { text: prompt, ...options }]
      : model === 'music'
        ? ['/music', { prompt, ...options }]
        : [
            `/text-to-speech/${encodeURIComponent(model)}?output_format=mp3_44100_128`,
            { text: prompt, model_id: 'eleven_multilingual_v2', ...options },
          ]
  const res = await call(service, base + path, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: job.signal,
  })
  const blob = await res.blob()
  return { mime: blob.type || 'audio/mpeg', data: await toBase64(blob) }
}

async function runware(job: Job, key: string, options: Record<string, unknown>): Promise<GeneratedMedia> {
  const service = mediaService('runware')!
  const send = async (task: Record<string, unknown>) => {
    const res = await call(service, 'https://api.runware.ai/v1', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([task]),
      signal: job.signal,
    })
    const json = await res.json()
    const error = json.errors?.[0]
    if (error) throw new Error(`Runware: ${error.message ?? error.code}`)
    return (json.data ?? []) as Record<string, unknown>[]
  }
  const taskUUID = crypto.randomUUID()
  const taskType = `${job.kind}Inference`
  // A speech model takes the text inside `speech`; the others a prompt.
  const speech = options.speech && typeof options.speech === 'object'
  const task: Record<string, unknown> = {
    taskType,
    taskUUID,
    model: job.target.model,
    includeCost: true,
    ...(speech ? {} : { positivePrompt: job.prompt }),
    ...(job.kind === 'image' ? { width: 1024, height: 1024 } : { deliveryMethod: 'async' }),
    ...options,
    ...(speech ? { speech: { text: job.prompt, ...(options.speech as object) } } : {}),
  }
  let result = (await send(task)).find((d) => d.taskUUID === taskUUID && d.status !== 'processing')
  const started = Date.now()
  const done = () => job.kind === 'image' || (result && urlOf(result))
  for (let wait = 3000; !done(); wait = Math.min(wait * 1.5, 10_000)) {
    if (Date.now() - started > MAX_WAIT_MS) throw tooSlow(service)
    await sleep(wait, job.signal)
    const data = await send({ taskType: 'getResponse', taskUUID })
    const item = data.find((d) => d.taskUUID === taskUUID)
    if (item?.status === 'processing' && typeof item.progress === 'number') {
      job.onProgress?.(`${item.progress}%`)
    }
    if (item && item.status !== 'processing') result = item
  }
  if (!result) throw new Error(t('{name} não devolveu nenhum arquivo.', { name: service.name }))
  const cost = typeof result.cost === 'number' ? result.cost : undefined
  const inline = result[`${job.kind}Base64Data`]
  if (typeof inline === 'string') return { mime: FALLBACK_MIME[job.kind], data: inline, cost }
  const url = urlOf(result)
  if (!url) throw new Error(t('{name} não devolveu nenhum arquivo.', { name: service.name }))
  return { ...(await fetchMedia(url, job.kind, job.settings.proxyUrl.trim() || undefined, job.signal)), cost }

  function urlOf(item: Record<string, unknown>): string | undefined {
    const url = item[`${job.kind}URL`]
    return typeof url === 'string' ? url : undefined
  }
}

// How a service that queues requests is asked, checked and cancelled.
interface Queue {
  submit: string
  body: unknown
  headers: Record<string, string>
  // Where to check on the job, from the answer to the submission.
  statusUrl(ticket: any): string | undefined
  cancel?(ticket: any): { url: string; method: string } | undefined
  read(status: any): { state: 'done' | 'failed' | 'waiting'; error?: string; progress?: string }
  // What holds the file once the job is done.
  result(ticket: any, status: any, get: (url: string) => Promise<unknown>): unknown
  // Fetches the file, when its link needs more than a plain download.
  download?(url: string): Promise<GeneratedMedia>
}

// Submits a job, polls it until it is done and downloads the file.
async function queued(job: Job, service: Who, queue: Queue): Promise<GeneratedMedia> {
  const proxy = proxyFor(job.settings, service)
  const get = async (url: string) =>
    (await call(service, url, { headers: queue.headers, signal: job.signal }, proxy)).json()
  const res = await call(
    service,
    queue.submit,
    {
      method: 'POST',
      headers: { ...queue.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(queue.body),
      signal: job.signal,
    },
    proxy,
  )
  const ticket = await res.json()
  const statusUrl = queue.statusUrl(ticket)
  if (!statusUrl) throw new Error(t('{name} não devolveu nenhum arquivo.', { name: service.name }))
  // Stopping the reply cancels the job too, so a queued one is not charged;
  // one already running may not stop.
  const cancel = queue.cancel?.(ticket)
  if (cancel) {
    job.signal?.addEventListener('abort', () => {
      fetch(viaProxy(cancel.url, proxy), { method: cancel.method, headers: queue.headers }).catch(
        () => {},
      )
    })
  }
  const started = Date.now()
  let status: unknown = ticket
  for (let wait = 2000; ; wait = Math.min(wait * 1.5, 10_000)) {
    const state = queue.read(status)
    if (state.state === 'done') break
    if (state.state === 'failed') throw new Error(`${service.name}: ${state.error}`)
    if (Date.now() - started > MAX_WAIT_MS) throw tooSlow(service)
    if (state.progress) job.onProgress?.(state.progress)
    await sleep(wait, job.signal)
    status = await get(statusUrl)
  }
  const url = findMediaUrl(await queue.result(ticket, status, get), job.kind)
  if (!url) throw new Error(t('{name} não devolveu nenhum arquivo.', { name: service.name }))
  if (queue.download) return queue.download(url)
  return fetchMedia(url, job.kind, job.settings.proxyUrl.trim() || undefined, job.signal)
}

const moderated = () => t('o conteúdo foi barrado pela moderação')

function falQueue(model: string, key: string, input: object): Queue {
  return {
    submit: `https://queue.fal.run/${model}`,
    body: input,
    headers: { Authorization: `Key ${key}` },
    statusUrl: (ticket) => ticket.status_url,
    cancel: (ticket) => ticket.cancel_url && { url: ticket.cancel_url, method: 'PUT' },
    read(status) {
      if (status.status === 'COMPLETED') {
        // A failure is reported inside a completed status.
        return status.error ? { state: 'failed', error: String(status.error) } : { state: 'done' }
      }
      return {
        state: 'waiting',
        progress:
          typeof status.queue_position === 'number'
            ? t('na fila: {position}', { position: status.queue_position })
            : status.status === 'IN_PROGRESS'
              ? t('gerando')
              : undefined,
      }
    },
    result: (ticket, _status, get) => get(ticket.response_url),
  }
}

function higgsfieldQueue(model: string, key: string, input: object): Queue {
  return {
    submit: `https://api.higgsfield.ai/${model.replace(/^\/+/, '')}`,
    body: input,
    headers: { Authorization: `Key ${key}` },
    statusUrl: (ticket) => ticket.status_url,
    cancel: (ticket) => ticket.cancel_url && { url: ticket.cancel_url, method: 'POST' },
    read(status) {
      const state = String(status.status)
      if (state === 'completed') return { state: 'done' }
      if (state === 'nsfw') return { state: 'failed', error: moderated() }
      if (['failed', 'canceled'].includes(state)) {
        return { state: 'failed', error: String(status.error ?? state) }
      }
      return { state: 'waiting', progress: state === 'in_progress' ? t('gerando') : undefined }
    },
    // The finished status carries the files.
    result: (_ticket, status) => status,
  }
}

function replicateQueue(model: string, key: string, input: object): Queue {
  // owner/name runs a model's latest version; owner/name:version a given one.
  const [name, version] = model.split(':')
  return {
    submit: version
      ? 'https://api.replicate.com/v1/predictions'
      : `https://api.replicate.com/v1/models/${name}/predictions`,
    body: version ? { version, input } : { input },
    headers: { Authorization: `Bearer ${key}` },
    statusUrl: (ticket) => ticket.urls?.get,
    cancel: (ticket) => ticket.urls?.cancel && { url: ticket.urls.cancel, method: 'POST' },
    read(status) {
      if (status.status === 'succeeded') return { state: 'done' }
      if (['failed', 'canceled'].includes(status.status)) {
        return { state: 'failed', error: String(status.error ?? status.status) }
      }
      return { state: 'waiting', progress: status.status === 'processing' ? t('gerando') : undefined }
    },
    result: (_ticket, status) => status.output,
  }
}

function wavespeedQueue(model: string, key: string, input: object): Queue {
  return {
    submit: `https://api.wavespeed.ai/api/v3/${model.replace(/^\/+/, '')}`,
    body: input,
    headers: { Authorization: `Bearer ${key}` },
    statusUrl: (ticket) =>
      ticket.data?.id && `https://api.wavespeed.ai/api/v3/predictions/${ticket.data.id}/result`,
    read(status) {
      const state = String(status.data?.status)
      if (state === 'completed') return { state: 'done' }
      if (['failed', 'cancelled', 'timeout', 'deleted'].includes(state)) {
        return { state: 'failed', error: String(status.data?.error || state) }
      }
      return { state: 'waiting', progress: state === 'processing' ? t('gerando') : undefined }
    },
    result: (_ticket, status) => status.data?.outputs,
  }
}

// Veo, through the Gemini API with the Gemini key: a long-running operation
// polled until done. The video's link needs the key, so the file is fetched
// with it and never kept as a link, which would carry the key into backups.
function veoQueue(job: Job, base: string, key: string, options: object): Queue {
  const headers = { 'x-goog-api-key': key }
  return {
    submit: `${base}/models/${job.target.model}:predictLongRunning`,
    body: { instances: [{ prompt: job.prompt }], parameters: options },
    headers,
    statusUrl: (ticket) => ticket.name && `${base}/${ticket.name}`,
    read(status) {
      if (!status.done) return { state: 'waiting', progress: t('gerando') }
      if (status.error) return { state: 'failed', error: String(status.error.message ?? status.error.code) }
      const reasons = status.response?.generateVideoResponse?.raiMediaFilteredReasons
      if (reasons?.length) return { state: 'failed', error: `${moderated()} (${reasons.join('; ')})` }
      return { state: 'done' }
    },
    result: (_ticket, status) =>
      status.response?.generateVideoResponse?.generatedSamples?.map(
        (sample: { video?: { uri?: string } }) => ({ url: sample.video?.uri, content_type: 'video/mp4' }),
      ),
    async download(url) {
      try {
        const res = await fetch(url, { headers, signal: job.signal })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        return { mime: blob.type.startsWith('video/') ? blob.type : 'video/mp4', data: await toBase64(blob) }
      } catch (err) {
        if (job.signal?.aborted) throw err
        throw new Error(t('O vídeo foi gerado, mas não pôde ser baixado do Gemini.'))
      }
    },
  }
}

// Speech from a chat provider (OpenAI): the text read aloud, in one request.
async function providerSpeech(job: Job, options: Record<string, unknown>): Promise<GeneratedMedia> {
  const conn = connection(job.settings, job.target.source)
  const res = await call(
    conn.provider,
    `${conn.baseUrl.replace(/\/+$/, '')}/audio/speech`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: job.target.model,
        input: job.prompt,
        voice: 'marin',
        response_format: 'mp3',
        ...options,
      }),
      signal: job.signal,
    },
    conn.proxy,
  )
  const blob = await res.blob()
  return { mime: blob.type.startsWith('audio/') ? blob.type : 'audio/mpeg', data: await toBase64(blob) }
}

export async function generateMedia(job: Job): Promise<GeneratedMedia> {
  const options = parseOptions(job.target.options)
  const service = mediaService(job.target.source)
  if (!service) {
    // A chat provider: images from OpenAI or Gemini, Veo videos from Gemini,
    // speech from OpenAI.
    const conn = connection(job.settings, job.target.source)
    if (job.kind === 'audio') return providerSpeech(job, options)
    if (job.kind === 'video') {
      const base = conn.baseUrl.replace(/\/+$/, '').replace(/\/openai$/, '')
      return queued(job, { name: 'Veo' }, veoQueue(job, base, conn.apiKey, options))
    }
    return generateImage(conn, job.target.model, job.prompt, job.signal, options)
  }
  const key = job.settings.mediaKeys[service.id]?.trim() ?? ''
  // The services that queue jobs take a prompt and the model's own options.
  const input = { prompt: job.prompt, ...options }
  switch (service.id) {
    case 'elevenlabs':
      return elevenlabs(job, key, options)
    case 'runware':
      return runware(job, key, options)
    case 'fal':
      return queued(job, service, falQueue(job.target.model, key, input))
    case 'higgsfield':
      return queued(job, service, higgsfieldQueue(job.target.model, key, input))
    case 'replicate':
      return queued(job, service, replicateQueue(job.target.model, key, input))
    case 'wavespeed':
      return queued(job, service, wavespeedQueue(job.target.model, key, input))
  }
}

// ElevenLabs voices, for the settings.
export async function listVoices(key: string): Promise<{ id: string; name: string }[]> {
  const res = await call(mediaService('elevenlabs')!, 'https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key },
  })
  const json = await res.json()
  const voices: { voice_id: string; name: string }[] = json.voices ?? []
  return voices.map((v) => ({ id: v.voice_id, name: v.name }))
}
