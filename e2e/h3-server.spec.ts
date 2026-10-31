import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createAgent } from '../server/agent.mjs'
import { h3Graph, h3Models, makeTake } from '../server/comfy.mjs'
import { checkShot, composeShot, findNegations, framesFor, lead, MOUTH, validFrames } from '../server/h3prompt.mjs'
import { createQueue } from '../server/jobs.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('snaps clip lengths to the 17n+5 frames H3 takes', () => {
  expect([2, 5, 8, 10, 15, 40].map(framesFor)).toEqual([56, 124, 192, 243, 362, 362])
  expect(framesFor(0)).toBe(22)
  expect([22, 124, 362].every(validFrames)).toBe(true)
  expect([21, 120, 379].some(validFrames)).toBe(false)
})

test("writes a shot in H3's own form: camera words, beats, lines with their language, sound under its heading", () => {
  const { prompt, frames, seconds } = composeShot({
    scene: 'A small bakery at dawn',
    size: 'MS',
    angle: 'eye level',
    movement: 'push-in',
    beats: ['the baker dusts flour on the counter', 'she looks up and smiles'],
    dialogue: [{ speaker: 'The baker', voice: 'a warm, low voice', text: 'Bom dia! O pão está saindo.', language: 'pt' }],
    soundscape: 'Ovens humming',
    seconds: 5,
    start: 'first',
  })
  expect(frames).toBe(124)
  expect(seconds).toBe(5.17)
  expect(prompt.startsWith(lead('first', 124))).toBe(true)
  expect(prompt).toContain('integrated_multimodal_description: [Shot 1] A small bakery at dawn. Medium shot at eye level. The camera pushes in with small amplitude at slow speed. First, the baker dusts flour on the counter. Finally, she looks up and smiles.')
  expect(prompt).toContain('The baker, in a warm, low voice (S1), says: <d>[Portuguese] Bom dia! O pão está saindo.</d>')
  expect(prompt).toContain(MOUTH)
  expect(prompt).toContain('overall_soundscape: Ovens humming. After the spoken lines only ambient sound is heard.')
  expect(prompt).toMatch(/non_diegetic_music: N\/A$/)
  expect(prompt).not.toContain('[Shot 2]')

  // A silent shot with people: closed mouths, and only ambient sound.
  const quiet = composeShot({ scene: 'A man reads by the window', seconds: 3 }).prompt
  expect(quiet).toContain('A man reads by the window. Mouths stay closed.')
  expect(quiet).toContain('Only ambient sound is heard.')
  expect(composeShot({ scene: 'Rain on an empty street', seconds: 3 }).prompt).not.toContain('Mouths')

  const lastFrame = composeShot({ scene: 'x', start: 'first-last', seconds: 5 }).prompt
  expect(lastFrame).toContain('at 5.17 seconds into the target video, <Picture 2> (from [Shot 1]) is fully referenced.')
})

test('writes the reference form: who each picture is, kept as it is, the sound under its own heading', () => {
  const { prompt } = composeShot({ start: 'reference', subjects: ['Seu Silva, a grey-bearded man in glasses', 'Nori, a small robot'], scene: 'A kitchen', action: 'He opens the fridge', seconds: 5 })
  expect(prompt).toContain('<Subject 1> is Seu Silva, a grey-bearded man in glasses shown in <Picture 1>.')
  expect(prompt).toContain('<Subject 2> (appears in [Shot 1]): fully_preserved')
  expect(prompt).toContain('detailed_description:\n[Shot 1] A kitchen. He opens the fridge. Mouths stay closed.')
  expect(prompt).toMatch(/\n\noverall_soundscape:\nNatural ambient sound/)
})

test('finds what H3 gets wrong: "no X", speech in the picture, too many words, bad lengths', () => {
  expect(findNegations('Ninguém olha para a câmera, sem fotos. No photographs on the walls. Not only that, a dog.')).toEqual([
    'No photographs on the walls',
    'Ninguém olha para a câmera',
    'sem fotos',
  ])
  // Spoken lines may say anything.
  expect(findNegations('<d>[English] No, never again.</d>')).toEqual([])

  const checks = checkShot({
    scene: 'He says "hello there my friend" to the dog',
    frames: 50,
    aspect: '5:4',
    dialogue: [{ speaker: 'Ana', text: 'Uma frase longa demais para caber em tão pouco tempo de vídeo, sem chance alguma', language: 'pt' }],
  })
  const text = checks.map((c) => `${c.level}: ${c.text}`).join('\n')
  expect(text).toContain('error: H3 takes 17n+5 frames (22 to 362); 50 is not one. Nearest: 56.')
  expect(text).toContain('error: Aspect 5:4')
  expect(text).toMatch(/error: \d+ Portuguese words in 5\.17 s is more than 2\.8 a second/)
  expect(text).toContain('warn: Spoken words are written in the scene or action')
  expect(checkShot({ scene: 'A quiet lake at dawn', seconds: 5 })).toEqual([])
})

