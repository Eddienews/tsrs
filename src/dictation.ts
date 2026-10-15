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
  toggle: () => void
}

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
  if (locked) return null
  if (settings.dictation !== 'auto' && settings.dictation !== 'browser' && transcribes(settings, settings.dictation))
    return settings.dictation
  return PROVIDERS.find((p) => p.transcription && transcribes(settings, p.id))?.id ?? null
}

export function dictationSource(settings: Settings, locked: boolean): string | null {
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

// Records speech and hands over the text, one recording per toggle.
export function useDictation(
  settings: Settings,
  locked: boolean,
  onText: (text: string) => void,
): Dictation {
  const [state, setState] = useState<DictationState>('idle')
  const [error, setError] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  const source = dictationSource(settings, locked)
  const latest = useRef({ settings, onText })
  latest.current = { settings, onText }

  async function startApi(providerId: string) {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError(t('O navegador não permitiu usar o microfone ou o reconhecimento de voz.'))
      return
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      setState('transcribing')
      const { settings } = latest.current
      const provider = PROVIDERS.find((p) => p.id === providerId)!
      const { baseUrl, apiKey } = settings.providers[providerId]
      try {
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const text = await transcribe({ provider, baseUrl, apiKey }, audio, settings.language)
        if (text) latest.current.onText(text)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setState('idle')
      }
    }
    recorder.start()
    stopRef.current = () => recorder.stop()
    setState('recording')
  }

  function startBrowser() {
    const Recognition = recognizer()!
    const recognition = new Recognition()
    recognition.lang = locale()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) latest.current.onText(String(result[0].transcript).trim())
      }
    }
    recognition.onerror = (event: any) => setError(browserError(event.error))
    recognition.onend = () => setState('idle')
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

  return { available: !!source, state, error, toggle }
}
