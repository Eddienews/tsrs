import { afterEach, describe, expect, it, vi } from 'vitest'
import { alignWords, estimateWords, narrate, sceneTimes, wordsFromCharacters } from './narration'
import type { Settings } from './types'

afterEach(() => vi.unstubAllGlobals())

const round = (words: { text: string; start: number; end: number }[]) =>
  words.map((w) => [w.text, Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100])

describe('narration times', () => {
  it('groups ElevenLabs character times into words', () => {
    const chars = [...'Oi, mundo!']
    const starts = chars.map((_, i) => i * 0.1)
    const ends = chars.map((_, i) => i * 0.1 + 0.1)
    expect(round(wordsFromCharacters(chars, starts, ends))).toEqual([
      ['Oi,', 0, 0.3],
      ['mundo!', 0.4, 1],
    ])
  })

  it("puts the heard times on the script's own words, filling what was not heard", () => {
    const heard = [
      { text: 'O', start: 0, end: 0.2 },
      { text: 'TSRS', start: 0.2, end: 0.8 },
      { text: 'chegou', start: 1.2, end: 1.6 },
    ]
    // "agora" was not heard as such; it takes the gap before the next known word.
    expect(round(alignWords('O TSRS agora chegou.', heard, 2))).toEqual([
      ['O', 0, 0.2],
      ['TSRS', 0.2, 0.8],
      ['agora', 0.8, 1.2],
      ['chegou.', 1.2, 1.6],
    ])
    // Accents, case and punctuation do not matter; the tail runs to the end.
    expect(round(alignWords('Não é? Fim', [{ text: 'nao', start: 0, end: 0.3 }], 1.3))).toEqual([
      ['Não', 0, 0.3],
      ['é?', 0.3, 0.73],
      ['Fim', 0.73, 1.3],
    ])
  })

  it('estimates by length when no times are known, and times each scene', () => {
    const words = estimateWords('aa bbbb', 1)
    expect(round(words)).toEqual([
      ['aa', 0, 0.38],
      ['bbbb', 0.38, 1],
    ])
    const narration = estimateWords('um dois três quatro cinco', 5)
    expect(sceneTimes(['um dois', 'três', 'quatro cinco'], narration, 6).map((s) => [Math.round(s.start * 10) / 10, Math.round(s.end * 10) / 10])).toEqual([
      [0, 1.5],
      [1.5, 2.5],
      [2.5, 6],
    ])
  })
})

describe('narrate', () => {
  it('asks ElevenLabs for the times with the audio', async () => {
    const asked: { url: string; body: any; key: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      asked.push({ url, body: JSON.parse(init.body), key: init.headers['xi-api-key'] })
      const chars = [...'Oi TSRS']
      return new Response(
        JSON.stringify({
          audio_base64: 'QUJD',
          alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i / 10), character_end_times_seconds: chars.map((_, i) => i / 10 + 0.1) },
        }),
      )
    })
    const settings = { mediaKeys: { elevenlabs: 'xi' }, providers: {}, language: 'pt' } as unknown as Settings
    const done = await narrate(settings, { source: 'elevenlabs', model: 'voz1', options: '{"model_id":"eleven_v3"}' }, '  Oi\n TSRS ')
    expect(asked[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voz1/with-timestamps?output_format=mp3_44100_128')
    expect(asked[0].body).toEqual({ text: 'Oi TSRS', model_id: 'eleven_v3' })
    expect(asked[0].key).toBe('xi')
    expect(done).toMatchObject({ mime: 'audio/mpeg', data: 'QUJD', timing: 'voice', duration: 0.7 })
    expect(done.words.map((w) => w.text)).toEqual(['Oi', 'TSRS'])
  })
})
