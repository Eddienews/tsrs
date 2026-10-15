import { Loader2, Play, RotateCw, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from './i18n'
import { piperVoices, voicesFor, type PiperVoice } from './localVoiceInfo'
import { listElevenModels, listVoices, type ElevenModel, type ElevenVoice } from './mediaJobs'
import { elevenSpeechPrice } from './mediaPrice'
import { bestVoice, browserVoiceList, trySpeaking, voiceQuality } from './speech'
import { formatCost } from './usage'

// The account's voices and models, asked for once per key and session.
const voiceLists = new Map<string, Promise<ElevenVoice[]>>()
const modelLists = new Map<string, Promise<ElevenModel[]>>()

function cached<T>(lists: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let list = lists.get(key)
  if (!list) {
    list = load()
    list.catch(() => lists.delete(key))
    lists.set(key, list)
  }
  return list
}

function useList<T>(lists: Map<string, Promise<T[]>>, apiKey: string, load: (key: string) => Promise<T[]>) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string }>({
    items: [],
    loading: false,
    error: '',
  })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!apiKey) return setState({ items: [], loading: false, error: '' })
    let stale = false
    setState((s) => ({ ...s, loading: true, error: '' }))
    cached(lists, apiKey, () => load(apiKey))
      .then((items) => !stale && setState({ items, loading: false, error: '' }))
      .catch((err) => !stale && setState({ items: [], loading: false, error: err instanceof Error ? err.message : String(err) }))
    return () => {
      stale = true
    }
  }, [apiKey, attempt])
  const retry = () => {
    lists.delete(apiKey)
    setAttempt((n) => n + 1)
  }
  return { ...state, retry }
}

const OTHER = '__other'

interface VoiceProps {
  apiKey: string
  value: string
  onChange: (value: string) => void
  // Choices that are not voices, such as music, listed first.
  extras?: { value: string; label: string }[]
  // The voice used when none is chosen.
  fallback: string
  label: string
}

