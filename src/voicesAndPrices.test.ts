import { expect, test } from 'vitest'
import { elevenCost } from './mediaJobs'
import { elevenSpeechPrice, estimateCost } from './mediaPrice'
import { knownModel } from './providers'
import { bestVoice, voiceQuality } from './speech'
import { defaultSettings } from './storage'
import type { Message } from './types'
import { costOf, modelInfo, totals } from './usage'
import { modelIdOf, withModelId } from './VoiceFields'

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService })

test('the browser reads with its most natural voice for the language', () => {
  const voices = [
    voice('Microsoft Maria - Portuguese (Brazil)', 'pt-BR'),
    voice('Google português do Brasil', 'pt-BR', false),
    voice('Microsoft Francisca Online (Natural) - Portuguese (Brazil)', 'pt-BR', false),
    voice('Microsoft Duarte Online (Natural) - Portuguese (Portugal)', 'pt-PT', false),
    voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
  ]
  expect(bestVoice(voices, 'pt-BR')?.name).toContain('Francisca')
  expect(bestVoice(voices, 'en-US')?.name).toContain('Aria')
  // Chrome on Windows: the online Google voice beats the installed one.
  expect(bestVoice(voices.slice(0, 2), 'pt-BR')?.name).toBe('Google português do Brasil')
  // The voice chosen in the settings wins, when the browser has it.
  expect(bestVoice(voices, 'pt-BR', 'Microsoft Maria - Portuguese (Brazil)')?.name).toContain('Maria')
  expect(bestVoice(voices, 'pt-BR', 'Uma voz de outro computador')?.name).toContain('Francisca')
  expect(bestVoice(voices, 'ja-JP')).toBeUndefined()
  expect(voiceQuality(voices[0])).toBe(0)
  expect(voiceQuality(voices[2])).toBe(3)
})

test('the ElevenLabs model goes into the options the request sends', () => {
  expect(withModelId('', 'eleven_flash_v2_5')).toBe('{"model_id":"eleven_flash_v2_5"}')
  expect(withModelId('{"voice_settings":{"stability":0.5}}', 'eleven_v3')).toBe(
    '{"model_id":"eleven_v3","voice_settings":{"stability":0.5}}',
  )
  expect(withModelId('{"model_id":"eleven_v3"}', '')).toBe('')
  expect(withModelId('{não é json', 'eleven_v3')).toBeNull()
  expect(modelIdOf('{"model_id":"eleven_v3"}')).toBe('eleven_v3')
  expect(modelIdOf('')).toBe('')
})

test('ElevenLabs costs what its API price list says', () => {
  expect(elevenSpeechPrice('')).toBe(0.08)
  expect(elevenSpeechPrice('eleven_flash_v2_5')).toBe(0.04)
  expect(elevenSpeechPrice('eleven_turbo_v2_5')).toBe(0.04)
  // The characters the service reports win over the length of the text.
  expect(elevenCost('voz', { text: 'abc', model_id: 'eleven_multilingual_v2' }, '1000')).toBeCloseTo(0.08)
  expect(elevenCost('voz', { text: 'x'.repeat(500), model_id: 'eleven_flash_v2_5' }, null)).toBeCloseTo(0.02)
  expect(elevenCost('music', { prompt: 'jazz', music_length_ms: 30_000 }, null)).toBeCloseTo(0.075)
  expect(elevenCost('music', { prompt: 'jazz' }, null)).toBeUndefined()
  expect(elevenCost('sound-effects', { text: 'porta', duration_seconds: 6 }, null)).toBeCloseTo(0.012)
})

test('the estimate before an ElevenLabs generation is priced per character', async () => {
  const settings = defaultSettings()
  const speech = await estimateCost(settings, { source: 'elevenlabs', model: 'voz', options: '' }, 'audio')
  expect(speech?.perCharacter).toBeCloseTo(0.00008)
  expect(speech?.text).toContain('por mil caracteres')
  const fast = await estimateCost(
    settings,
    { source: 'elevenlabs', model: 'voz', options: '{"model_id":"eleven_flash_v2_5"}' },
    'audio',
  )
  expect(fast?.perCharacter).toBeCloseTo(0.00004)
  const music = await estimateCost(settings, { source: 'elevenlabs', model: 'music', options: '' }, 'audio')
  expect(music?.text).toContain('por minuto de música')
  expect(music?.perCharacter).toBeUndefined()
})

test('OpenAI models have their list prices, also under dated names', () => {
  expect(knownModel('gpt-5.5')).toMatchObject({ inputPrice: 5, outputPrice: 30, cacheReadPrice: 0.5 })
  expect(knownModel('gpt-5-2025-08-07')).toMatchObject({ inputPrice: 1.25, outputPrice: 10 })
  expect(knownModel('gpt-6-luna').outputPrice).toBe(0.5)
  expect(knownModel('modelo-desconhecido')).toEqual({})
  const settings = defaultSettings()
  // 1M tokens in and out of GPT-5.5; above 272K input the long-context rate applies.
  const info = modelInfo(settings, 'openai', 'gpt-5.5')
  expect(costOf({ input: 100_000, output: 100_000 }, info)).toBeCloseTo(0.5 + 3)
  expect(costOf({ input: 300_000, output: 100_000 }, info)).toBeCloseTo(3 + 4.5)
})

test('a price typed by the user prices the model and the replies already written', () => {
  const settings = defaultSettings()
  expect(modelInfo(settings, 'deepseek', 'deepseek-v5').inputPrice).toBeUndefined()
  settings.modelPrices = { 'deepseek/deepseek-v5': { inputPrice: 0.5, outputPrice: 2 } }
  const info = modelInfo(settings, 'deepseek', 'deepseek-v5')
  expect(info).toMatchObject({ inputPrice: 0.5, outputPrice: 2 })
  const messages = [
    { id: '1', role: 'user', content: 'oi' },
    {
      id: '2',
      role: 'assistant',
      content: 'olá',
      providerId: 'deepseek',
      model: 'deepseek-v5',
      usage: { input: 1_000_000, output: 1_000_000 },
    },
    { id: '3', role: 'assistant', content: 'já tinha custo', usage: { input: 10, output: 10, cost: 0.25 } },
  ] as Message[]
  expect(totals(messages).cost).toBe(0.25)
  expect(totals(messages, (id, model) => modelInfo(settings, id, model)).cost).toBeCloseTo(2.75)
})