test('the GPU queue runs one job at a time, waits, and cancels for real', async () => {
  const queue = createQueue({ max: 3 })
  const log: string[] = []
  let release!: () => void
  const first = queue.submit({ kind: 'take', title: 'a' }, async (_job: unknown, { signal }: { signal: AbortSignal }) => {
    log.push('a start')
    await new Promise<void>((done, fail) => {
      release = done
      signal.addEventListener('abort', () => fail(new Error('stopped')))
    })
    log.push('a end')
    return { file: 'a.mp4' }
  })
  const second = queue.submit({ kind: 'take', title: 'b' }, async () => {
    log.push('b start')
    return { file: 'b.mp4' }
  })
  const third = queue.submit({ kind: 'take', title: 'c' }, async () => ({ file: 'c.mp4' }))
  expect(() => queue.submit({ kind: 'take' }, async () => null)).toThrow('queue is full')
  await new Promise((r) => setTimeout(r, 10))
  expect(queue.get(first.id)).toMatchObject({ status: 'running' })
  expect(queue.get(second.id)).toMatchObject({ status: 'queued', position: 1 })
  expect(queue.cancel(third.id)).toMatchObject({ status: 'canceled' })

  // A wait that ends before the job does says where it is.
  expect((await queue.wait([first.id], 0.05))[0]).toMatchObject({ status: 'running' })
  release()
  const [a, b] = await queue.wait([first.id, second.id], 5)
  expect(a).toMatchObject({ status: 'done', result: { file: 'a.mp4' } })
  expect(b).toMatchObject({ status: 'done', result: { file: 'b.mp4' } })
  expect(log).toEqual(['a start', 'a end', 'b start'])

  const long = queue.submit({ kind: 'take', title: 'd' }, (_job: unknown, { signal }: { signal: AbortSignal }) =>
    new Promise((_done, fail) => signal.addEventListener('abort', () => fail(new Error('stopped')))),
  )
  await new Promise((r) => setTimeout(r, 10))
  expect(queue.cancel(long.id)).toMatchObject({ status: 'canceling' })
  expect((await queue.wait([long.id], 5))[0]).toMatchObject({ status: 'canceled', error: null })
  await expect(queue.wait(['nope'], 1)).rejects.toThrow('No job nope')
})

// A fake ComfyUI with the H3 nodes and models of the Easy workflow.
function fakeComfy(opts: { hang?: boolean } = {}) {
  const asked: string[] = []
  let sent: any
  let polls = 0
  const objectInfo: Record<string, unknown> = {
    MiniMaxH3Easy: { input: { required: {} } },
    UNETLoader: { input: { required: { unet_name: [['minimax_h3_fl2va_pruned_w4a8_mixed.safetensors', 'minimax_h3_ref2va_pruned_w4a8_mixed.safetensors', 'z_image_turbo.safetensors']] } } },
    CLIPLoader: { input: { required: { clip_name: [['qwen3vl_4b_fp8_scaled.safetensors', 'qwen_3_4b.safetensors']] } } },
    VAELoader: { input: { required: { vae_name: [['minimax_h3_video_vae_int8_convrot.safetensors', 'minimax_h3_audio_vae_fp32.safetensors', 'ae.safetensors']] } } },
    LoraLoaderModelOnly: { input: { required: { lora_name: [['minimax_h3_4step_lora_flashgen_v1.0_768p_fl2va_pruned_avg_rank_13_bf16.safetensors']] } } },
    ClipProjApply: { input: { required: { projection: [['<control:zero>', 'mmh3-4b-ClipProj-celeb-mlp.safetensors', 'mmh3-4b-ClipProj-v3.1-mlp.safetensors']] } } },
    VHS_VideoCombine: { input: { required: {} } },
    ModelAttentionBackend: { input: { required: { attention: ['COMBO', { options: ['pytorch attention', 'comfy kitchen attention'] }] } } },
  }
  const fetchImpl = async (url: string, init: any = {}) => {
    asked.push(`${init.method ?? 'GET'} ${url.replace('http://127.0.0.1:8188', '')}${init.body && typeof init.body === 'string' && !url.endsWith('/prompt') ? ` ${init.body}` : ''}`)
    const node = /\/object_info\/(\w+)$/.exec(url)?.[1]
    if (node) return json(objectInfo[node] ? { [node]: objectInfo[node] } : {})
    if (url.endsWith('/upload/image')) return json({ name: `ref-${asked.length}.png`, subfolder: 'tsrs' })
    if (url.endsWith('/prompt')) {
      sent = JSON.parse(init.body)
      return json({ prompt_id: 'p1', node_errors: {} })
    }
    if (url.endsWith('/queue') && (init.method ?? 'GET') === 'GET') return json({ queue_running: [[0, 'p1']], queue_pending: [] })
    if (url.endsWith('/queue') || url.endsWith('/interrupt')) return json({})
    if (url.endsWith('/history/p1')) {
      polls++
      if (opts.hang || polls < 2) return json({})
      return json({ p1: { status: { status_str: 'success' }, outputs: { 19: { gifs: [{ filename: 'take_00001-audio.mp4', subfolder: 'tsrs-take', type: 'output' }] } } } })
    }
    if (url.includes('/view?')) return new Response(new Uint8Array([0, 0, 0, 24]))
    throw new TypeError('fetch failed')
  }
  return { fetchImpl, asked, sent: () => sent }
}