// A list of the account's voices, its own first, with a sample to listen to.
export function ElevenVoiceField(p: VoiceProps) {
  const { items: voices, loading, error, retry } = useList(voiceLists, p.apiKey, listVoices)
  const [typing, setTyping] = useState(false)
  const [sampling, setSampling] = useState(false)
  const sample = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => sample.current?.pause(), [])

  const chosen = p.value || p.fallback
  const voice = voices.find((v) => v.id === chosen)
  const known = !!voice || p.extras?.some((e) => e.value === chosen)
  const mine = voices.filter((v) => v.mine)
  const theirs = voices.filter((v) => !v.mine)

  function listen() {
    if (sampling) {
      sample.current?.pause()
      return setSampling(false)
    }
    if (!voice?.preview) return
    sample.current?.pause()
    const audio = new Audio(voice.preview)
    sample.current = audio
    audio.onended = audio.onerror = () => setSampling(false)
    setSampling(true)
    audio.play().catch(() => setSampling(false))
  }

  if (typing || (!loading && !error && voices.length > 0 && !known && p.value)) {
    return (
      <div className="flex min-w-48 flex-1 gap-1">
        <Input
          aria-label={p.label}
          className="h-9 flex-1 font-mono text-xs"
          placeholder={t('ID da voz')}
          value={p.value}
          autoFocus={typing}
          onChange={(e) => p.onChange(e.target.value.trim())}
        />
        {voices.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setTyping(false)
              p.onChange('')
            }}
          >
            {t('Escolher da lista')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-48 flex-1 flex-col gap-1">
      <div className="flex gap-1">
        <select
          aria-label={p.label}
          className="select-native min-w-0 flex-1"
          value={known ? chosen : ''}
          disabled={loading || !p.apiKey}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setTyping(true)
              return
            }
            p.onChange(e.target.value === p.fallback ? '' : e.target.value)
          }}
        >
          {loading && <option value="">{t('Carregando as vozes…')}</option>}
          {!loading && !known && <option value="">{p.value || t('Voz padrão')}</option>}
          {p.extras?.map((extra) => (
            <option key={extra.value} value={extra.value}>
              {extra.label}
            </option>
          ))}
          {mine.length > 0 && (
            <optgroup label={t('Minhas vozes')}>
              {mine.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          )}
          {theirs.length > 0 && (
            <optgroup label={t('Vozes da ElevenLabs')}>
              {theirs.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value={OTHER}>{t('Outra voz (ID)…')}</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          aria-label={sampling ? t('Parar a amostra') : t('Ouvir uma amostra')}
          title={sampling ? t('Parar a amostra') : t('Ouvir uma amostra')}
          disabled={!voice?.preview}
          onClick={listen}
        >
          {sampling ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
      </div>
      {loading && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> {t('Carregando as vozes da sua conta…')}
        </span>
      )}
      {voice?.description && <span className="text-xs text-muted-foreground">{voice.description}</span>}
      {error && (
        <span className="flex flex-wrap items-center gap-1 text-xs text-destructive">
          {t('Não foi possível carregar as vozes: {error}', { error })}
          <button className="inline-flex items-center gap-1 underline" onClick={retry}>
            <RotateCw className="size-3" /> {t('Tentar de novo')}
          </button>
        </span>
      )}
    </div>
  )
}

function parseOptions(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

// The model's id inside the JSON options, which the request sends as they are.
export function withModelId(options: string, modelId: string): string | null {
  const parsed = parseOptions(options)
  if (!parsed) return null
  const { model_id: _old, ...rest } = parsed
  const next = modelId ? { model_id: modelId, ...rest } : rest
  return Object.keys(next).length ? JSON.stringify(next) : ''
}

export function modelIdOf(options: string): string {
  return String(parseOptions(options)?.model_id ?? '')
}

const DEFAULT_MODEL = 'eleven_multilingual_v2'

// Which ElevenLabs model reads: quality against speed and price.
export function ElevenModelField(p: { apiKey: string; options: string; onOptions: (options: string) => void }) {
  const { items: models, loading } = useList(modelLists, p.apiKey, listElevenModels)
  const current = modelIdOf(p.options) || DEFAULT_MODEL
  const invalid = parseOptions(p.options) === null
  const list = models.length ? models : [{ id: DEFAULT_MODEL, name: 'Eleven Multilingual v2' }]
  const price = (id: string) =>
    t('{rate}/mil caracteres', { rate: formatCost(elevenSpeechPrice(id)).replace(/0+$/, '').replace(/[.,]$/, '') })
  return (
    <select
      aria-label={t('Modelo da ElevenLabs')}
      className="select-native min-w-48"
      value={current}
      disabled={loading || invalid}
      title={invalid ? t('Corrija o JSON das opções para trocar o modelo.') : undefined}
      onChange={(e) => {
        const next = withModelId(p.options, e.target.value === DEFAULT_MODEL ? '' : e.target.value)
        if (next !== null) p.onOptions(next)
      }}
    >
      {!list.some((m) => m.id === current) && <option value={current}>{current}</option>}
      {list.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name} · {price(m.id)}
        </option>
      ))}
    </select>
  )
}

