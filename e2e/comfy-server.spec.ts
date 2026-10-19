import { expect, test } from '@playwright/test'
import { audioGraph, audioPrompt, comfyStatus, makeAudio } from '../server/comfy.mjs'

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
