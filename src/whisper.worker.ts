/// <reference lib="webworker" />
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'

// Whisper in this worker, so the page stays responsive while it listens.
// Model files come from the TSRS server, which keeps them on disk
// (server/models.mjs); the ONNX Runtime files are part of the app. Nothing is
// fetched from anywhere else, so it works offline after the first download.

env.allowLocalModels = false
env.remoteHost = `${self.location.origin}/__tsrs/models/hf/`
env.remotePathTemplate = '{model}/resolve/{revision}/'
// The server already keeps the files; a second copy in the browser's cache
// would only take space.
env.useBrowserCache = false
env.useWasmCache = false
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } }
if (onnx.wasm) onnx.wasm.wasmPaths = { mjs: new URL(ortMjs, self.location.origin).href, wasm: new URL(ortWasm, self.location.origin).href }

export type WhisperRequest = { id: number; model: string; audio: Float32Array; language: string }
export type WhisperReply =
  | { id: number; type: 'progress'; file: string; loaded: number; total: number }
  | { id: number; type: 'done'; text: string }
  | { id: number; type: 'error'; error: string }

const loaded = new Map<string, Promise<AutomaticSpeechRecognitionPipeline>>()

function load(model: string, id: number) {
  let asr = loaded.get(model)
  if (!asr) {
    asr = pipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (info: any) => {
        if (info.status === 'progress' && info.total) {
          post({ id, type: 'progress', file: info.file, loaded: info.loaded, total: info.total })
        }
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>
    asr.catch(() => loaded.delete(model))
    loaded.set(model, asr)
  }
  return asr
}

function post(reply: WhisperReply) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(reply)
}

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  const { id, model, audio, language } = event.data
  try {
    const asr = await load(model, id)
    const result = await asr(audio, {
      language: language || null,
      task: 'transcribe',
      // Long recordings in 30 s windows that overlap a little.
      chunk_length_s: 30,
      stride_length_s: 5,
    } as any)
    const text = (Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text).trim()
    post({ id, type: 'done', text })
  } catch (err) {
    post({ id, type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
