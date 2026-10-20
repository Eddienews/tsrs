import { locale, t } from './i18n'
import { COMFY, mediaService, PIPER, SDCPP, type MediaService, type MediaTarget } from './media'
import { ELEVEN_PRICES, elevenSpeechPrice } from './mediaPrice'
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
  // Images attached to the request, for sources that edit from references.
  images?: { mime: string; data: string }[]
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
    if (Array.isArray(json.errors) && json.errors[0]) message = json.errors[0].message ?? json.errors[0]
    if (json.base_resp?.status_msg) message = json.base_resp.status_msg
    if (typeof message !== 'string') message = JSON.stringify(message)
    // A bare "Validation failed" says nothing; what came with it names the field.
    const { error: _error, message: _message, ...rest } = json
    if (typeof json.error === 'string' && Object.keys(rest).length) message = `${message} ${JSON.stringify(rest)}`
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

// What an ElevenLabs request cost at its API list price: speech by the
// characters it reports (or the text's length), music and sound effects by
// the length asked for, when one was.
export function elevenCost(
  model: string,
  body: Record<string, unknown>,
  characters: string | null,
): number | undefined {
  if (model === 'music') {
    const ms = Number(body.music_length_ms)
    return ms > 0 ? (ms / 60_000) * ELEVEN_PRICES.music : undefined
  }
  if (model === 'sound-effects') {
    const seconds = Number(body.duration_seconds)
    return seconds > 0 ? (seconds / 60) * ELEVEN_PRICES.soundEffects : undefined
  }
  const count = Number(characters) || String(body.text ?? '').length
  return (count / 1000) * elevenSpeechPrice(String(body.model_id ?? ''))
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
  const cost = elevenCost(model, body, res.headers.get('character-cost'))
  return { mime: blob.type || 'audio/mpeg', data: await toBase64(blob), ...(cost === undefined ? {} : { cost }) }
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

// Grok Imagine videos, with the xAI key: a request polled until done.
function grokVideoQueue(job: Job, base: string, key: string, options: object): Queue {
  return {
    submit: `${base}/videos/generations`,
    body: { model: job.target.model, prompt: job.prompt, ...options },
    headers: { Authorization: `Bearer ${key}` },
    statusUrl: (ticket) => ticket.request_id && `${base}/videos/${ticket.request_id}`,
    read(status) {
      if (status.status === 'done') return { state: 'done' }
      if (['failed', 'expired'].includes(status.status)) {
        return { state: 'failed', error: String(status.error?.message ?? status.error ?? status.status) }
      }
      return { state: 'waiting', progress: t('gerando') }
    },
    result: (_ticket, status) => status.video,
  }
}

// Black Forest Labs (FLUX): the model is the endpoint, polled on the URL the
// submission gives. The image's signed link expires in 10 minutes and refuses
// browsers, so it is downloaded through the local proxy.
function bflQueue(model: string, key: string, input: object): Queue {
  return {
    submit: `https://api.bfl.ai/v1/${model.replace(/^\/+/, '')}`,
    body: input,
    headers: { 'x-key': key },
    statusUrl: (ticket) => ticket.polling_url,
    read(status) {
      const state = String(status.status)
      if (state === 'Ready') return { state: 'done' }
      if (/moderated/i.test(state)) return { state: 'failed', error: moderated() }
      if (['Error', 'Failed', 'Task not found'].includes(state)) {
        return { state: 'failed', error: String(status.details ?? state) }
      }
      return { state: 'waiting', progress: state === 'Pending' ? t('gerando') : undefined }
    },
    result: (_ticket, status) => status.result?.sample,
  }
}

// Fields some Krea models require, filled in when the options leave them out.
const KREA_DEFAULTS: Record<string, object> = {
  'image/z-image/z-image': { aspect_ratio: '16:9', resolution: '1K' },
}

// Krea: one endpoint per model under its kind (image/, video/, enhance/,
// audio/), a job polled until done; a waiting job can be deleted.
function kreaQueue(job: Job, key: string, input: object): Queue {
  const base = 'https://api.krea.ai'
  const model = job.target.model.replace(/^\/+/, '')
  const path = /^(image|video|audio|enhance|3d)\//.test(model) ? model : `${job.kind}/${model}`
  const jobUrl = (ticket: any) => ticket.job_id && `${base}/jobs/${ticket.job_id}`
  return {
    submit: `${base}/generate/${path}`,
    body: { ...KREA_DEFAULTS[path], ...input },
    headers: { Authorization: `Bearer ${key}` },
    statusUrl: jobUrl,
    cancel: (ticket) => jobUrl(ticket) && { url: jobUrl(ticket), method: 'DELETE' },
    read(status) {
      const state = String(status.status)
      if (state === 'completed') return { state: 'done' }
      if (['failed', 'cancelled'].includes(state)) {
        return { state: 'failed', error: String(status.error?.message ?? status.error?.code ?? state) }
      }
      return {
        state: 'waiting',
        progress:
          typeof status.progress === 'number'
            ? `${Math.round(status.progress * 100)}%`
            : ['processing', 'sampling'].includes(state)
              ? t('gerando')
              : undefined,
      }
    },
    result: (_ticket, status) => status.result?.urls,
  }
}

// Stability's image endpoints take a form and answer with the image itself.
async function stability(job: Job, key: string, options: Record<string, unknown>): Promise<GeneratedMedia> {
  const form = new FormData()
  form.append('prompt', job.prompt)
  form.append('output_format', 'png')
  for (const [name, value] of Object.entries(options)) form.append(name, String(value))
  const res = await call(
    mediaService('stability')!,
    `https://api.stability.ai/v2beta/stable-image/generate/${job.target.model.replace(/^\/+/, '')}`,
    { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' }, body: form, signal: job.signal },
  )
  const blob = await res.blob()
  return { mime: blob.type.startsWith('image/') ? blob.type : 'image/png', data: await toBase64(blob) }
}

// MiniMax video (H3): a task polled until it succeeds; a queued one can be
// cancelled.
function minimaxQueue(job: Job, key: string, options: object): Queue {
  const base = 'https://api.minimax.io/v2'
  return {
    submit: `${base}/video_generation`,
    body: { model: job.target.model, content: [{ type: 'text', text: job.prompt }], ...options },
    headers: { Authorization: `Bearer ${key}` },
    statusUrl: (ticket) => ticket.task_id && `${base}/query/video_generation/${ticket.task_id}`,
    cancel: (ticket) =>
      ticket.task_id && { url: `${base}/video_generation/${ticket.task_id}`, method: 'DELETE' },
    read(status) {
      if (status.status === 'succeeded') return { state: 'done' }
      if (['failed', 'cancelled'].includes(status.status)) {
        return { state: 'failed', error: String(status.error?.message ?? status.status) }
      }
      return { state: 'waiting', progress: status.status === 'running' ? t('gerando') : undefined }
    },
    result: (_ticket, status) => status.content,
  }
}

// MiniMax speech: the model field is a voice; the audio comes back as hex.
async function minimaxSpeech(job: Job, key: string, options: Record<string, unknown>) {
  const res = await call(mediaService('minimax')!, 'https://api.minimax.io/v1/t2a_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'speech-2.8-hd',
      text: job.prompt,
      voice_setting: { voice_id: job.target.model },
      audio_setting: { format: 'mp3' },
      language_boost: 'auto',
      ...options,
    }),
    signal: job.signal,
  })
  const json = await res.json()
  if (json.base_resp?.status_code) throw new Error(`MiniMax: ${json.base_resp.status_msg}`)
  const hex = String(json.data?.audio ?? '')
  if (!hex) throw new Error(t('{name} não devolveu nenhum arquivo.', { name: 'MiniMax' }))
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return { mime: 'audio/mpeg', data: await toBase64(new Blob([bytes])) }
}

