// Images made on this computer by stable-diffusion.cpp's sd-server: no key,
// no cost per file, and it runs on GPUs that ComfyUI's PyTorch does not reach
// (Vulkan, e.g. older AMD cards). The TSRS server asks it and hands the file
// back, as with ComfyUI. sd-server runs at TSRS_SDCPP (http://127.0.0.1:1234,
// its own default, unless set) with whatever model it was started with, e.g.
//   sd-server --diffusion-model z_image_turbo-Q4_K.gguf --llm Qwen3-4B-Instruct-2507-Q4_K_M.gguf
//     --vae ae.safetensors --offload-to-cpu --cfg-scale 1.0 --steps 8
// Steps, guidance and sampler come from how it was started; TSRS sends the
// prompt, size and seed. Each model's own license applies to what it makes.

const MAX_WAIT_MS = 15 * 60_000

export function sdcppUrl() {
  return (process.env.TSRS_SDCPP || 'http://127.0.0.1:1234').replace(/\/+$/, '')
}

const unreachable = (base) =>
  new Error(`sd-server is not answering at ${base}. Start it, or set TSRS_SDCPP to where it runs.`)

async function ask(fetchImpl, url, init) {
  let res
  try {
    res = await fetchImpl(url, init)
  } catch {
    throw unreachable(sdcppUrl())
  }
  if (res.status === 404 && url.endsWith('/capabilities')) {
    throw new Error(`What answers at ${sdcppUrl()} is not sd-server (no /sdcpp/v1/capabilities).`)
  }
  if (!res.ok) throw new Error(`sd-server (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return res
}

// Whether sd-server answers, and the model it has loaded.
export async function sdcppStatus(fetchImpl = fetch) {
  const base = sdcppUrl()
  try {
    const info = await (await ask(fetchImpl, `${base}/sdcpp/v1/capabilities`)).json()
    const modes = info.supported_modes ?? []
    return { ok: modes.includes('img_gen'), url: base, model: info.model?.stem ?? '', modes }
  } catch (err) {
    return { ok: false, url: base, error: err.message }
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const newSeed = (seed) => (Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2 ** 31))
const ROUND = (n) => Math.max(64, Math.min(4096, Math.round(n / 16) * 16))
const FORMATS = ['image/png', 'image/jpeg', 'image/webp']

// One image from text; with 1 to 3 attached images they go as references,
// which an edit model (Qwen-Image-Edit, Flux Kontext) edits from. Returns
// base64 PNG, the seed and the model sd-server has loaded.
export async function makeImage(job, fetchImpl = fetch, wait = sleep) {
  const prompt = String(job.prompt ?? '').trim()
  if (!prompt) throw new Error('Describe the image to make.')
  const images = Array.isArray(job.images) ? job.images.slice(0, 3) : []
  if (images.some((image) => !FORMATS.includes(image.mime))) {
    throw new Error('Only PNG, JPEG or WebP images can be references.')
  }
  const base = sdcppUrl()
  const info = await (await ask(fetchImpl, `${base}/sdcpp/v1/capabilities`)).json()
  if (!(info.supported_modes ?? []).includes('img_gen')) {
    throw new Error(`The model sd-server has loaded (${info.model?.stem ?? '?'}) does not make images.`)
  }
  const seed = newSeed(job.seed)
  const queued = await (
    await ask(fetchImpl, `${base}/sdcpp/v1/img_gen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        width: ROUND(Number(job.width) || 1024),
        height: ROUND(Number(job.height) || 1024),
        seed,
        batch_count: 1,
        output_format: 'png',
        ...(images.length ? { ref_images: images.map((i) => `data:${i.mime};base64,${i.data}`) } : {}),
      }),
    })
  ).json()
  const started = Date.now()
  for (;;) {
    await wait(1000)
    const run = await (await ask(fetchImpl, `${base}/sdcpp/v1/jobs/${encodeURIComponent(queued.id)}`)).json()
    if (run.status === 'completed') {
      const data = run.result?.images?.[0]?.b64_json
      if (!data) throw new Error('sd-server made no image.')
      return { mime: 'image/png', data, seed, model: info.model?.stem ?? 'sd-server' }
    }
    if (run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(`sd-server: ${run.error?.message ?? `the run was ${run.status}`}`.slice(0, 400))
    }
    if (Date.now() - started > MAX_WAIT_MS) throw new Error('sd-server took more than 15 minutes.')
  }
}
