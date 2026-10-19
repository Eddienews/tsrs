// Music and sound effects made on this computer by ComfyUI with Stable Audio 3
// Medium: no key, no cost per file. ComfyUI does not answer browsers from
// other origins, so the TSRS server asks it and hands the file back.
//
// ComfyUI runs at TSRS_COMFYUI (http://127.0.0.1:8188 unless set), with the
// models of its "Stable Audio 3 Medium" template in place:
//   checkpoints/stable_audio_3_medium.safetensors
//   text_encoders/t5gemma_b_b_ul2.safetensors
// The model's own license (Stability AI Community License) applies to what it makes.

export const CHECKPOINT = 'stable_audio_3_medium.safetensors'
export const TEXT_ENCODER = 't5gemma_b_b_ul2.safetensors'
const MAX_WAIT_MS = 15 * 60_000

export function comfyUrl() {
  return (process.env.TSRS_COMFYUI || 'http://127.0.0.1:8188').replace(/\/+$/, '')
}

// Stable Audio 3 reads tempo and length from the prompt itself; with bars and
// a tempo the length is exact (4 beats a bar).
export function audioPrompt({ prompt, seconds, bpm, bars }) {
  const text = String(prompt ?? '').trim().replace(/\.+$/, '')
  if (!text) throw new Error('Describe the music or sound to make.')
  const tempo = Number(bpm) > 0 ? Number(bpm) : undefined
  const length = tempo && Number(bars) > 0 ? (Number(bars) * 4 * 60) / tempo : Number(seconds) > 0 ? Number(seconds) : 30
  if (length > 380) throw new Error('Stable Audio 3 Medium makes at most 380 seconds.')
  return {
    text: `${text}${tempo ? `. BPM: ${tempo}` : ''}. Length: ${Math.round(length)} seconds`,
    seconds: Math.round(length * 1000) / 1000,
  }
}

// The API graph of ComfyUI's Stable Audio 3 Medium template, without its
// prompt rewriting by Qwen.
export function audioGraph(text, seconds, seed, prefix) {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: TEXT_ENCODER, type: 'stable_audio', device: 'default' } },
    3: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text } },
    4: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '' } },
    5: { class_type: 'EmptyLatentAudio', inputs: { seconds, batch_size: 1 } },
    6: {
      class_type: 'KSampler',
      inputs: { model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0], seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'simple', denoise: 1 },
    },
    7: { class_type: 'VAEDecodeAudio', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    8: { class_type: 'SaveAudio', inputs: { audio: ['7', 0], filename_prefix: prefix } },
  }
}

const unreachable = (base) =>
  new Error(`ComfyUI is not answering at ${base}. Start it, or set TSRS_COMFYUI to where it runs.`)

async function ask(fetchImpl, url, init) {
  let res
  try {
    res = await fetchImpl(url, init)
  } catch {
    throw unreachable(comfyUrl())
  }
  if (!res.ok) throw new Error(`ComfyUI (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return res
}

// Whether ComfyUI answers and has the two model files.
export async function comfyStatus(fetchImpl = fetch) {
  const base = comfyUrl()
  try {
    const info = await (await ask(fetchImpl, `${base}/object_info/CheckpointLoaderSimple`)).json()
    const checkpoints = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? []
    const encoders = (await (await ask(fetchImpl, `${base}/object_info/CLIPLoader`)).json())?.CLIPLoader?.input?.required?.clip_name?.[0] ?? []
    const missing = [CHECKPOINT, TEXT_ENCODER].filter((m) => !checkpoints.includes(m) && !encoders.includes(m))
    return { ok: missing.length === 0, url: base, missing }
  } catch (err) {
    return { ok: false, url: base, error: err.message }
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// Makes one file and returns it as base64 FLAC, with the seed and the prompt sent.
export async function makeAudio(job, fetchImpl = fetch, wait = sleep) {
  const base = comfyUrl()
  const { text, seconds } = audioPrompt(job)
  const seed = Number.isInteger(job.seed) ? job.seed : Math.floor(Math.random() * 2 ** 31)
  const prefix = `tsrs-audio/${Date.now()}`
  const queued = await (
    await ask(fetchImpl, `${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: audioGraph(text, seconds, seed, prefix), client_id: 'tsrs' }),
    })
  ).json()
  if (queued.node_errors && Object.keys(queued.node_errors).length) {
    throw new Error(`ComfyUI refused the graph: ${JSON.stringify(queued.node_errors).slice(0, 300)}`)
  }
  const id = queued.prompt_id
  const started = Date.now()
  for (;;) {
    await wait(1000)
    const history = (await (await ask(fetchImpl, `${base}/history/${id}`)).json())[id]
    if (!history) {
      if (Date.now() - started > MAX_WAIT_MS) throw new Error('ComfyUI took more than 15 minutes.')
      continue
    }
    if (history.status?.status_str !== 'success') {
      const failure = (history.status?.messages ?? []).find((m) => m[0] === 'execution_error')?.[1]
      throw new Error(`ComfyUI: ${failure?.exception_message ?? 'the run failed'}`.slice(0, 400))
    }
    const file = Object.values(history.outputs ?? {}).flatMap((o) => o.audio ?? [])[0]
    if (!file) throw new Error('ComfyUI made no file.')
    const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'output' })
    const bytes = Buffer.from(await (await ask(fetchImpl, `${base}/view?${query}`)).arrayBuffer())
    return { mime: 'audio/flac', data: bytes.toString('base64'), seed, prompt: text, seconds }
  }
}
