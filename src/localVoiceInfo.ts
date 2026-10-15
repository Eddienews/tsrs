// What the settings need to know about the local voices (localVoice.ts),
// without loading the workers: model sizes, Piper's catalog, what is already
// downloaded.

export const MODELS_PATH = '/__tsrs/models'

export const WHISPER_SIZES = ['tiny', 'base', 'small'] as const
export type WhisperSize = (typeof WHISPER_SIZES)[number]
// About how much each one downloads the first time.
export const WHISPER_MB: Record<WhisperSize, number> = { tiny: 45, base: 80, small: 250 }
export const DEFAULT_WHISPER: WhisperSize = 'base'

export function whisperRepo(size: WhisperSize | undefined): string {
  return `onnx-community/whisper-${WHISPER_SIZES.includes(size as WhisperSize) ? size : DEFAULT_WHISPER}`
}

export interface PiperVoice {
  // As Piper names it: pt_BR-faber-medium.
  key: string
  // pt_BR
  locale: string
  name: string
  quality: string
  // The model's path in the voices repository.
  path: string
  bytes: number
}

// Voices for each app language, used when none is chosen.
export const DEFAULT_PIPER: Record<string, string> = {
  pt: 'pt_BR-faber-medium',
  en: 'en_US-lessac-medium',
}

export function defaultPiperVoice(language: string): string {
  return DEFAULT_PIPER[language.split('-')[0]] ?? DEFAULT_PIPER.en
}

// The voice's model path, from its name: pt_BR-faber-medium is
// pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.
export function piperPath(key: string): string {
  const match = /^(([a-z]{2,3})_[A-Z]{2})-(.+)-(x_low|low|medium|high)$/.exec(key)
  if (!match) throw new Error(`Unknown Piper voice: ${key}`)
  const [, locale, family, name, quality] = match
  return `${family}/${locale}/${name}/${quality}/${key}.onnx`
}

// Piper's catalog (voices.json), as a list.
export function parseVoices(catalog: Record<string, any>): PiperVoice[] {
  return Object.entries(catalog).flatMap(([key, voice]) => {
    const files = Object.entries<{ size_bytes?: number }>(voice?.files ?? {})
    const model = files.find(([path]) => path.endsWith('.onnx'))
    if (!model) return []
    return [
      {
        key,
        locale: String(voice.language?.code ?? key.split('-')[0]),
        name: String(voice.name ?? key),
        quality: String(voice.quality ?? ''),
        path: model[0],
        bytes: model[1].size_bytes ?? 0,
      },
    ]
  })
}

// The voices for a language (its region first), then the rest.
export function voicesFor(voices: PiperVoice[], language: string): PiperVoice[] {
  const base = language.split('-')[0].toLowerCase()
  const fits = voices.filter((v) => v.locale.toLowerCase().startsWith(base))
  return fits.sort((a, b) => a.locale.localeCompare(b.locale) || a.name.localeCompare(b.name) || a.quality.localeCompare(b.quality))
}

let catalog: Promise<PiperVoice[]> | null = null
export function piperVoices(): Promise<PiperVoice[]> {
  catalog ??= fetch(`${MODELS_PATH}/hf/rhasspy/piper-voices/resolve/main/voices.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then(parseVoices)
  catalog.catch(() => (catalog = null))
  return catalog
}

// How much of a model is already on this computer, in bytes.
export async function downloadedBytes(repo: string, prefix = ''): Promise<number> {
  try {
    const res = await fetch(`${MODELS_PATH}/size?repo=${encodeURIComponent(repo)}&prefix=${encodeURIComponent(prefix)}`)
    return res.ok ? (await res.json()).bytes : 0
  } catch {
    return 0
  }
}
