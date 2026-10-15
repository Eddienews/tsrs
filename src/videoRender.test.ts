import { afterEach, expect, test, vi } from 'vitest'
import type { Message } from './types'
import { chatTracks, jsonLines, renderVideo, trackFileName } from './videoRender'

afterEach(() => vi.unstubAllGlobals())

const audio = (id: string, name: string, mime = 'audio/mpeg', data = 'AAAA') => ({
  id,
  name,
  mime,
  kind: 'audio' as const,
  data,
})

test('offers the audio of the conversation, newest first', () => {
  const messages = [
    { id: '1', role: 'user', content: 'a', attachments: [audio('a1', 'narração.mp3')] },
    {
      id: '2',
      role: 'assistant',
      content: '',
      attachments: [
        { id: 'i', name: 'x.png', mime: 'image/png', kind: 'image', data: 'AAAA' },
        audio('a2', 'trilha.wav', 'audio/wav'),
        // Only a link was kept: nothing to send.
        audio('a3', 'remota.mp3', 'audio/mpeg', ''),
      ],
    },
  ] as Message[]
  expect(chatTracks(messages).map((t) => t.name)).toEqual(['trilha.wav', 'narração.mp3'])
})

test('gives audio without an extension one the renderer reads', () => {
  expect(trackFileName({ name: 'Voz da ElevenLabs', mime: 'audio/mpeg' })).toBe('Voz da ElevenLabs.mp3')
  expect(trackFileName({ name: 'gemini', mime: 'audio/wav; codecs=1' })).toBe('gemini.wav')
  expect(trackFileName({ name: 'música.FLAC', mime: '' })).toBe('música.FLAC')
})

test('reads NDJSON lines split across chunks', async () => {
  const bytes = new TextEncoder().encode('{"frame":1,"frames":2}\n{"done":tr' + 'ue,"id":"x"}')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 10))
      controller.enqueue(bytes.slice(10, 30))
      controller.enqueue(bytes.slice(30))
      controller.close()
    },
  })
  const lines = []
  for await (const line of jsonLines(stream)) lines.push(line)
  expect(lines).toEqual([{ frame: 1, frames: 2 }, { done: true, id: 'x' }])
})

test('sends the composition and the track, reports progress and fetches the video', async () => {
  const calls: { url: string; body?: any }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.endsWith('/render'))
      return new Response(
        '{"frame":5,"frames":10}\n{"frame":10,"frames":10}\n{"done":true,"id":"v1","name":"m.mp4","path":"C:/r/m.mp4"}\n',
      )
    return new Response(new Blob(['mp4'], { type: 'video/mp4' }))
  })
  const progress: number[] = []
  const video = await renderVideo(
    { html: '<h1>x</h1>', name: 'motion-1.html', track: { id: 't', name: 'voz', mime: 'audio/wav', data: 'UklG' } },
    (p) => progress.push(p.frame),
    'http://r',
  )
  expect(calls[0]).toEqual({
    url: 'http://r/render',
    body: { html: '<h1>x</h1>', name: 'motion-1.html', audio: { name: 'voz.wav', data: 'UklG' } },
  })
  expect(calls[1].url).toBe('http://r/video/v1')
  expect(progress).toEqual([5, 10])
  expect(video.name).toBe('m.mp4')
  expect(video.path).toBe('C:/r/m.mp4')
  expect(await video.blob.text()).toBe('mp4')
})

test('passes on what the renderer says went wrong', async () => {
  vi.stubGlobal('fetch', async () => new Response('{"frame":1,"frames":9}\n{"error":"ffmpeg was not found"}\n'))
  await expect(renderVideo({ html: 'x', name: 'm' }, () => {}, 'http://r')).rejects.toThrow('ffmpeg was not found')
  vi.stubGlobal('fetch', async () => new Response('{"error":"A video is already being rendered."}', { status: 409 }))
  await expect(renderVideo({ html: 'x', name: 'm' }, () => {}, 'http://r')).rejects.toThrow('already being rendered')
})
