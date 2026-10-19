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

// Queues a graph, waits for it and returns the first file of `kind` it saved.
async function run(graph, kind, fetchImpl, wait) {
  const base = comfyUrl()
  const queued = await (
    await ask(fetchImpl, `${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: 'tsrs' }),
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
    const file = Object.values(history.outputs ?? {}).flatMap((o) => o[kind] ?? [])[0]
    if (!file) throw new Error('ComfyUI made no file.')
    const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'output' })
    return Buffer.from(await (await ask(fetchImpl, `${base}/view?${query}`)).arrayBuffer())
  }
}

const newSeed = (seed) => (Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2 ** 31))

// Makes one file and returns it as base64 FLAC, with the seed and the prompt sent.
export async function makeAudio(job, fetchImpl = fetch, wait = sleep) {
  const { text, seconds } = audioPrompt(job)
  const seed = newSeed(job.seed)
  const bytes = await run(audioGraph(text, seconds, seed, `tsrs-audio/${Date.now()}`), 'audio', fetchImpl, wait)
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
  const bytes = await run(graph, 'images', fetchImpl, wait)
  return { mime: 'image/png', data: bytes.toString('base64'), seed, model: images.length ? 'qwen-image-edit-2511' : 'z-image-turbo' }
}
