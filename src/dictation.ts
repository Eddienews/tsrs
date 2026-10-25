import { useRef, useState } from 'react'
import { locale, t } from './i18n'
import { PROVIDERS } from './providers'
import { transcribe } from './stream'
import type { Settings } from './types'

export type DictationState = 'idle' | 'recording' | 'transcribing'

export interface Dictation {
  available: boolean
  state: DictationState
  error: string
  // While local Whisper downloads its files the first time, how far it is.
  progress: string
  toggle: () => void
}

// Whisper on this computer (localVoice.ts), chosen in the settings.
export const LOCAL = 'local'

// The Web Speech API's recognizer, where the browser has one.
function recognizer(): (new () => any) | undefined {
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

// Where speech goes to become text: a provider's transcription model, the
// browser's recognizer, or nowhere.
function transcribes(settings: Settings, id: string): boolean {
  const provider = PROVIDERS.find((p) => p.id === id)
  const conn = settings.providers[id]
  return !!provider?.transcription && !!conn?.baseUrl && (!!conn.apiKey || !provider.keyRequired)
}

// The provider that transcribes attached audio files: the one chosen for
// dictation, or the first with a transcription model and a key. The browser's
// recognizer only hears the microphone, so it cannot.
export function fileTranscriber(settings: Settings, locked: boolean): string | null {
  if (settings.dictation === LOCAL) return LOCAL
  if (locked) return null
  if (settings.dictation !== 'auto' && settings.dictation !== 'browser' && transcribes(settings, settings.dictation))
    return settings.dictation
  return PROVIDERS.find((p) => p.transcription && transcribes(settings, p.id))?.id ?? null
}

export function dictationSource(settings: Settings, locked: boolean): string | null {
  if (settings.dictation === LOCAL) return LOCAL
  const usable = (id: string) => transcribes(settings, id)
  const browser = recognizer() ? 'browser' : null
  if (settings.dictation === 'browser') return browser
  if (settings.dictation !== 'auto') return !locked && usable(settings.dictation) ? settings.dictation : null
  const api = locked ? undefined : PROVIDERS.find((p) => p.transcription && usable(p.id))
  return api?.id ?? browser
}

function browserError(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return t('O navegador não permitiu usar o microfone ou o reconhecimento de voz.')
  }
  if (code === 'no-speech') return t('Nenhuma fala foi detectada.')
  return t(
    'O reconhecimento de voz do navegador não está disponível aqui. Configure uma chave da OpenAI ou do Groq para ditar.',
  )
}

// How long a pause ends what is said, in hands-free voice mode.
export const SILENCE_MS = 1500
// Hands-free: gives up when nothing is said for this long.
export const NOTHING_SAID_MS = 15_000
// Loudness (RMS of the samples, 0 to 1) above which the microphone hears speech.
export const SPEECH_LEVEL = 0.02
// Hands-free: the longest a single turn may last, for a room that is never quiet.
export const LONGEST_TURN_MS = 120_000

// Decides, sample by sample, when the speaker has finished: after speech, a
// pause of `silence` ms; with no speech at all, after `nothing` ms; and in
// any case after `longest` ms.
export function silenceTracker(
  start: number,
  silence = SILENCE_MS,
  nothing = NOTHING_SAID_MS,
  level = SPEECH_LEVEL,
  longest = LONGEST_TURN_MS,
) {
  let heard = false
  let lastSound = start
  return {
    get heard() {
      return heard
    },
    push(rms: number, now: number): 'stop' | null {
      if (now - start >= longest) return 'stop'
      if (rms >= level) {
        heard = true
        lastSound = now
        return null
      }
      if (heard && now - lastSound >= silence) return 'stop'
      if (!heard && now - start >= nothing) return 'stop'
      return null
    },
  }
}

// Watches the microphone's loudness and calls `stop` when the speaker is done.
function watchSilence(stream: MediaStream, stop: () => void) {
  const Context = window.AudioContext ?? (window as any).webkitAudioContext
  if (!Context) return { heard: () => true, close: () => {} }
  const context: AudioContext = new Context()
  const analyser = context.createAnalyser()
  analyser.fftSize = 2048
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  const tracker = silenceTracker(Date.now())
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const sample of samples) sum += sample * sample
    if (tracker.push(Math.sqrt(sum / samples.length), Date.now()) === 'stop') stop()
  }, 100)
  return {
    heard: () => tracker.heard,
    close: () => {
      clearInterval(timer)
      void context.close().catch(() => {})
    },
  }
}

