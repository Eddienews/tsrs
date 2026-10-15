import type { PiperReply, PiperRequest } from './piper.worker'
import { piperPath, whisperRepo, type WhisperSize } from './localVoiceInfo'
import { decodeMono } from './wav'
import type { WhisperReply, WhisperRequest } from './whisper.worker'

// Speech on this computer, free and with no key: Whisper hears and Piper
// speaks, both in the browser (in workers). Their files are downloaded once by
// the TSRS server and kept on disk, so after the first use they work offline.

export interface Progress {
  loaded: number
  total: number
}

let nextId = 1

// One worker per kind, made on first use; each request gets its own id.
function channel<Req extends { id: number }, Reply extends { id: number; type: string }>(make: () => Worker) {
  let worker: Worker | null = null
  const waiting = new Map<number, (reply: Reply) => void>()
  return (request: Omit<Req, 'id'>, onReply: (reply: Reply) => boolean, transfer: Transferable[] = []) => {
    if (!worker) {
      worker = make()
      worker.onmessage = (event: MessageEvent<Reply>) => waiting.get(event.data.id)?.(event.data)
      worker.onerror = (event) => {
        const error = { type: 'error', error: event.message || 'The worker stopped.' }
        waiting.forEach((handle, id) => handle({ ...error, id } as unknown as Reply))
        worker = null
      }
    }
    const id = nextId++
    waiting.set(id, (reply) => {
      if (onReply(reply)) waiting.delete(id)
    })
    worker.postMessage({ ...request, id }, transfer)
  }
}

const whisper = channel<WhisperRequest, WhisperReply>(
  () => new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' }),
)
const piper = channel<PiperRequest, PiperReply>(
  () => new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' }),
)

// Whisper's files are several, downloaded one after another; the progress
// adds them up.
function adder(onProgress?: (p: Progress) => void) {
  const files = new Map<string, Progress>()
  return (file: string, loaded: number, total: number) => {
    files.set(file, { loaded, total })
    let sum = { loaded: 0, total: 0 }
    files.forEach((p) => (sum = { loaded: sum.loaded + p.loaded, total: sum.total + p.total }))
    onProgress?.(sum)
  }
}

export async function transcribeLocally(
  audio: Blob,
  options: { size?: WhisperSize; language?: string; onProgress?: (p: Progress) => void },
): Promise<string> {
  const samples = await decodeMono(audio, 16000)
  const progress = adder(options.onProgress)
  return new Promise((resolve, reject) =>
    whisper(
      { model: whisperRepo(options.size), audio: samples, language: options.language ?? '' },
      (reply) => {
        if (reply.type === 'progress') return progress(reply.file, reply.loaded, reply.total), false
        if (reply.type === 'done') resolve(reply.text)
        else reject(new Error(reply.error))
        return true
      },
      [samples.buffer],
    ),
  )
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function speakLocally(
  text: string,
  voice: string,
  onProgress?: (p: Progress) => void,
): Promise<{ mime: string; data: string }> {
  const path = piperPath(voice)
  const wav = await new Promise<ArrayBuffer>((resolve, reject) =>
    piper({ path, text }, (reply) => {
      if (reply.type === 'progress') return onProgress?.(reply), false
      if (reply.type === 'done') resolve(reply.wav)
      else reject(new Error(reply.error))
      return true
    }),
  )
  return { mime: 'audio/wav', data: toBase64(wav) }
}