// Cartesia speech: the model field is a voice; the language follows the app's
// unless the options say otherwise.
async function cartesia(job: Job, key: string, options: Record<string, unknown>) {
  const res = await call(mediaService('cartesia')!, 'https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Cartesia-Version': '2026-08-14',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-3.6',
      transcript: job.prompt,
      voice: { id: job.target.model },
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
      ...(options.locale ? {} : { language: locale().slice(0, 2) }),
      ...options,
    }),
    signal: job.signal,
  })
  const blob = await res.blob()
  return { mime: 'audio/mpeg', data: await toBase64(blob) }
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

// Speech from a chat provider, the text read aloud in one request: OpenAI's
// speech endpoint, or Gemini's TTS models through the Interactions API.
async function providerSpeech(job: Job, options: Record<string, unknown>): Promise<GeneratedMedia> {
  const conn = connection(job.settings, job.target.source)
  if (conn.provider.id === 'gemini') return geminiSpeech(job, conn.baseUrl, conn.apiKey, options)
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

// Gemini answers with a WAV file (24 kHz, mono) inside the JSON. `voice`
// picks one of its voices and `style` says how to speak.
async function geminiSpeech(
  job: Job,
  baseUrl: string,
  key: string,
  options: Record<string, unknown>,
): Promise<GeneratedMedia> {
  const { voice = 'Kore', style, ...rest } = options
  const base = baseUrl.replace(/\/+$/, '').replace(/\/openai$/, '')
  const text = {
    type: 'text',
    text: job.prompt,
    ...(style ? { annotations: [{ type: 'speech_metadata', style: String(style) }] } : {}),
  }
  const res = await call(
    { name: 'Gemini' },
    `${base}/interactions`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: job.target.model,
        input: [{ type: 'user_input', content: [text] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: String(voice) }] },
        ...rest,
      }),
      signal: job.signal,
    },
  )
  const json = await res.json()
  const steps: { type?: string; content?: { type?: string; data?: string }[] }[] = json.steps ?? []
  const audio = steps
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'audio' && part.data)
    .at(-1)
  if (!audio?.data) throw new Error(t('{name} não devolveu nenhum arquivo.', { name: 'Gemini' }))
  return { mime: 'audio/wav', data: audio.data }
}

