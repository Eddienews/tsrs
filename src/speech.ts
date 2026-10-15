import { useSyncExternalStore } from 'react'
import { t } from './i18n'
import type { MediaTarget } from './media'
import type { Settings } from './types'

// Reads replies aloud, with the system's own voices (free, and they work
// offline) or with a voice service chosen in the settings (ElevenLabs,
// OpenAI, Gemini). A service reads a long reply in pieces: the next piece is
// made while the current one plays, and pieces already made are kept for
// the session, so playing a reply again costs nothing.

let speaking: string | null = null
// Why the last reply could not be read by the service, by reply id.
let problem: { id: string; text: string } | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function set(id: string | null) {
  speaking = id
  notify()
}

// Who reads, kept up to date by the app; null for the browser's voices.
let reader: { settings: Settings; target: MediaTarget; name: string } | null = null

export function setReader(next: typeof reader) {
  reader = next
}

function browserVoices(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// The browser voice chosen in the settings, by name; '' picks the best one.
let browserVoice = ''

export function setBrowserVoice(name: string) {
  browserVoice = name
}

type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>

// How natural a browser voice sounds, judged by its name: Edge's "Natural"
// voices and other online neural ones are close to the paid services; the
// voices installed with the system sound robotic.
export function voiceQuality(voice: VoiceLike): number {
  if (/natural|neural/i.test(voice.name)) return 3
  if (/online|google|premium|enhanced|siri/i.test(voice.name)) return 2
  return voice.localService ? 0 : 1
}

// The voice that reads text in `lang`: the one chosen, if the browser has it,
// or the most natural one for the language (its region first).
export function bestVoice<V extends VoiceLike>(voices: V[], lang: string, chosen = ''): V | undefined {
  const picked = chosen && voices.find((v) => v.name === chosen)
  if (picked) return picked
  const base = lang.split('-')[0].toLowerCase()
  const norm = (code: string) => code.replace('_', '-').toLowerCase()
  const fits = voices.filter((v) => norm(v.lang).split('-')[0] === base)
  const score = (v: V) => voiceQuality(v) * 2 + (norm(v.lang) === lang.toLowerCase() ? 1 : 0)
  return [...fits].sort((a, b) => score(b) - score(a))[0]
}

// The browser's voices; empty until it has loaded them.
export function browserVoiceList(): SpeechSynthesisVoice[] {
  return browserVoices() ? speechSynthesis.getVoices() : []
}

// Reads a short text with a browser voice, to hear it in the settings.
export function trySpeaking(text: string, lang: string, name: string) {
  if (!browserVoices()) return
  stopSpeaking()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = bestVoice(speechSynthesis.getVoices(), lang, name)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? lang
  speechSynthesis.speak(utterance)
}

export function canSpeak(): boolean {
  return !!reader || browserVoices()
}

// Markdown turned into what should be heard: no code, symbols or link targets.
export function speakable(markdown: string): string {
  return markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Services take a few thousand characters per request (OpenAI 4,096).
export const PIECE_CHARS = 2500

// Text cut into pieces of at most `size` characters, at the end of a
// sentence where there is one, else at a space.
export function pieces(text: string, size = PIECE_CHARS): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > size) {
    const head = rest.slice(0, size)
    const sentence = Math.max(...['. ', '! ', '? '].map((end) => head.lastIndexOf(end)))
    const space = head.lastIndexOf(' ')
    const cut = sentence > size / 2 ? sentence + 1 : space > 0 ? space : size
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

// Audio already made this session, by voice and text.
const made = new Map<string, Promise<string>>()
let abort: AbortController | null = null
let playing: HTMLAudioElement | null = null

function piece(text: string, signal: AbortSignal): Promise<string> {
  const { settings, target } = reader!
  const key = JSON.stringify([target, text])
  let audio = made.get(key)
  if (!audio) {
    audio = import('./mediaJobs').then(async ({ generateMedia }) => {
      const result = await generateMedia({ settings, target, kind: 'audio', prompt: text, signal })
      return `data:${result.mime};base64,${result.data}`
    })
    // A failed or stopped piece is made again next time.
    audio.catch(() => made.delete(key))
    made.set(key, audio)
  }
  return audio
}

function play(source: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(source)
    playing = audio
    audio.onended = () => resolve()
    audio.onerror = () => reject(new Error(t('O áudio não pôde ser tocado.')))
    signal.addEventListener('abort', () => {
      audio.pause()
      resolve()
    })
    audio.play().catch(reject)
  })
}

async function speakWithService(id: string, text: string, lang: string) {
  const controller = new AbortController()
  abort = controller
  const parts = pieces(text)
  try {
    let next = piece(parts[0], controller.signal)
    for (let i = 0; i < parts.length; i++) {
      const current = await next
      if (i + 1 < parts.length) next = piece(parts[i + 1], controller.signal)
      if (controller.signal.aborted) return
      await play(current, controller.signal)
      if (controller.signal.aborted) return
    }
    if (speaking === id) set(null)
  } catch (err) {
    if (controller.signal.aborted) return
    const error = err instanceof Error ? err.message : String(err)
    const name = reader?.name ?? ''
    problem = {
      id,
      text: t('{name} não leu esta resposta ({error}); usei a voz do navegador.', { name, error }),
    }
    if (browserVoices()) speakWithBrowser(id, text, lang)
    else set(null)
  }
}

function speakWithBrowser(id: string, text: string, lang: string) {
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = bestVoice(speechSynthesis.getVoices(), lang, browserVoice)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? lang
  utterance.onend = utterance.onerror = () => {
    if (speaking === id) set(null)
  }
  set(id)
  speechSynthesis.speak(utterance)
}

export function speak(id: string, text: string, lang: string) {
  stopSpeaking()
  if (problem?.id === id) problem = null
  if (!reader) return speakWithBrowser(id, text, lang)
  set(id)
  speakWithService(id, text, lang)
}

export function stopSpeaking() {
  abort?.abort()
  abort = null
  playing?.pause()
  playing = null
  if (browserVoices()) speechSynthesis.cancel()
  set(null)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSpeaking(id: string): boolean {
  return useSyncExternalStore(subscribe, () => speaking === id)
}

// Why the service could not read this reply, if it could not.
export function useSpeechProblem(id: string): string | undefined {
  return useSyncExternalStore(subscribe, () => (problem?.id === id ? problem.text : undefined))
}