// The browser's voices for the interface language, the most natural first,
// with a button to hear the one chosen.
export function BrowserVoiceField(p: { value: string; onChange: (name: string) => void; lang: string }) {
  const [voices, setVoices] = useState(() => browserVoiceList())
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const load = () => setVoices(browserVoiceList())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  const base = p.lang.split('-')[0].toLowerCase()
  const ranked = (list: SpeechSynthesisVoice[]) =>
    [...list].sort((a, b) => voiceQuality(b) - voiceQuality(a) || a.name.localeCompare(b.name))
  const local = ranked(voices.filter((v) => v.lang.toLowerCase().startsWith(base)))
  const others = ranked(voices.filter((v) => !v.lang.toLowerCase().startsWith(base)))
  const auto = bestVoice(voices, p.lang)
  const natural = local.some((v) => voiceQuality(v) === 3)
  const label = (v: SpeechSynthesisVoice) =>
    `${v.name}${voiceQuality(v) >= 2 ? ` · ${t('natural')}` : ''}${v.localService ? '' : ` · ${t('online')}`}`
  return (
    <div className="flex min-w-48 flex-1 flex-col gap-1">
      <div className="flex gap-1">
        <select
          aria-label={t('Voz do navegador')}
          className="select-native min-w-0 flex-1"
          value={voices.some((v) => v.name === p.value) ? p.value : ''}
          onChange={(e) => p.onChange(e.target.value)}
        >
          <option value="">
            {auto ? t('Automática: {name}', { name: auto.name }) : t('Automática')}
          </option>
          {local.length > 0 && (
            <optgroup label={t('No idioma da interface')}>
              {local.map((v) => (
                <option key={v.voiceURI} value={v.name}>
                  {label(v)}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={t('Outros idiomas')}>
              {others.map((v) => (
                <option key={v.voiceURI} value={v.name}>
                  {label(v)} ({v.lang})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          aria-label={t('Ouvir uma amostra')}
          title={t('Ouvir uma amostra')}
          disabled={!voices.length}
          onClick={() => trySpeaking(t('Olá! Esta é a voz que vai ler as respostas.'), p.lang, p.value)}
        >
          <Play className="size-3.5" />
        </Button>
      </div>
      {voices.length > 0 && !natural && (
        <span className="text-xs text-muted-foreground">
          {t(
            'Este navegador não tem vozes naturais neste idioma. O Microsoft Edge traz vozes neurais grátis (como Francisca e Antonio, em português), que aparecem aqui ao abrir o TSRS nele.',
          )}
        </span>
      )}
    </div>
  )
}

// Piper's voices for the interface language, from its catalog, with a sample
// made here. The first sample downloads the voice (tens of MB), once.
export function PiperVoiceField(p: { value: string; onChange: (key: string) => void; lang: string; fallback: string }) {
  const [voices, setVoices] = useState<PiperVoice[]>([])
  const [error, setError] = useState('')
  const [sample, setSample] = useState<'idle' | 'making' | 'playing'>('idle')
  const [status, setStatus] = useState('')
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  useEffect(() => {
    let stale = false
    piperVoices()
      .then((all) => !stale && setVoices(voicesFor(all, p.lang)))
      .catch((err) => !stale && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      stale = true
    }
  }, [p.lang])
  const chosen = p.value || p.fallback
  const voice = voices.find((v) => v.key === chosen)

  async function listen() {
    if (sample === 'playing') {
      audio.current?.pause()
      return setSample('idle')
    }
    setSample('making')
    setStatus('')
    try {
      const { speakLocally } = await import('./localVoice')
      const made = await speakLocally(t('Olá! Esta é a voz que vai ler as respostas.'), chosen, ({ loaded, total }) =>
        setStatus(total ? t('Baixando a voz: {loaded} de {total} MB', { loaded: Math.round(loaded / 1e6), total: Math.round(total / 1e6) }) : ''),
      )
      setStatus('')
      const player = new Audio(`data:${made.mime};base64,${made.data}`)
      audio.current = player
      player.onended = player.onerror = () => setSample('idle')
      setSample('playing')
      await player.play()
    } catch (err) {
      setStatus(t('Falhou: {message}', { message: err instanceof Error ? err.message : String(err) }))
      setSample('idle')
    }
  }

  return (
    <div className="flex min-w-48 flex-1 flex-col gap-1">
      <div className="flex gap-1">
        <select
          aria-label={t('Voz do Piper')}
          className="select-native min-w-0 flex-1"
          value={chosen}
          onChange={(e) => p.onChange(e.target.value === p.fallback ? '' : e.target.value)}
        >
          {!voice && <option value={chosen}>{chosen}</option>}
          {voices.map((v) => (
            <option key={v.key} value={v.key}>
              {`${v.name} · ${v.locale} · ${v.quality}${v.bytes ? ` · ${Math.round(v.bytes / 1e6)} MB` : ''}`}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          aria-label={sample === 'playing' ? t('Parar a amostra') : t('Ouvir uma amostra')}
          title={sample === 'playing' ? t('Parar a amostra') : t('Ouvir uma amostra')}
          disabled={sample === 'making'}
          onClick={listen}
        >
          {sample === 'making' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : sample === 'playing' ? (
            <Square className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">
          {t('A lista de vozes do Piper não carregou ({error}). Ela vem pelo servidor do TSRS (npm run dev).', { error })}
        </p>
      )}
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  )
}