// Music, a sound effect or an image from ComfyUI on this computer, through the
// TSRS server (ComfyUI does not answer the browser). Audio options: seconds,
// bpm, bars, seed. Image options: width, height, seed; attached images make
// it an edit (Qwen-Image-Edit) instead of an image from text (Z-Image).
// stable-diffusion.cpp's sd-server is asked the same way, for images only:
// attached images go to it as references, for an edit model to use.
async function localMedia(
  job: Job,
  options: Record<string, unknown>,
  service: 'comfy' | 'sdcpp',
): Promise<GeneratedMedia> {
  const name = service === 'comfy' ? 'ComfyUI' : 'sd-server'
  const images = job.kind === 'image' ? (job.images ?? []).filter((i) => i.data).slice(0, 3) : []
  let res: Response
  try {
    res = await fetch(`/__tsrs/${service}/${job.kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...options, prompt: job.prompt, ...(images.length ? { images } : {}) }),
      signal: job.signal,
    })
  } catch (err) {
    if (job.signal?.aborted) throw err
    throw new Error(t('O servidor do TSRS não respondeu. Abra o TSRS pelo npm run dev.'))
  }
  if (res.status === 404) throw new Error(t('O servidor do TSRS não respondeu. Abra o TSRS pelo npm run dev.'))
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.data) throw new Error(json.error ?? t('{name} não devolveu nenhum arquivo.', { name }))
  return { mime: json.mime ?? (job.kind === 'image' ? 'image/png' : 'audio/flac'), data: json.data, cost: 0 }
}

export async function generateMedia(job: Job): Promise<GeneratedMedia> {
  if (job.target.source === PIPER) {
    if (job.kind !== 'audio') throw new Error(t('O Piper só faz voz.'))
    const { speakLocally } = await import('./localVoice')
    return { ...(await speakLocally(job.prompt, job.target.model)), cost: 0 }
  }
  const options = parseOptions(job.target.options)
  if (job.target.source === COMFY) {
    if (job.kind === 'video') throw new Error(t('O ComfyUI local não faz vídeo aqui.'))
    return localMedia(job, options, 'comfy')
  }
  if (job.target.source === SDCPP) {
    if (job.kind !== 'image') throw new Error(t('O stable-diffusion.cpp local só faz imagens aqui.'))
    return localMedia(job, options, 'sdcpp')
  }
  const service = mediaService(job.target.source)
  if (!service) {
    // A chat provider: images from OpenAI or Gemini, Veo videos from Gemini,
    // speech from OpenAI or Gemini.
    const conn = connection(job.settings, job.target.source)
    if (job.kind === 'audio') return providerSpeech(job, options)
    if (job.kind === 'video' && conn.provider.id === 'xai') {
      const base = conn.baseUrl.replace(/\/+$/, '')
      return queued(job, { name: 'xAI' }, grokVideoQueue(job, base, conn.apiKey, options))
    }
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
    case 'bfl':
      return queued(job, service, bflQueue(job.target.model, key, input))
    case 'stability':
      return stability(job, key, options)
    case 'minimax':
      return job.kind === 'audio'
        ? minimaxSpeech(job, key, options)
        : queued(job, service, minimaxQueue(job, key, options))
    case 'cartesia':
      return cartesia(job, key, options)
    case 'krea':
      return queued(job, service, kreaQueue(job, key, input))
  }
}

export interface ElevenVoice {
  id: string
  name: string
  // The account's own voices (cloned, designed, added from the library), as
  // opposed to the ones ElevenLabs gives everyone.
  mine: boolean
  // A short sample, on ElevenLabs' servers.
  preview?: string
  // Accent, gender, age… as the voice describes itself.
  description?: string
}

// The voices of the ElevenLabs account, its own first, for the settings.
export async function listVoices(key: string): Promise<ElevenVoice[]> {
  const res = await call(mediaService('elevenlabs')!, 'https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key },
  })
  const json = await res.json()
  const voices: {
    voice_id: string
    name: string
    category?: string
    preview_url?: string
    labels?: Record<string, string>
  }[] = json.voices ?? []
  return voices
    .map((v) => ({
      id: v.voice_id,
      name: v.name,
      mine: !!v.category && v.category !== 'premade',
      ...(v.preview_url ? { preview: v.preview_url } : {}),
      ...(v.labels ? { description: Object.values(v.labels).filter(Boolean).join(', ') } : {}),
    }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name))
}

export interface ElevenModel {
  id: string
  name: string
}

// The ElevenLabs models that read text aloud.
export async function listElevenModels(key: string): Promise<ElevenModel[]> {
  const res = await call(mediaService('elevenlabs')!, 'https://api.elevenlabs.io/v1/models', {
    headers: { 'xi-api-key': key },
  })
  const models: { model_id: string; name: string; can_do_text_to_speech?: boolean }[] = await res.json()
  return models
    .filter((m) => m.can_do_text_to_speech !== false)
    .map((m) => ({ id: m.model_id, name: m.name }))
}

// Voices made in the account, from the settings: designed from a description
// (Voice Design) or cloned from recordings (Instant Voice Cloning).

export interface DesignedPreview {
  // Kept to save the preview as a voice.
  id: string
  // A data URL to listen to.
  audio: string
  seconds: number
}

const ELEVEN = 'https://api.elevenlabs.io/v1'

// Three versions of a described voice, saying `text` (100 to 1,000
// characters) or a text ElevenLabs writes to suit the description.
export async function designVoice(
  key: string,
  request: { description: string; text?: string },
  signal?: AbortSignal,
): Promise<{ previews: DesignedPreview[]; text: string }> {
  const text = request.text?.trim() ?? ''
  const res = await call(mediaService('elevenlabs')!, `${ELEVEN}/text-to-voice/design?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_description: request.description.trim(),
      model_id: 'eleven_ttv_v3',
      ...(text.length >= 100 ? { text } : { auto_generate_text: true }),
    }),
    signal,
  })
  const json = await res.json()
  const previews: { generated_voice_id: string; audio_base_64: string; media_type?: string; duration_secs?: number }[] =
    json.previews ?? []
  return {
    text: String(json.text ?? text),
    previews: previews.map((p) => ({
      id: p.generated_voice_id,
      audio: `data:${p.media_type || 'audio/mpeg'};base64,${p.audio_base_64}`,
      seconds: p.duration_secs ?? 0,
    })),
  }
}

