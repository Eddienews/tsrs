import { expect, test } from '@playwright/test'
import { audioGraph, audioPrompt, comfyStatus, makeAudio, makeImage } from '../server/comfy.mjs'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('puts the tempo and an exact length in the Stable Audio 3 prompt', () => {
  expect(audioPrompt({ prompt: 'soft jazz trio.', bpm: 120, bars: 16 })).toEqual({
    text: 'soft jazz trio. BPM: 120. Length: 32 seconds',
    seconds: 32,
  })
  expect(audioPrompt({ prompt: 'door creak', seconds: 3 })).toEqual({ text: 'door creak. Length: 3 seconds', seconds: 3 })
  expect(audioPrompt({ prompt: 'rain' }).seconds).toBe(30)
  expect(() => audioPrompt({ prompt: ' ' })).toThrow('Describe')
  expect(() => audioPrompt({ prompt: 'x', seconds: 600 })).toThrow('380')
  const graph = audioGraph('t', 10, 5, 'p') as any
  expect(graph[5].inputs).toEqual({ seconds: 10, batch_size: 1 })
  expect(graph[6].inputs).toMatchObject({ seed: 5, steps: 8, cfg: 1, sampler_name: 'lcm' })
})

test('asks a fake ComfyUI, waits for the run and returns the FLAC', async () => {
  const asked: string[] = []
  let polls = 0
  let sent: any
  const fetchImpl = async (url: string, init: any) => {
    asked.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/prompt')) {
      sent = JSON.parse(init.body)
      return json({ prompt_id: 'abc', node_errors: {} })
    }
    if (url.endsWith('/history/abc')) {
      polls++
      if (polls < 3) return json({})
      return json({
        abc: { status: { status_str: 'success' }, outputs: { 8: { audio: [{ filename: 'a.flac', subfolder: 'tsrs-audio', type: 'output' }] } } },
      })
    }
    if (url.includes('/view?')) return new Response(new Uint8Array([1, 2, 3]))
    throw new TypeError('fetch failed')
  }
  const made = await makeAudio({ prompt: 'jazz', bpm: 90, bars: 8, seed: 42 }, fetchImpl, async () => {})
  expect(made).toMatchObject({ mime: 'audio/flac', data: 'AQID', seed: 42, prompt: 'jazz. BPM: 90. Length: 21 seconds' })
  expect(sent.prompt[3].inputs.text).toBe('jazz. BPM: 90. Length: 21 seconds')
  expect(sent.prompt[5].inputs.seconds).toBeCloseTo(21.333, 3)
  expect(asked.at(-1)).toContain('/view?filename=a.flac&subfolder=tsrs-audio&type=output')
  expect(polls).toBe(3)
})

test('reports a failed run, a refused graph and a ComfyUI that is not running', async () => {
  const failed = async (url: string) =>
    url.endsWith('/prompt')
      ? json({ prompt_id: 'x' })
      : json({ x: { status: { status_str: 'error', messages: [['execution_error', { exception_message: 'out of memory' }]] } } })
  await expect(makeAudio({ prompt: 'a' }, failed, async () => {})).rejects.toThrow('out of memory')
  const refused = async () => json({ prompt_id: 'x', node_errors: { 1: { errors: ['ckpt not found'] } } })
  await expect(makeAudio({ prompt: 'a' }, refused, async () => {})).rejects.toThrow('ckpt not found')
  const down = async () => {
    throw new TypeError('fetch failed')
  }
  await expect(makeAudio({ prompt: 'a' }, down, async () => {})).rejects.toThrow('ComfyUI is not answering at http://127.0.0.1:8188')
  expect(await comfyStatus(down)).toMatchObject({ ok: false })
})

test('says which Stable Audio 3 files ComfyUI is missing', async () => {
  const info = (checkpoints: string[], encoders: string[]) => async (url: string) =>
    url.endsWith('CheckpointLoaderSimple')
      ? json({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [checkpoints] } } } })
      : json({ CLIPLoader: { input: { required: { clip_name: [encoders] } } } })
  expect(await comfyStatus(info(['stable_audio_3_medium.safetensors'], ['t5gemma_b_b_ul2.safetensors']))).toMatchObject({ ok: true, missing: [] })
  expect(await comfyStatus(info([], ['t5gemma_b_b_ul2.safetensors']))).toMatchObject({
    ok: false,
    missing: ['stable_audio_3_medium.safetensors'],
  })
})

