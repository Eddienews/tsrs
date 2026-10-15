/// <reference lib="webworker" />
import createPiperPhonemize from '@diffusionstudio/piper-wasm/build/piper_phonemize.js'
import phonemizeData from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url'
import phonemizeWasm from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url'
import * as ort from 'onnxruntime-web/wasm'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { pcmToWav, sentenceGroups } from './wav'

// Piper voices, in this worker: espeak-ng turns the text into phonemes
// (piper_phonemize, in WebAssembly) and the voice's ONNX model turns them into
// sound. The voice files come from the TSRS server, which keeps them on disk.

const origin = self.location.origin
ort.env.wasm.wasmPaths = { mjs: new URL(ortMjs, origin).href, wasm: new URL(ortWasm, origin).href }
const VOICES = `${origin}/__tsrs/models/hf/rhasspy/piper-voices/resolve/main/`

export type PiperRequest = { id: number; path: string; text: string }
export type PiperReply =
  | { id: number; type: 'progress'; loaded: number; total: number }
  | { id: number; type: 'done'; wav: ArrayBuffer }
  | { id: number; type: 'error'; error: string }

interface VoiceConfig {
  audio: { sample_rate: number }
  espeak: { voice: string }
  inference: { noise_scale: number; length_scale: number; noise_w: number }
  num_speakers?: number
}

interface Voice {
  config: VoiceConfig
  session: ort.InferenceSession
}

function post(reply: PiperReply, transfer: Transferable[] = []) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(reply, transfer)
}

// A file read whole, telling how far along it is.
async function download(url: string, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${res.status} ${url.split('/').at(-1)}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out.buffer
}

// espeak-ng's data (18 MB) and program, read once.
let phonemizer: Promise<{ data: ArrayBuffer; wasm: ArrayBuffer }> | null = null
function phonemizerFiles() {
  phonemizer ??= Promise.all([download(new URL(phonemizeData, origin).href), download(new URL(phonemizeWasm, origin).href)]).then(
    ([data, wasm]) => ({ data, wasm }),
  )
  phonemizer.catch(() => (phonemizer = null))
  return phonemizer
}

async function phonemes(text: string, voice: string): Promise<number[]> {
  const files = await phonemizerFiles()
  return new Promise((resolve, reject) => {
    let done = false
    createPiperPhonemize({
      // A new copy each time: the program exits after one run.
      wasmBinary: files.wasm,
      getPreloadedPackage: () => files.data.slice(0),
      locateFile: (name: string) => new URL(name.endsWith('.wasm') ? phonemizeWasm : phonemizeData, origin).href,
      print: (line: string) => {
        if (done) return
        done = true
        try {
          resolve(JSON.parse(line).phoneme_ids)
        } catch (err) {
          reject(err)
        }
      },
      printErr: (message: string) => {
        if (!done && /error/i.test(message)) {
          done = true
          reject(new Error(message))
        }
      },
    })
      .then((module: any) =>
        module.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']),
      )
      .catch((err: unknown) => {
        if (!done) reject(err)
      })
  })
}

const voices = new Map<string, Promise<Voice>>()

function loadVoice(path: string, id: number): Promise<Voice> {
  let voice = voices.get(path)
  if (!voice) {
    voice = (async () => {
      const config = JSON.parse(new TextDecoder().decode(await download(`${VOICES}${path}.json`))) as VoiceConfig
      const model = await download(`${VOICES}${path}`, (loaded, total) => post({ id, type: 'progress', loaded, total }))
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
      return { config, session }
    })()
    voice.catch(() => voices.delete(path))
    voices.set(path, voice)
  }
  return voice
}

async function speak(path: string, text: string, id: number): Promise<ArrayBuffer> {
  const { config, session } = await loadVoice(path, id)
  const parts: Float32Array[] = []
  for (const piece of sentenceGroups(text)) {
    const ids = await phonemes(piece, config.espeak.voice)
    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor(
        'float32',
        Float32Array.from([config.inference.noise_scale, config.inference.length_scale, config.inference.noise_w]),
        [3],
      ),
    }
    if ((config.num_speakers ?? 1) > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
    const { output } = await session.run(feeds)
    parts.push(output.data as Float32Array)
  }
  return pcmToWav(parts, config.audio.sample_rate)
}

self.onmessage = async (event: MessageEvent<PiperRequest>) => {
  const { id, path, text } = event.data
  try {
    const wav = await speak(path, text, id)
    post({ id, type: 'done', wav }, [wav])
  } catch (err) {
    post({ id, type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