// Saves a designed preview in the account; resolves to the new voice's id.
export async function saveDesignedVoice(
  key: string,
  voice: { name: string; description: string; previewId: string },
): Promise<string> {
  const res = await call(mediaService('elevenlabs')!, `${ELEVEN}/text-to-voice`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_name: voice.name.trim(),
      voice_description: voice.description.trim(),
      generated_voice_id: voice.previewId,
    }),
  })
  const json = await res.json()
  if (!json.voice_id) throw new Error(t('A ElevenLabs não devolveu a voz criada.'))
  return String(json.voice_id)
}

// A voice cloned from one or more recordings of the same person.
export async function cloneVoice(
  key: string,
  voice: { name: string; description?: string; files: File[]; removeNoise: boolean },
): Promise<{ id: string; verify: boolean }> {
  const form = new FormData()
  form.append('name', voice.name.trim())
  if (voice.description?.trim()) form.append('description', voice.description.trim())
  form.append('remove_background_noise', String(voice.removeNoise))
  voice.files.forEach((file) => form.append('files', file, file.name))
  const res = await call(mediaService('elevenlabs')!, `${ELEVEN}/voices/add`, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  })
  const json = await res.json()
  if (!json.voice_id) throw new Error(t('A ElevenLabs não devolveu a voz criada.'))
  return { id: String(json.voice_id), verify: !!json.requires_verification }
}