test("builds the Easy workflow's graph from what ComfyUI has, and stops a run that is canceled", async () => {
  const comfy = fakeComfy()
  const { ok, models } = await h3Models(comfy.fetchImpl as any)
  expect(ok).toBe(true)
  expect(models).toMatchObject({
    fl2va: 'minimax_h3_fl2va_pruned_w4a8_mixed.safetensors',
    clip: 'qwen3vl_4b_fp8_scaled.safetensors',
    clipType: 'krea2',
    projection: 'mmh3-4b-ClipProj-v3.1-mlp.safetensors',
    flLora: 'minimax_h3_4step_lora_flashgen_v1.0_768p_fl2va_pruned_avg_rank_13_bf16.safetensors',
    attention: 'comfy kitchen attention',
    vhs: true,
  })
  const { graph, steps } = h3Graph(models, { prompt: 'P', mode: 'image', images: ['tsrs/a.png'], frames: 124, seed: 9, prefix: 'x' }) as any
  expect(steps).toBe(4)
  expect(graph[8].inputs).toMatchObject({ mode: 'image', prompt: 'P', resolution: '540P', seconds: 5.167, fps: 24, ref_image_size: 'match', media: ['7', 0] })
  expect(graph[7].inputs).toMatchObject({ image_count: 1, image_1: ['30', 0] })
  expect(graph[3].inputs.projection).toBe('mmh3-4b-ClipProj-v3.1-mlp.safetensors')
  expect(graph[6].inputs.text_encoder).toEqual(['3', 0])
  expect(graph[9].class_type).toBe('LoraLoaderModelOnly')
  expect(graph[16].inputs.latent_image).toEqual(['11', 1])
  expect(graph[19]).toMatchObject({ class_type: 'VHS_VideoCombine', inputs: { audio: ['18', 0], frame_rate: 24 } })
  // Without the speed LoRA: the base sampling, 20 steps.
  const slow = h3Graph({ ...models, flLora: '' }, { prompt: 'P', frames: 124, seed: 1, prefix: 'x' }) as any
  expect(slow.steps).toBe(20)
  expect(slow.graph[9]).toMatchObject({ class_type: 'MiniMaxH3SigmaShift', inputs: { shift_video: 12, shift_audio: 3 } })

  const made = await makeTake({ prompt: 'P', frames: 124, images: [{ mime: 'image/png', data: PNG.toString('base64') }], seed: 5 }, comfy.fetchImpl as any, async () => {})
  expect(made).toMatchObject({ seed: 5, steps: 4 })
  expect([...made.bytes]).toEqual([0, 0, 0, 24])
  expect(comfy.sent().prompt[30].inputs.image).toMatch(/^tsrs\/ref-/)

  const hung = fakeComfy({ hang: true })
  const controller = new AbortController()
  const going = makeTake({ prompt: 'P', frames: 124, signal: controller.signal }, hung.fetchImpl as any, () => new Promise((r) => setTimeout(r, 2)))
  setTimeout(() => controller.abort(), 20)
  await expect(going).rejects.toMatchObject({ code: 'canceled' })
  expect(hung.asked).toContain('POST /queue {"delete":["p1"]}')
  expect(hung.asked).toContain('POST /interrupt {"prompt_id":"p1"}')
})