// Records speech and hands over the text, one recording per toggle. With
// `autoStop` (hands-free voice mode) a recording ends by itself at a pause.
export function useDictation(
  settings: Settings,
  locked: boolean,
  onText: (text: string) => void,
  options: { autoStop?: boolean } = {},
): Dictation {
  const [state, setState] = useState<DictationState>('idle')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  const source = dictationSource(settings, locked)
  const latest = useRef({ settings, onText, autoStop: !!options.autoStop })
  latest.current = { settings, onText, autoStop: !!options.autoStop }

  async function startApi(providerId: string) {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError(t('O navegador não permitiu usar o microfone ou o reconhecimento de voz.'))
      return
    }
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream)
    } catch {
      // Some browsers refuse to record the stream they just gave; free the microphone.
      stream.getTracks().forEach((track) => track.stop())
      setError(t('O navegador não permitiu usar o microfone ou o reconhecimento de voz.'))
      return
    }
    const chunks: Blob[] = []
    const silence = latest.current.autoStop
      ? watchSilence(stream, () => recorder.state === 'recording' && recorder.stop())
      : null
    recorder.ondataavailable = (event) => chunks.push(event.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      silence?.close()
      // Nothing was said: transcribing silence only makes up words.
      if (silence && !silence.heard()) {
        setState('idle')
        return
      }
      setState('transcribing')
      const { settings } = latest.current
      try {
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const text = await transcribeWith(settings, providerId, audio, setProgress)
        if (text) latest.current.onText(text)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setProgress('')
        setState('idle')
      }
    }
    try {
      recorder.start()
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      setError(t('O navegador não permitiu usar o microfone ou o reconhecimento de voz.'))
      return
    }
    stopRef.current = () => recorder.stop()
    setState('recording')
  }

  function startBrowser() {
    const Recognition = recognizer()!
    const recognition = new Recognition()
    recognition.lang = locale()
    recognition.continuous = true
    recognition.interimResults = false
    // Hands-free, a pause after what was said ends the recognition.
    let pause: ReturnType<typeof setTimeout> | undefined
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) latest.current.onText(String(result[0].transcript).trim())
      }
      if (latest.current.autoStop) {
        clearTimeout(pause)
        pause = setTimeout(() => recognition.stop(), SILENCE_MS)
      }
    }
    recognition.onerror = (event: any) => {
      // Hands-free, a turn with nothing said simply ends.
      if (latest.current.autoStop && event.error === 'no-speech') return
      setError(browserError(event.error))
    }
    recognition.onend = () => {
      clearTimeout(pause)
      setState('idle')
    }
    recognition.start()
    stopRef.current = () => recognition.stop()
    setState('recording')
  }

  function toggle() {
    if (state === 'recording') {
      stopRef.current?.()
      stopRef.current = null
      return
    }
    if (state !== 'idle' || !source) return
    setError('')
    if (source === 'browser') startBrowser()
    else startApi(source)
  }

  return { available: !!source, state, error, progress, toggle }
}

// The first use of local Whisper downloads it; this says how far along.
export function downloadLine(loaded: number, total: number): string {
  const mb = (n: number) => Math.round(n / 1e6)
  return t('Baixando o Whisper local: {loaded} de {total} MB', { loaded: mb(loaded), total: mb(total) })
}

// Speech to text with a provider's transcription model or with Whisper here.
export async function transcribeWith(
  settings: Settings,
  source: string,
  audio: Blob,
  onProgress: (line: string) => void = () => {},
  name?: string,
  language: string = settings.language,
): Promise<string> {
  if (source === LOCAL) {
    const { transcribeLocally } = await import('./localVoice')
    return transcribeLocally(audio, {
      size: settings.localWhisper,
      language,
      onProgress: ({ loaded, total }) => onProgress(loaded < total ? downloadLine(loaded, total) : ''),
    })
  }
  const provider = PROVIDERS.find((p) => p.id === source)!
  const { baseUrl, apiKey } = settings.providers[source]
  return transcribe({ provider, baseUrl, apiKey }, audio, language, name)
}
