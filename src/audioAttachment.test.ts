import { expect, test } from 'vitest'
import { fileTranscriber } from './dictation'
import { MAX_AUDIO_BYTES, audioType, readAttachment } from './files'
import { defaultSettings } from './storage'
import { textOf } from './stream'
import type { Settings } from './types'

test('audio files are attached as audio, by type or by extension', async () => {
  const mp3 = await readAttachment(new File([new Uint8Array([73, 68, 51])], 'trilha.mp3', { type: 'audio/mpeg' }))
  expect(mp3).toMatchObject({ kind: 'audio', mime: 'audio/mpeg', name: 'trilha.mp3', data: 'SUQz' })
  // Some systems give no type for .m4a or .flac.
  expect(audioType({ name: 'voz.M4A', type: '' })).toBe('audio/mp4')
  expect(audioType({ name: 'take.flac', type: 'application/octet-stream' })).toBe('audio/flac')
  expect(audioType({ name: 'clip.webm', type: 'video/webm' })).toBeNull()
  expect(audioType({ name: 'notas.txt', type: 'text/plain' })).toBeNull()
})

test('audio may be bigger than other files, up to what transcription takes', async () => {
  const big = new File([new Uint8Array(12 * 1024 * 1024)], 'longo.wav', { type: 'audio/wav' })
  expect((await readAttachment(big)).kind).toBe('audio')
  const huge = new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], 'enorme.wav', { type: 'audio/wav' })
  await expect(readAttachment(huge)).rejects.toThrow('passa de 25 MB')
})

test('the model reads what the audio says, or learns it was not transcribed', () => {
  const audio = { id: 'a', name: 'reuniao.mp3', mime: 'audio/mpeg', kind: 'audio' as const, data: 'AAAA' }
  expect(textOf({ role: 'user', content: 'Resuma', attachments: [{ ...audio, transcript: 'Bom dia a todos.' }] })).toBe(
    'Resuma\n\n<audio name="reuniao.mp3" transcription="automatic">\nBom dia a todos.\n</audio>',
  )
  const plain = textOf({ role: 'user', content: '', attachments: [audio] })
  expect(plain).toContain('Audio file attached: reuniao.mp3')
  expect(plain).toContain('not transcribed')
  // The sound itself never goes in the text.
  expect(plain).not.toContain('AAAA')
})

test('attached audio is transcribed by the dictation provider, or the first with a key', () => {
  const settings = (patch: (s: Settings) => void) => {
    const s = defaultSettings()
    patch(s)
    return s
  }
  expect(fileTranscriber(defaultSettings(), false)).toBeNull()
  const groq = settings((s) => {
    s.providers.groq.apiKey = 'gsk-test'
  })
  expect(fileTranscriber(groq, false)).toBe('groq')
  // Locked keys cannot be used.
  expect(fileTranscriber(groq, true)).toBeNull()
  const both = settings((s) => {
    s.providers.groq.apiKey = 'gsk-test'
    s.providers.openai.apiKey = 'sk-test'
    s.dictation = 'groq'
  })
  expect(fileTranscriber(both, false)).toBe('groq')
  // The browser's recognizer hears only the microphone; a key still transcribes files.
  both.dictation = 'browser'
  expect(fileTranscriber(both, false)).toBe('openai')
})