test('the take and jobs commands: check the shot, queue the take, write the video and its notes to takes/', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-h3-'))
  const folder = join(root, 'seu-silva-ep07')
  await mkdir(join(folder, 'shots'), { recursive: true })
  await mkdir(join(folder, 'midia'), { recursive: true })
  await writeFile(join(folder, 'midia', 'first.png'), PNG)
  await writeFile(join(folder, 'shots', 's01.json'), JSON.stringify({ scene: 'Seu Silva at his desk', action: 'He types slowly', seconds: 5, dialogue: [{ speaker: 'Seu Silva', text: 'Bom dia.', language: 'pt' }] }))
  await writeFile(join(folder, 'shots', 'bad.json'), JSON.stringify({ scene: 'x', frames: 50 }))
  let release!: () => void
  const jobs = createQueue()
  const sentTakes: any[] = []
  const run = createAgent(
    {
      agenda: { list: async () => ({ tasks: [], pending: 0 }), runNow: async () => {} },
      version: () => ({ version: '1', commit: '' }),
      renderBusy: () => false,
      log: () => {},
      jobs,
      sdcpp: { status: async () => ({ error: 'down' }), makeImage: async () => null },
      comfy: {
        status: async () => ({ ok: true }),
        makeImage: async () => null,
        h3Models: async () => ({ ok: true, missing: [], models: {} }),
        makeTake: async (job: any) => {
          sentTakes.push(job)
          await new Promise<void>((done) => (release = done))
          return { bytes: Buffer.from('mp4'), seed: 77, steps: 4, models: { unet: 'fl2va', lora: '4step' } }
        },
      },
    },
    root,
  )

  const prompt = await run('h3 prompt', { project: 'seu-silva-ep07', shot: 'shots/s01.json' })
  expect(prompt.text).toContain('124 frames (5.17 s at 24 fps)')
  expect(prompt.text).toContain('<d>[Portuguese] Bom dia.</d>')
  await expect(run('take', { project: 'seu-silva-ep07', shot: 'shots/bad.json' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('17n+5') })
  await expect(run('take', { project: 'seu-silva-ep07', shot: 'shots/s01.json', image: 'midia/none.png' })).rejects.toMatchObject({ code: 'invalid' })

  const queued = await run('take', { project: 'seu-silva-ep07', shot: 'shots/s01.json', image: 'midia/first.png' })
  expect(queued.text).toContain('start first')
  expect(queued.text).toContain(`tsrs jobs wait ${queued.result.id}`)
  const second = await run('take', { project: 'seu-silva-ep07', shot: 'shots/s01.json' })
  expect(second.result.params.name).toBe('s01-2')
  expect((await run('jobs list')).text).toMatch(/s01-2".*#1 in the queue/)
  await new Promise((r) => setTimeout(r, 10))
  expect(sentTakes[0]).toMatchObject({ frames: 124, mode: 'image', role: 'first', resolution: '540P', aspect: '16:9' })
  expect(sentTakes[0].prompt.startsWith('For the target video, at 0.00 seconds')).toBe(true)
  expect(sentTakes[0].images[0]).toMatchObject({ rel: 'midia/first.png', mime: 'image/png' })

  release()
  const waited = await run('jobs wait', { jobs: [queued.result.id], seconds: 5 })
  expect(waited.text).toContain('done → takes/s01.mp4')
  expect(await readFile(join(folder, 'takes', 's01.mp4'), 'utf8')).toBe('mp4')
  const notes = JSON.parse(await readFile(join(folder, 'takes', 's01.json'), 'utf8'))
  expect(notes).toMatchObject({ status: 'pending', frames: 124, seed: 77, start: 'first', pictures: ['midia/first.png'], shot: 'shots/s01.json' })

  // The second take is running now: cancel it.
  await new Promise((r) => setTimeout(r, 10))
  expect((await run('jobs cancel', { job: second.result.id })).text).toContain('canceling')
  await expect(run('jobs status', { job: 'nope' })).rejects.toMatchObject({ code: 'invalid' })
})
