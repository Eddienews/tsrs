// Media made on this computer by ComfyUI: no key, no cost per file. ComfyUI
// does not answer browsers from other origins, so the TSRS server asks it and
// hands the file back. ComfyUI runs at TSRS_COMFYUI (http://127.0.0.1:8188
// unless set), with the models of its workflow templates in place:
//   Music and sound: Stable Audio 3 Medium
//     checkpoints/stable_audio_3_medium.safetensors
//     text_encoders/t5gemma_b_b_ul2.safetensors
//   Images from text: Z-Image Turbo (any precision of these files)
//     diffusion_models/z_image_turbo*.safetensors, text_encoders/qwen_3_4b*, vae/ae.safetensors
//   Images from up to 3 attached images: Qwen-Image-Edit-2511
//     diffusion_models/qwen_image_edit_2511*, text_encoders/qwen_2.5_vl_7b*, vae/qwen_image_vae*,
//     and, for 4 steps instead of 40, loras/Qwen-Image-Edit-2511-Lightning-4steps*
// Each model's own license applies to what it makes.

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

// Stops a run of ours: takes it off ComfyUI's queue, and interrupts it when
// it is the one running. Without this a run TSRS gave up on kept the GPU busy.
export async function stopRun(id, fetchImpl = fetch) {
  const base = comfyUrl()
  const post = (path, body) =>
    fetchImpl(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  let running = true
  try {
    const queue = await (await fetchImpl(`${base}/queue`)).json()
    running = (queue?.queue_running ?? []).some((item) => item?.[1] === id)
  } catch {
    // Not knowing, interrupt: ComfyUI runs one prompt at a time.
  }
  await post('/queue', { delete: [id] })
  if (running) await post('/interrupt', { prompt_id: id })
  return running
}

const VIDEO_FILE = /\.(mp4|webm|mov|mkv)$/i

// The first file of `kind` in a run's outputs. Videos are listed under
// images, gifs or videos, by node.
function outputFile(outputs, kind) {
  const all = Object.values(outputs ?? {})
  if (kind === 'video') return all.flatMap((o) => [...(o.gifs ?? []), ...(o.videos ?? []), ...(o.images ?? [])]).find((f) => VIDEO_FILE.test(f?.filename ?? ''))
  return all.flatMap((o) => o[kind] ?? [])[0]
}

// Queues a graph, waits for it and returns the first file of `kind` it saved.
// `signal` cancels it (the run is stopped in ComfyUI too); after `maxWait`
// it is stopped as well.
export async function run(graph, kind, fetchImpl = fetch, wait = sleep, { signal, maxWait = MAX_WAIT_MS, onStart } = {}) {
  const base = comfyUrl()
  if (signal?.aborted) throw cancelled()
  const queued = await (
    await ask(fetchImpl, `${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: 'tsrs' }),
    })
  ).json()
  if (queued.node_errors && Object.keys(queued.node_errors).length) {
    throw new Error(`ComfyUI refused the graph: ${JSON.stringify(queued.node_errors).slice(0, 600)}`)
  }
  const id = queued.prompt_id
  onStart?.(id)
  const started = Date.now()
  for (;;) {
    await wait(1000)
    if (signal?.aborted) {
      await stopRun(id, fetchImpl)
      throw cancelled()
    }
    const history = (await (await ask(fetchImpl, `${base}/history/${id}`)).json())[id]
    if (!history) {
      if (Date.now() - started > maxWait) {
        await stopRun(id, fetchImpl)
        throw new Error(`ComfyUI took more than ${Math.round(maxWait / 60_000)} minutes; the run was stopped.`)
      }
      continue
    }
    if (history.status?.status_str !== 'success') {
      const messages = history.status?.messages ?? []
      if (messages.some((m) => m[0] === 'execution_interrupted')) throw cancelled()
      const failure = messages.find((m) => m[0] === 'execution_error')?.[1]
      throw new Error(`ComfyUI: ${failure?.exception_message ?? 'the run failed'}`.slice(0, 400))
    }
    const fetchFile = async (file) => {
      const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'output' })
      return Buffer.from(await (await ask(fetchImpl, `${base}/view?${query}`)).arrayBuffer())
    }
    if (kind === 'files') {
      // Every image each node saved: [{ node, filename, bytes }].
      const out = []
      for (const [node, o] of Object.entries(history.outputs ?? {}))
        for (const file of [...(o.images ?? [])].sort((a, b) => a.filename.localeCompare(b.filename))) out.push({ node, filename: file.filename, bytes: await fetchFile(file) })
      if (!out.length) throw new Error('ComfyUI made no file.')
      return out
    }
    const file = outputFile(history.outputs, kind)
    if (!file) throw new Error('ComfyUI made no file.')
    return fetchFile(file)
  }
}

function cancelled() {
  const error = new Error('Canceled.')
  error.code = 'canceled'
  return error
}

const newSeed = (seed) => (Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2 ** 31))

// Makes one file and returns it as base64 FLAC, with the seed and the prompt sent.
export async function makeAudio(job, fetchImpl = fetch, wait = sleep) {
  const { text, seconds } = audioPrompt(job)
  const seed = newSeed(job.seed)
  const bytes = await run(audioGraph(text, seconds, seed, `tsrs-audio/${Date.now()}`), 'audio', fetchImpl, wait, { signal: job.signal })
  return { mime: 'audio/flac', data: bytes.toString('base64'), seed, prompt: text, seconds }
}

// Images. The model files are found by name in what ComfyUI has, so any
// precision of them works (bf16, fp8, int8...).
const IMAGE_FILES = {
  zUnet: /^z[-_]image[-_]turbo/i,
  zClip: /^qwen[-_]3[-_]4b/i,
  zVae: /^ae\.safetensors$/i,
  qUnet: /^qwen[-_]image[-_]edit[-_]2511/i,
  qClip: /^qwen[-_]2\.5[-_]vl[-_]7b/i,
  qVae: /^qwen[-_]image[-_]vae/i,
  qLora: /^qwen[-_]image[-_]edit[-_]2511[-_]lightning[-_]4steps/i,
}

async function choices(fetchImpl, node, input) {
  const info = await (await ask(fetchImpl, `${comfyUrl()}/object_info/${node}`)).json()
  return info?.[node]?.input?.required?.[input]?.[0] ?? []
}

// The model files ComfyUI has for images, by role ('' when missing).
export async function imageModels(fetchImpl = fetch) {
  const [unets, clips, vaes, loras] = await Promise.all([
    choices(fetchImpl, 'UNETLoader', 'unet_name'),
    choices(fetchImpl, 'CLIPLoader', 'clip_name'),
    choices(fetchImpl, 'VAELoader', 'vae_name'),
    choices(fetchImpl, 'LoraLoaderModelOnly', 'lora_name'),
  ])
  const find = (list, pattern) => list.find((name) => pattern.test(name.split(/[\\/]/).pop())) ?? ''
  return {
    zUnet: find(unets, IMAGE_FILES.zUnet),
    zClip: find(clips, IMAGE_FILES.zClip),
    zVae: find(vaes, IMAGE_FILES.zVae),
    qUnet: find(unets, IMAGE_FILES.qUnet),
    qClip: find(clips, IMAGE_FILES.qClip),
    qVae: find(vaes, IMAGE_FILES.qVae),
    qLora: find(loras, IMAGE_FILES.qLora),
  }
}

// Z-Image Turbo, from its ComfyUI template: 8 steps, no negative prompt.
export function zImageGraph(m, prompt, width, height, seed, prefix) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: m.zUnet, weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: m.zClip, type: 'lumina2', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: m.zVae } },
    4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    6: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    7: { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    8: {
      class_type: 'KSampler',
      inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1 },
    },
    9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    10: { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: prefix } },
  }
}

// Qwen-Image-Edit-2511 with up to 3 reference images (names in ComfyUI's
// input folder), from its ComfyUI template. The size follows image 1.
export function qwenEditGraph(m, images, prompt, seed, prefix) {
  const fast = !!m.qLora
  const g = {
    1: { class_type: 'UNETLoader', inputs: { unet_name: m.qUnet, weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: m.qClip, type: 'qwen_image', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: m.qVae } },
    4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3.1 } },
    5: { class_type: 'CFGNorm', inputs: { model: ['4', 0], strength: 1 } },
    13: { class_type: 'FluxKontextImageScale', inputs: { image: ['10', 0] } },
    18: { class_type: 'VAEEncode', inputs: { pixels: ['13', 0], vae: ['3', 0] } },
    20: { class_type: 'VAEDecode', inputs: { samples: ['19', 0], vae: ['3', 0] } },
    21: { class_type: 'SaveImage', inputs: { images: ['20', 0], filename_prefix: prefix } },
  }
  if (fast) g[6] = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['5', 0], lora_name: m.qLora, strength_model: 1 } }
  images.forEach((name, i) => {
    g[10 + i] = { class_type: 'LoadImage', inputs: { image: name } }
  })
  for (const [id, text] of [[14, prompt], [15, '']]) {
    const inputs = { clip: ['2', 0], vae: ['3', 0], prompt: text, image1: ['13', 0] }
    for (let i = 1; i < images.length; i++) inputs[`image${i + 1}`] = [String(10 + i), 0]
    g[id] = { class_type: 'TextEncodeQwenImageEditPlus', inputs }
  }
  g[16] = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['14', 0], reference_latents_method: 'index_timestep_zero' } }
  g[17] = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['15', 0], reference_latents_method: 'index_timestep_zero' } }
  g[19] = {
    class_type: 'KSampler',
    inputs: {
      model: [fast ? '6' : '5', 0], positive: ['16', 0], negative: ['17', 0], latent_image: ['18', 0], seed,
      steps: fast ? 4 : 40, cfg: fast ? 1 : 4, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
    },
  }
  return g
}

const ROUND = (n) => Math.max(256, Math.min(2048, Math.round(n / 16) * 16))
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// Sends an attached image to ComfyUI's input folder and returns its name there.
async function upload(fetchImpl, image, index) {
  const ext = EXTENSIONS[image.mime]
  if (!ext) throw new Error('Only PNG, JPEG or WebP images can be references.')
  const form = new FormData()
  form.append('image', new Blob([Buffer.from(image.data, 'base64')], { type: image.mime }), `ref-${Date.now()}-${index}.${ext}`)
  form.append('subfolder', 'tsrs')
  form.append('type', 'input')
  const saved = await (await ask(fetchImpl, `${comfyUrl()}/upload/image`, { method: 'POST', body: form })).json()
  return saved.subfolder ? `${saved.subfolder}/${saved.name}` : saved.name
}

const missingModel = (what) =>
  new Error(`ComfyUI has no ${what} model. Install the files of its "${what}" workflow template.`)

// One image: from text with Z-Image Turbo, or from 1 to 3 attached images
// with Qwen-Image-Edit-2511. Returns base64 PNG and the seed.
export async function makeImage(job, fetchImpl = fetch, wait = sleep) {
  const prompt = String(job.prompt ?? '').trim()
  if (!prompt) throw new Error('Describe the image to make.')
  const images = Array.isArray(job.images) ? job.images.slice(0, 3) : []
  const seed = newSeed(job.seed)
  const prefix = `tsrs-image/${Date.now()}`
  const m = await imageModels(fetchImpl)
  let graph
  if (images.length) {
    if (!m.qUnet || !m.qClip || !m.qVae) throw missingModel('Qwen-Image-Edit-2511')
    const names = []
    for (const [i, image] of images.entries()) names.push(await upload(fetchImpl, image, i))
    graph = qwenEditGraph(m, names, prompt, seed, prefix)
  } else {
    if (!m.zUnet || !m.zClip || !m.zVae) throw missingModel('Z-Image Turbo')
    graph = zImageGraph(m, prompt, ROUND(Number(job.width) || 1344), ROUND(Number(job.height) || 768), seed, prefix)
  }
  const bytes = await run(graph, 'images', fetchImpl, wait, { signal: job.signal })
  return { mime: 'image/png', data: bytes.toString('base64'), seed, model: images.length ? 'qwen-image-edit-2511' : 'z-image-turbo' }
}

// ---- MiniMax H3 takes -------------------------------------------------------
// Video with sound from a prompt, made on this computer by MiniMax H3 through
// the ComfyUI-MiniMaxH3-Easy nodes (github: ComfyUI-MiniMaxH3-Easy), the same
// graph as its own workflow: Easy Model Adapter → MiniMax H3 Easy → Easy
// Output → SamplerCustomAdvanced → decoders → video file. Found by name:
//   diffusion_models/minimax_h3_fl2va*        first/last frame and text
//   diffusion_models/minimax_h3_ref2va*       reference pictures (optional)
//   text_encoders/qwen3vl_4b* (+ clip_projections/mmh3-4b-ClipProj*) or another H3 text encoder
//   vae/minimax_h3_video_vae*, vae/minimax_h3_audio_vae*
//   loras/minimax_h3*4step*fl2va* (optional: 4 steps instead of 20)
// MiniMax H3's own license applies to what it makes; check the territories it covers.
const H3_FILES = {
  fl2va: /minimax[-_]h3[-_]fl2va/i,
  ref2va: /minimax[-_]h3[-_]ref2va/i,
  clip: [/qwen3[-_]?vl[-_]4b/i, /qwen3[-_]?vl/i, /minimax[-_]h3.*text/i],
  videoVae: /minimax[-_]h3[-_]video[-_]vae/i,
  audioVae: /minimax[-_]h3[-_]audio[-_]vae/i,
  flLora: /minimax[-_]h3.*(4|8)[-_]?step.*fl2v/i,
  refLora: /(minimax[-_]h3|lightx2v).*ref2v.*(4|8)[-_]?step|ref2v.*turbo/i,
}
export const H3_RESOLUTIONS = ['360P', '416P', '480P', '540P', '640P', '720P', '768P', '832P']
export const H3_DEFAULT_STEPS = 20

async function info(fetchImpl, node) {
  try {
    return (await (await ask(fetchImpl, `${comfyUrl()}/object_info/${node}`)).json())?.[node] ?? null
  } catch (error) {
    if (/not answering/.test(error.message)) throw error
    return null
  }
}

// What ComfyUI has for H3: { ok, missing[], models }.
export async function h3Models(fetchImpl = fetch) {
  const [easy, unet, clip, vae, lora, proj, vhs, attention] = await Promise.all(
    ['MiniMaxH3Easy', 'UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'ClipProjApply', 'VHS_VideoCombine', 'ModelAttentionBackend'].map((n) => info(fetchImpl, n)),
  )
  const list = (node, input) => {
    const v = node?.input?.required?.[input]?.[0]
    return Array.isArray(v) ? v : Array.isArray(node?.input?.required?.[input]?.[1]?.options) ? node.input.required[input][1].options : []
  }
  const base = (name) => String(name).split(/[\\/]/).pop()
  const find = (names, patterns) => {
    for (const p of [].concat(patterns)) {
      const hit = names.find((n) => p.test(base(n)))
      if (hit) return hit
    }
    return ''
  }
  const unets = list(unet, 'unet_name')
  const clips = list(clip, 'clip_name')
  const vaes = list(vae, 'vae_name')
  const loras = list(lora, 'lora_name')
  const projections = list(proj, 'projection').filter((n) => !n.startsWith('<'))
  const models = {
    fl2va: find(unets, H3_FILES.fl2va),
    ref2va: find(unets, H3_FILES.ref2va),
    clip: find(clips, H3_FILES.clip),
    clipType: /qwen3[-_]?vl[-_]4b/i.test(base(find(clips, H3_FILES.clip))) ? 'krea2' : 'minimax',
    projection: base(find(clips, H3_FILES.clip)).match(/4b/i) ? find(projections, [/ClipProj[-_]v3/i, /4b.*ClipProj/i]) : '',
    videoVae: find(vaes, H3_FILES.videoVae),
    audioVae: find(vaes, H3_FILES.audioVae),
    flLora: find(loras, H3_FILES.flLora),
    refLora: find(loras, H3_FILES.refLora),
    vhs: !!vhs,
    attention: list(attention, 'attention').includes('comfy kitchen attention') ? 'comfy kitchen attention' : '',
  }
  const missing = []
  if (!easy) missing.push('the ComfyUI-MiniMaxH3-Easy nodes')
  if (!models.fl2va && !models.ref2va) missing.push('diffusion_models/minimax_h3_fl2va*')
  if (!models.clip) missing.push('an H3 text encoder (text_encoders/qwen3vl_4b*)')
  if (!models.videoVae) missing.push('vae/minimax_h3_video_vae*')
  if (!models.audioVae) missing.push('vae/minimax_h3_audio_vae*')
  return { ok: missing.length === 0, missing, models }
}

// The API graph. `o`: { prompt, mode: 'image' | 'reference', images: [names in
// ComfyUI's input folder], role: 'first' | 'last', resolution, aspect, frames,
// seed, steps, prefix }.
export function h3Graph(m, o) {
  const reference = o.mode === 'reference'
  const unet = reference ? m.ref2va || m.fl2va : m.fl2va || m.ref2va
  const lora = reference ? (m.ref2va ? m.refLora : m.flLora) : m.fl2va ? m.flLora : m.refLora
  const steps = Number(o.steps) > 0 ? Number(o.steps) : lora ? 4 : H3_DEFAULT_STEPS
  const g = {
    1: { class_type: 'UNETLoader', inputs: { unet_name: unet, weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: m.clip, type: m.clipType, device: 'default' } },
    4: { class_type: 'VAELoader', inputs: { vae_name: m.videoVae } },
    5: { class_type: 'VAELoader', inputs: { vae_name: m.audioVae } },
    6: {
      class_type: 'MiniMaxH3EasyModelAdapter',
      inputs: { text_encoder: [m.projection ? '3' : '2', 0], video_vae: ['4', 0], audio_vae: ['5', 0], [unet === m.ref2va && m.ref2va ? 'ref2va_model' : 'fl2va_model']: ['1', 0] },
    },
    8: {
      class_type: 'MiniMaxH3Easy',
      inputs: {
        h3_bundle: ['6', 0],
        mode: reference ? 'reference' : 'image',
        prompt: o.prompt,
        resolution: o.resolution ?? '540P',
        aspect_ratio: o.aspect ?? '16:9',
        width: 1344,
        height: 768,
        // The node rounds seconds to 17n+5 frames the same way.
        seconds: Math.round((o.frames / 24) * 1000) / 1000,
        advanced: false,
        fps: 24,
        keyframe_role: o.role === 'last' ? 'last' : 'first',
        // References no larger than the clip: what matters most on 8 GB.
        ref_image_size: 'match',
        reference_mention_mode: 'index',
        prompt_optimizer_settings: false,
        prompt_optimizer_scene_guide: 'none',
      },
    },
    11: { class_type: 'MiniMaxH3EasyOutput', inputs: { h3_context: ['8', 1] } },
    12: { class_type: 'BasicScheduler', inputs: { model: ['10', 0], scheduler: 'simple', steps, denoise: 1 } },
    13: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    14: { class_type: 'RandomNoise', inputs: { noise_seed: o.seed } },
    15: { class_type: 'BasicGuider', inputs: { model: ['10', 0], conditioning: ['11', 0] } },
    16: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['14', 0], guider: ['15', 0], sampler: ['13', 0], sigmas: ['12', 0], latent_image: ['11', 1] } },
    17: { class_type: 'VAEDecode', inputs: { samples: ['16', 0], vae: ['11', 2] } },
    18: { class_type: 'VAEDecodeAudio', inputs: { samples: ['16', 1], vae: ['11', 3] } },
  }
  if (m.projection) g[3] = { class_type: 'ClipProjApply', inputs: { clip: ['2', 0], projection: m.projection } }
  const images = o.images ?? []
  if (images.length) {
    const bridge = { image_count: images.length, video_count: 0, audio_count: 0 }
    images.forEach((name, i) => {
      g[30 + i] = { class_type: 'LoadImage', inputs: { image: name } }
      bridge[`image_${i + 1}`] = [String(30 + i), 0]
    })
    g[7] = { class_type: 'MiniMaxH3EasyMediaBridge', inputs: bridge }
    g[8].inputs.media = ['7', 0]
  }
  // The model, through the speed LoRA and the attention backend.
  let model = ['8', 0]
  if (lora) {
    g[9] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: lora, strength_model: 1 } }
    model = ['9', 0]
  } else {
    // The base model's own sampling: video shift 12, audio 3.
    g[9] = { class_type: 'MiniMaxH3SigmaShift', inputs: { model, shift_video: 12, shift_audio: 3 } }
    model = ['9', 0]
  }
  g[10] = m.attention ? { class_type: 'ModelAttentionBackend', inputs: { model, attention: m.attention } } : { class_type: 'MiniMaxLowVRAMAttention', inputs: { model, head_chunks: 4 } }
  if (m.vhs) {
    g[19] = {
      class_type: 'VHS_VideoCombine',
      inputs: { images: ['17', 0], audio: ['18', 0], frame_rate: 24, loop_count: 0, filename_prefix: o.prefix, format: 'video/h264-mp4', pingpong: false, save_output: true },
    }
  } else {
    g[19] = { class_type: 'CreateVideo', inputs: { images: ['17', 0], audio: ['18', 0], fps: ['11', 4] } }
    g[20] = { class_type: 'SaveVideo', inputs: { video: ['19', 0], filename_prefix: o.prefix, format: 'auto', codec: 'auto' } }
  }
  return { graph: g, steps, unet, lora }
}

// One take: { prompt, frames, mode, images: [{ mime, data }], role,
// resolution, aspect, seed, steps, signal, onStart }. Returns the MP4 as a
// Buffer, with the seed and the files used.
export async function makeTake(job, fetchImpl = fetch, wait = sleep) {
  const prompt = String(job.prompt ?? '').trim()
  if (!prompt) throw new Error('A take needs a prompt.')
  if (!H3_RESOLUTIONS.includes(job.resolution ?? '540P')) throw new Error(`resolution is one of ${H3_RESOLUTIONS.join(', ')}.`)
  const { ok, missing, models } = await h3Models(fetchImpl)
  if (!ok) throw new Error(`ComfyUI is missing ${missing.join(', ')}.`)
  const seed = newSeed(job.seed)
  const names = []
  for (const [i, image] of (job.images ?? []).slice(0, 9).entries()) names.push(await upload(fetchImpl, image, i))
  const { graph, steps, unet, lora } = h3Graph(models, { ...job, prompt, images: names, seed, prefix: `tsrs-take/${Date.now()}` })
  const bytes = await run(graph, 'video', fetchImpl, wait, { signal: job.signal, maxWait: job.maxWait ?? 90 * 60_000, onStart: job.onStart })
  return { bytes, seed, steps, models: { unet, lora, clip: models.clip, projection: models.projection } }
}

// ---- Turnaround: five views of a character from one picture -----------------
// matlod's Turnaround LoRA on MiniMax H3 Ref2VA, with MATLOWAI's contact-sheet
// nodes (ComfyUI-H3-ContactSheet, GPL-3.0, run inside ComfyUI): five still
// pictures ride where the five latent steps of a 17-frame clip would go, so
// the model's consistency along time becomes consistency between the views.
// Settings as the LoRA was trained (Imagination Studio's notes, Apache-2.0):
// 512 px, res_multistep, simple, 28 passes; strength 1.0 turns the furthest,
// about 0.7 keeps the look closest. The words "level" and "upright" stop the
// model reading the orbit as a roll of the picture.
export const TURNAROUND_PROMPT =
  'the camera orbits horizontally around the subject of <Picture 1> at eye level, ninety degrees clockwise, the subject stays upright on the ground'
export const TURNAROUND_SOURCES = {
  nodes: 'https://github.com/matlowai/ComfyUI-H3-ContactSheet (GPL-3.0; into ComfyUI/custom_nodes)',
  lora: 'https://huggingface.co/matlod/minimax-h3-turnaround (minimax_h3_five_view_512_s1500.safetensors, into ComfyUI/models/loras; under the MiniMax H3 Community License)',
}

export async function turnaroundModels(fetchImpl = fetch) {
  const { models } = await h3Models(fetchImpl)
  const [sheet, decode, lora] = await Promise.all(['H3ContactSheet', 'H3ContactSheetDecode', 'LoraLoaderModelOnly'].map((n) => info(fetchImpl, n)))
  const loras = lora?.input?.required?.lora_name?.[0] ?? []
  const turn = loras.find((n) => /turnaround|five[-_]view/i.test(String(n).split(/[\\/]/).pop()))
  const missing = []
  if (!sheet || !decode) missing.push(`the contact-sheet nodes: ${TURNAROUND_SOURCES.nodes}`)
  if (!turn) missing.push(`the Turnaround LoRA: ${TURNAROUND_SOURCES.lora}`)
  if (!models.ref2va) missing.push('the H3 Ref2VA model (diffusion_models/minimax_h3_ref2va*)')
  if (!models.clip || !models.videoVae) missing.push('the H3 text encoder and video VAE')
  return { ok: missing.length === 0, missing, models: { ...models, turnLora: turn ?? '' } }
}

export function turnaroundGraph(m, o) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: m.ref2va, weight_dtype: 'default' } },
    2: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: m.turnLora, strength_model: o.strength ?? 1 } },
    3: { class_type: 'CLIPLoader', inputs: { clip_name: m.clip, type: m.clipType, device: 'default' } },
    ...(m.projection ? { 5: { class_type: 'ClipProjApply', inputs: { clip: ['3', 0], projection: m.projection } } } : {}),
    4: { class_type: 'VAELoader', inputs: { vae_name: m.videoVae } },
    6: { class_type: 'LoadImage', inputs: { image: o.image } },
    7: { class_type: 'H3ContactSheet', inputs: { clip: [m.projection ? '5' : '3', 0], vae: ['4', 0], prompt: o.prompt ?? TURNAROUND_PROMPT, ref_image: ['6', 0], size: o.size ?? 512 } },
    8: { class_type: 'RandomNoise', inputs: { noise_seed: o.seed } },
    9: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    10: { class_type: 'BasicScheduler', inputs: { model: ['2', 0], scheduler: 'simple', steps: o.steps ?? 28, denoise: 1 } },
    11: { class_type: 'BasicGuider', inputs: { model: ['2', 0], conditioning: ['7', 0] } },
    12: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['8', 0], guider: ['11', 0], sampler: ['9', 0], sigmas: ['10', 0], latent_image: ['7', 1] } },
    13: { class_type: 'H3ContactSheetDecode', inputs: { vae: ['4', 0], samples: ['12', 0] } },
    14: { class_type: 'SaveImage', inputs: { images: ['13', 0], filename_prefix: `${o.prefix}_view` } },
    15: { class_type: 'SaveImage', inputs: { images: ['13', 1], filename_prefix: `${o.prefix}_sheet` } },
  }
}

// { image: { mime, data }, size, strength, steps, seed, signal } → { sheet, views: [5 Buffers], seed }
export async function makeTurnaround(job, fetchImpl = fetch, wait = sleep) {
  const size = Number(job.size ?? 512)
  if (size % 32 || size < 512 || size > 2048) throw new Error('size is a multiple of 32 from 512 to 2048.')
  const { ok, missing, models } = await turnaroundModels(fetchImpl)
  if (!ok) throw new Error(`ComfyUI is missing ${missing.join('; ')}.`)
  const seed = newSeed(job.seed)
  const image = await upload(fetchImpl, job.image, 0)
  const graph = turnaroundGraph(models, { image, size, strength: job.strength, steps: job.steps, seed, prefix: `tsrs-turn/${Date.now()}` })
  const files = await run(graph, 'files', fetchImpl, wait, { signal: job.signal, maxWait: job.maxWait ?? 60 * 60_000 })
  const views = files.filter((f) => f.node === '14').map((f) => f.bytes)
  const sheet = files.find((f) => f.node === '15')?.bytes
  if (views.length !== 5 || !sheet) throw new Error('ComfyUI finished without the five views.')
  return { sheet, views, seed, strength: job.strength ?? 1 }
}