// A fake ComfyUI with the image models, recording what it was sent.
function imageComfy(files: { unets: string[]; loras?: string[] }) {
  const sent: { graph?: any; uploads: string[] } = { uploads: [] }
  const lists: Record<string, [string, string[]]> = {
    UNETLoader: ['unet_name', files.unets],
    CLIPLoader: ['clip_name', ['qwen_3_4b_fp8_mixed.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors']],
    VAELoader: ['vae_name', ['ae.safetensors', 'qwen_image_vae.safetensors']],
    LoraLoaderModelOnly: ['lora_name', files.loras ?? []],
  }
  const fetchImpl = async (url: string, init: any) => {
    const node = /object_info\/(\w+)$/.exec(url)?.[1]
    if (node) return json({ [node]: { input: { required: { [lists[node][0]]: [lists[node][1]] } } } })
    if (url.endsWith('/upload/image')) {
      const file = init.body.get('image') as File
      sent.uploads.push(`${file.name}:${file.type}:${init.body.get('subfolder')}`)
      return json({ name: file.name, subfolder: 'tsrs', type: 'input' })
    }
    if (url.endsWith('/prompt')) {
      sent.graph = JSON.parse(init.body).prompt
      return json({ prompt_id: 'p' })
    }
    if (url.endsWith('/history/p')) {
      return json({ p: { status: { status_str: 'success' }, outputs: { 21: { images: [{ filename: 'i.png', subfolder: 'tsrs-image', type: 'output' }] } } } })
    }
    if (url.includes('/view?')) return new Response(new Uint8Array([9, 9]))
    throw new TypeError('fetch failed')
  }
  return { fetchImpl, sent }
}

test('makes an image from text with Z-Image Turbo, whatever precision is installed', async () => {
  const { fetchImpl, sent } = imageComfy({ unets: ['z_image_turbo_int8_convrot.safetensors'] })
  const made = await makeImage({ prompt: 'a red bicycle', width: 1000, height: 700, seed: 1 }, fetchImpl, async () => {})
  expect(made).toEqual({ mime: 'image/png', data: 'CQk=', seed: 1, model: 'z-image-turbo' })
  expect(sent.graph[1].inputs.unet_name).toBe('z_image_turbo_int8_convrot.safetensors')
  expect(sent.graph[2].inputs.clip_name).toBe('qwen_3_4b_fp8_mixed.safetensors')
  // Sizes are rounded to multiples of 16.
  expect(sent.graph[7].inputs).toEqual({ width: 1008, height: 704, batch_size: 1 })
  expect(sent.uploads).toEqual([])
})

test('edits from up to 3 attached images with Qwen-Image-Edit, fast with the Lightning LoRA', async () => {
  const { fetchImpl, sent } = imageComfy({
    unets: ['z_image_turbo_bf16.safetensors', 'qwen_image_edit_2511_bf16.safetensors'],
    loras: ['Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors'],
  })
  const images = ['AQ==', 'Ag==', 'Aw==', 'BA=='].map((data) => ({ mime: 'image/png', data }))
  const made = await makeImage({ prompt: 'same characters, new pose', images, seed: 2 }, fetchImpl, async () => {})
  expect(made.model).toBe('qwen-image-edit-2511')
  expect(sent.uploads).toHaveLength(3)
  expect(sent.uploads[0]).toMatch(/^ref-\d+-0\.png:image\/png:tsrs$/)
  expect(sent.graph[1].inputs.unet_name).toBe('qwen_image_edit_2511_bf16.safetensors')
  expect(sent.graph[12].inputs.image).toMatch(/^tsrs\/ref-\d+-2\.png$/)
  expect(sent.graph[14].inputs.image3).toEqual(['12', 0])
  expect(sent.graph[19].inputs).toMatchObject({ model: ['6', 0], steps: 4, cfg: 1 })
  // Without the LoRA: the template's 40 steps.
  const slow = imageComfy({ unets: ['qwen_image_edit_2511_fp8.safetensors'] })
  await makeImage({ prompt: 'x', images: images.slice(0, 1) }, slow.fetchImpl, async () => {})
  expect(slow.sent.graph[6]).toBeUndefined()
  expect(slow.sent.graph[19].inputs).toMatchObject({ model: ['5', 0], steps: 40, cfg: 4 })
})

test('says which image model ComfyUI lacks and refuses other reference formats', async () => {
  const none = imageComfy({ unets: [] })
  await expect(makeImage({ prompt: 'x' }, none.fetchImpl, async () => {})).rejects.toThrow('no Z-Image Turbo model')
  await expect(makeImage({ prompt: 'x', images: [{ mime: 'image/png', data: 'AQ==' }] }, none.fetchImpl, async () => {})).rejects.toThrow(
    'no Qwen-Image-Edit-2511 model',
  )
  const qwen = imageComfy({ unets: ['qwen_image_edit_2511_bf16.safetensors'] })
  await expect(makeImage({ prompt: 'x', images: [{ mime: 'image/gif', data: 'AQ==' }] }, qwen.fetchImpl, async () => {})).rejects.toThrow('PNG')
  await expect(makeImage({ prompt: ' ' }, qwen.fetchImpl, async () => {})).rejects.toThrow('Describe')
})
