import type { Message } from './types'

// Where the video renderer may be, in order: inside the server TSRS runs on
// (npm run dev or vite preview, render/vite-plugin.mjs), or the standalone one
// started with npm run render:serve (render/serve.mjs).
export const RENDERERS = ['/__tsrs/render', 'http://127.0.0.1:8788']

// Audio to put under a video: base64 data, as attachments keep it.
export interface Track {
  id: string
  name: string
  mime: string
  data: string
}

// The soundtrack a composition asks for: the file in its
// <meta name="nwlab:audio" content="midia/song.mp3">, else an audio file its code
// names (a kit's track), else the first one offered.
export function soundtrackFor<T extends { name: string }>(code: string, tracks: T[]): T | undefined {
  const base = (path: string) => path.replace(/\\/g, '/').split('/').pop()!.toLowerCase()
  const asked = /<meta\b[^>]*\bname\s*=\s*["']?nwlab:audio["']?[^>]*>/i.exec(code)?.[0]
  const wanted = asked && /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(asked)
  const file = wanted ? base(wanted[1] ?? wanted[2] ?? wanted[3]) : ''
  const lower = code.toLowerCase()
  const named = (name: string) => {
    const n = name.toLowerCase()
    for (let at = lower.indexOf(n); at >= 0; at = lower.indexOf(n, at + 1)) {
      if (!/[\w.-]/.test(lower[at - 1] ?? '') && !/[\w-]/.test(lower[at + n.length] ?? '')) return true
    }
    return false
  }
  return (file && tracks.find((t) => t.name.toLowerCase() === file)) || tracks.find((t) => named(t.name)) || tracks[0]
}

export interface RenderProgress {
  frame: number
  frames: number
}

export interface RenderedVideo {
  name: string
  // Where the renderer saved it on this computer.
  path: string
  // The MP4, for the download link.
  blob: Blob
}

// Audio in a conversation, newest first: generated speech or music, and audio
// files attached to messages.
export function chatTracks(messages: Message[]): Track[] {
  const tracks: Track[] = []
  for (const message of messages) {
    for (const file of message.attachments ?? []) {
      if (file.mime.startsWith('audio/') && file.data) {
        tracks.push({ id: file.id, name: file.name, mime: file.mime, data: file.data })
      }
    }
  }
  return tracks.reverse()
}

// The audio as a Blob, for an <audio> element of the preview.
export function trackBlob(track: Pick<Track, 'mime' | 'data'>): Blob {
  const binary = atob(track.data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: track.mime || 'audio/mpeg' })
}

// Volume of the soundtrack at `time`: the same fade-out at the end that the
// renderer applies (render/render.mjs), so the preview sounds like the MP4.
export function fadeGain(time: number, duration: number): number {
  const fade = Math.min(1.5, duration / 4)
  if (time <= duration - fade) return 1
  return Math.max(0, Math.min(1, (duration - time) / fade))
}

// A file name the renderer accepts for an audio type that came without one.
export function trackFileName(track: Pick<Track, 'name' | 'mime'>): string {
  if (/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(track.name)) return track.name
  const extension =
    {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/wave': 'wav',
      'audio/mp4': 'm4a',
      'audio/aac': 'aac',
      'audio/ogg': 'ogg',
      'audio/opus': 'opus',
      'audio/flac': 'flac',
      'audio/webm': 'webm',
    }[track.mime.split(';')[0].trim().toLowerCase()] ?? 'mp3'
  return `${track.name || 'audio'}.${extension}`
}

export async function rendererReady(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) })
    return response.ok && (await response.json()).ok === true
  } catch {
    return false
  }
}

// The first renderer that answers, or null when none is running.
export async function findRenderer(bases = RENDERERS): Promise<string | null> {
  for (const base of bases) if (await rendererReady(base)) return base
  return null
}

// Splits a stream of NDJSON into objects as the lines arrive.
export async function* jsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) if (line.trim()) yield JSON.parse(line)
  }
  pending += decoder.decode()
  if (pending.trim()) yield JSON.parse(pending)
}

export async function renderVideo(
  // `project`: the conversation's folder, where the video is saved.
  job: { html: string; name: string; track?: Track | null; project?: string },
  onProgress: (progress: RenderProgress) => void,
  base: string,
): Promise<RenderedVideo> {
  const response = await fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html: job.html,
      name: job.name,
      ...(job.project ? { project: job.project } : {}),
      ...(job.track ? { audio: { name: trackFileName(job.track), data: job.track.data } } : {}),
    }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    let message = text
    try {
      message = JSON.parse(text).error ?? text
    } catch {
      // Not JSON: the text itself.
    }
    throw new Error(message || `HTTP ${response.status}`)
  }
  for await (const line of jsonLines(response.body)) {
    if (line.error) throw new Error(line.error)
    if (line.done) {
      const video = await fetch(`${base}/video/${line.id}`)
      if (!video.ok) throw new Error(`HTTP ${video.status}`)
      return { name: line.name, path: line.path, blob: await video.blob() }
    }
    if (typeof line.frame === 'number') onProgress({ frame: line.frame, frames: line.frames })
  }
  throw new Error('The renderer stopped before the video was done.')
}
