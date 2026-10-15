import { fold } from './agents'
import type { MediaTarget } from './media'
import { connection } from './providers'
import { transcribeWords } from './stream'
import type { Settings } from './types'

// A narration with the time of every word, for short videos: captions follow
// the voice word by word and each scene lasts as long as its sentences.
// ElevenLabs gives the times with the audio; any other voice is transcribed
// with word times (OpenAI or Groq) and the times are laid on the script's own
// words; with neither, the times are estimated from the words' lengths.

export interface Word {
  text: string
  start: number
  end: number
}

export interface Narration {
  mime: string
  // Base64.
  data: string
  words: Word[]
  duration: number
  // How the times were found.
  timing: 'voice' | 'transcription' | 'estimate'
  cost?: number
}

// Words from per-character times, as ElevenLabs returns them.
export function wordsFromCharacters(chars: string[], starts: number[], ends: number[]): Word[] {
  const words: Word[] = []
  let current: Word | null = null
  chars.forEach((char, i) => {
    if (/\s/.test(char)) {
      current = null
      return
    }
    if (!current) {
      current = { text: '', start: starts[i] ?? 0, end: ends[i] ?? 0 }
      words.push(current)
    }
    current.text += char
    current.end = ends[i] ?? current.end
  })
  return words
}

const bare = (word: string) => fold(word).replace(/[^\p{L}\p{N}]+/gu, '')

// The script's words with the times of the words heard: each script word
// takes the time of the next heard word that matches it, close ahead; the
// ones left are spread between their timed neighbours.
export function alignWords(script: string, heard: Word[], duration: number): Word[] {
  const words = script.split(/\s+/).filter(Boolean)
  const timed: (Word | null)[] = words.map(() => null)
  let at = 0
  words.forEach((word, i) => {
    const want = bare(word)
    if (!want) return
    for (let j = at; j < Math.min(heard.length, at + 4); j++) {
      if (bare(heard[j].text) === want) {
        timed[i] = { text: word, start: heard[j].start, end: heard[j].end }
        at = j + 1
        return
      }
    }
  })
  return fillTimes(words, timed, duration)
}

// Times for the words between known ones, in proportion to their lengths.
function fillTimes(words: string[], timed: (Word | null)[], duration: number): Word[] {
  const out: Word[] = []
  let i = 0
  while (i < words.length) {
    if (timed[i]) {
      out.push(timed[i]!)
      i++
      continue
    }
    let j = i
    while (j < words.length && !timed[j]) j++
    const from = i ? out[i - 1].end : 0
    const to = j < words.length ? timed[j]!.start : duration
    const weights = words.slice(i, j).map((w) => w.length + 1)
    const total = weights.reduce((a, b) => a + b, 0)
    let t = from
    for (let k = i; k < j; k++) {
      const span = ((to - from) * weights[k - i]) / total
      out.push({ text: words[k], start: t, end: t + span })
      t += span
    }
    i = j
  }
  return out
}

export function estimateWords(script: string, duration: number): Word[] {
  const words = script.split(/\s+/).filter(Boolean)
  return fillTimes(words, words.map(() => null), duration)
}

// When each scene starts and ends, from the words of the narration: scene
// texts were joined in order, so their words follow one another.
export function sceneTimes(scenes: string[], words: Word[], duration: number): { start: number; end: number }[] {
  let index = 0
  const starts = scenes.map((text) => {
    const first = words[index]
    index += text.split(/\s+/).filter(Boolean).length
    return first ? first.start : duration
  })
  return starts.map((start, i) => ({ start: i ? start : 0, end: i + 1 < starts.length ? starts[i + 1] : duration }))
}

async function elevenWithTimes(settings: Settings, target: MediaTarget, text: string, signal?: AbortSignal): Promise<Narration> {
  const key = settings.mediaKeys.elevenlabs?.trim()
  if (!key) throw new Error('No ElevenLabs key.')
  let options: Record<string, unknown> = {}
  try {
    options = target.options?.trim() ? JSON.parse(target.options) : {}
  } catch {
    // Options that do not parse are left out, as everywhere else.
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(target.model)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', ...options }),
      signal,
    },
  )
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  const align = body.alignment ?? body.normalized_alignment
  const heard = align ? wordsFromCharacters(align.characters, align.character_start_times_seconds, align.character_end_times_seconds) : []
  const duration = heard.at(-1)?.end ?? 0
  return { mime: 'audio/mpeg', data: body.audio_base64, words: alignWords(text, heard, duration), duration, timing: 'voice' }
}

// How long an audio file plays, decoded by the browser.
async function audioDuration(data: string, mime: string): Promise<number> {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const context = new OfflineAudioContext(1, 1, 44100)
  const decoded = await context.decodeAudioData(bytes.buffer)
  return decoded.duration || new Blob([bytes], { type: mime }).size / 16000
}

// The provider that can transcribe with word times: OpenAI (whisper-1) or Groq.
export function wordTranscriber(settings: Settings): string | null {
  return ['openai', 'groq'].find((id) => settings.providers[id]?.apiKey?.trim()) ?? null
}

export async function narrate(
  settings: Settings,
  target: MediaTarget,
  text: string,
  signal?: AbortSignal,
): Promise<Narration> {
  const script = text.replace(/\s+/g, ' ').trim()
  if (!script) throw new Error('Nothing to narrate.')
  const isVoice = target.source === 'elevenlabs' && target.model !== 'music' && target.model !== 'sound-effects'
  if (isVoice) return elevenWithTimes(settings, target, script, signal)
  const { generateMedia } = await import('./mediaJobs')
  const made = await generateMedia({ settings, target, kind: 'audio', prompt: script, signal })
  if (!made.data) throw new Error('The voice service gave no audio file.')
  const transcriber = wordTranscriber(settings)
  if (transcriber) {
    try {
      const audio = new Blob([Uint8Array.from(atob(made.data), (c) => c.charCodeAt(0))], { type: made.mime })
      const heard = await transcribeWords(connection(settings, transcriber), audio, settings.language, signal)
      return { mime: made.mime, data: made.data, words: alignWords(script, heard.words, heard.duration), duration: heard.duration, timing: 'transcription', cost: made.cost }
    } catch {
      // Without times from a transcription, they are estimated below.
    }
  }
  const duration = await audioDuration(made.data, made.mime)
  return { mime: made.mime, data: made.data, words: estimateWords(script, duration), duration, timing: 'estimate', cost: made.cost }
}
