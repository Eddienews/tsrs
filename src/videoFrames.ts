import { t } from './i18n'
import { decodeMono, pcmToWav } from './wav'

// A video attached to a message reaches the model as what any chat API takes:
// frames as images, spread over its length, and the transcription of what is
// said. The video itself is not kept, only those frames.

// At most this many frames, one every few seconds, at most this wide.
export const MAX_FRAMES = 16
const EVERY = 2
const WIDTH = 768
// Larger files are not decoded for their sound (the whole file would be read
// into memory); their frames still go.
export const MAX_AUDIO_DECODE = 300 * 1024 * 1024

export interface Frame {
  // Seconds from the start.
  at: number
  // Base64 JPEG.
  data: string
}

// When to take each frame: in the middle of equal parts of the video.
export function frameTimes(duration: number, max = MAX_FRAMES, every = EVERY): number[] {
  if (!(duration > 0) || !Number.isFinite(duration)) return [0]
  const count = Math.max(1, Math.min(max, Math.round(duration / every)))
  const step = duration / count
  return Array.from({ length: count }, (_, i) => Math.round((i + 0.5) * step * 10) / 10)
}

export function clock(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function once(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
      reject(new Error(t('O navegador não conseguiu abrir este vídeo; tente em MP4 ou WebM.')))
    }
    video.addEventListener(event, done)
    video.addEventListener('error', fail)
  })
}

// Recordings made by browsers often say nothing of their length until read
// to the end; seeking far past it makes the browser find out.
async function lengthOf(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration)) return video.duration
  video.currentTime = 1e7
  await once(video, 'seeked')
  const duration = video.duration
  video.currentTime = 0
  await once(video, 'seeked')
  return Number.isFinite(duration) ? duration : 0
}

export async function videoFrames(file: Blob): Promise<{ duration: number; frames: Frame[] }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    const loaded = once(video, 'loadeddata')
    video.src = url
    await loaded
    const duration = await lengthOf(video)
    const scale = Math.min(1, WIDTH / (video.videoWidth || WIDTH))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((video.videoWidth || WIDTH) * scale))
    canvas.height = Math.max(1, Math.round((video.videoHeight || WIDTH * 0.5625) * scale))
    const context = canvas.getContext('2d')!
    const frames: Frame[] = []
    for (const at of frameTimes(duration)) {
      const seeked = once(video, 'seeked')
      video.currentTime = Math.min(at, Math.max(0, duration - 0.05))
      await seeked
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push({ at, data: canvas.toDataURL('image/jpeg', 0.75).split(',')[1] })
    }
    return { duration, frames }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

// The video's sound as a small WAV (16 kHz mono), for any transcriber; null
// when it has none or is too large to decode.
export async function videoSound(file: Blob): Promise<Blob | null> {
  if (file.size > MAX_AUDIO_DECODE) return null
  try {
    const samples = await decodeMono(file, 16000)
    if (!samples.length) return null
    return new Blob([pcmToWav([samples], 16000)], { type: 'audio/wav' })
  } catch {
    return null
  }
}
