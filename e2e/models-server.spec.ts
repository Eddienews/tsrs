import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cachedSize, fetchModelFile, modelsHandler, parseModelPath } from '../server/models.mjs'

test('fetches only the known model repositories, with safe paths', () => {
  expect(parseModelPath('/hf/onnx-community/whisper-base/resolve/main/onnx/encoder_model_quantized.onnx')).toEqual({
    repo: 'onnx-community/whisper-base',
    revision: 'main',
    file: 'onnx/encoder_model_quantized.onnx',
  })
  expect(parseModelPath('/hf/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx')?.repo).toBe(
    'rhasspy/piper-voices',
  )
  expect(parseModelPath('/hf/someone/else/resolve/main/model.onnx')).toBeNull()
  expect(parseModelPath('/hf/onnx-community/whisper-large/resolve/main/x')).toBeNull()
  expect(parseModelPath('/hf/rhasspy/piper-voices/resolve/main/../../secret')).toBeNull()
  expect(parseModelPath('/hf/rhasspy/piper-voices/resolve/main/a%2F..%2Fb')).toBeNull()
})

test('downloads a file once, keeps it on disk and passes missing ones on as 404', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-models-'))
  const asked: string[] = []
  const fetchImpl = async (url: string) => {
    asked.push(url)
    if (url.endsWith('missing.json')) return new Response('no', { status: 404 })
    return new Response('model bytes', { headers: { 'Content-Length': '11' } })
  }
  const target = parseModelPath('/hf/onnx-community/whisper-tiny/resolve/main/onnx/model.onnx')!
  // Two requests at once share one download.
  const [a, b] = await Promise.all([fetchModelFile(root, target, fetchImpl), fetchModelFile(root, target, fetchImpl)])
  expect([a, b]).toEqual([true, true])
  expect(asked).toEqual(['https://huggingface.co/onnx-community/whisper-tiny/resolve/main/onnx/model.onnx'])
  const file = join(root, 'hf', 'onnx-community', 'whisper-tiny', 'main', 'onnx', 'model.onnx')
  expect(await readFile(file, 'utf8')).toBe('model bytes')
  await fetchModelFile(root, target, fetchImpl)
  expect(asked).toHaveLength(1)
  const missing = parseModelPath('/hf/onnx-community/whisper-tiny/resolve/main/missing.json')!
  expect(await fetchModelFile(root, missing, fetchImpl)).toBe(false)
  expect(existsSync(join(root, 'hf', 'onnx-community', 'whisper-tiny', 'main', 'missing.json'))).toBe(false)
  expect(await cachedSize(root, 'onnx-community/whisper-tiny')).toEqual({ bytes: 11, files: 1 })
  expect(await cachedSize(root, 'onnx-community/whisper-tiny', 'onnx/')).toEqual({ bytes: 11, files: 1 })
  expect(await cachedSize(root, 'onnx-community/whisper-tiny', 'other/')).toEqual({ bytes: 0, files: 0 })
})

test('a failed download leaves nothing half-written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-models-'))
  const broken = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('half'))
      controller.error(new Error('cut'))
    },
  })
  const target = parseModelPath('/hf/rhasspy/piper-voices/resolve/main/voices.json')!
  await expect(fetchModelFile(root, target, async () => new Response(broken))).rejects.toThrow()
  expect(await cachedSize(root, 'rhasspy/piper-voices')).toEqual({ bytes: 0, files: 0 })
  // The handler answers 403 for anything else under /hf/.
  const handle = modelsHandler(root, async () => new Response('x'))
  let status = 0
  const res: any = { writeHead: (s: number) => (status = s), end: () => {} }
  expect(await handle({ method: 'GET', url: '/hf/evil/repo/resolve/main/x' }, res)).toBe(true)
  expect(status).toBe(403)
})
