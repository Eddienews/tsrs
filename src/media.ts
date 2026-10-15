import { t } from './i18n'
import { PROVIDERS } from './providers'
import type { MediaChoice, MediaKind, Settings } from './types'

// Images, video and audio made from a message by a media service (ElevenLabs,
// Runware, fal.ai, Replicate, WaveSpeedAI, Higgsfield) or, for images, by a
// chat provider that draws them (OpenAI, Gemini): which services there are,
// and who makes each kind. Making it is in mediaJobs.ts, loaded when needed.

export type MediaServiceId = 'elevenlabs' | 'runware' | 'fal' | 'replicate' | 'wavespeed' | 'higgsfield'

export const MEDIA_KINDS: MediaKind[] = ['image', 'video', 'audio']

export interface MediaService {
  id: MediaServiceId
  name: string
  // Default model for each kind it makes; '' when the user must pick one.
  models: Partial<Record<MediaKind, string>>
  // An example shown in the model field.
  examples: Partial<Record<MediaKind, string>>
  // Where keys are created and models listed.
  keyUrl: string
  catalogUrl: string
  // The API refuses calls from browsers, so it is reached through the local proxy.
  needsProxy?: boolean
}

export const MEDIA_SERVICES: MediaService[] = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    // A voice id reads the text aloud; two names pick other kinds of audio.
    models: { audio: 'JBFqnCBsd6RMkjVDRZzb' },
    examples: { audio: 'JBFqnCBsd6RMkjVDRZzb, sound-effects, music' },
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    catalogUrl: 'https://elevenlabs.io/app/voice-library',
  },
  {
    id: 'runware',
    name: 'Runware',
    models: { image: 'runware:100@1', video: '', audio: '' },
    examples: { video: 'minimax:h3@0', audio: 'fishaudio:s2.1@pro' },
    keyUrl: 'https://my.runware.ai/keys',
    catalogUrl: 'https://runware.ai/models',
  },
  {
    id: 'fal',
    name: 'fal.ai',
    models: {
      image: 'fal-ai/flux/schnell',
      video: 'fal-ai/kling-video/v3/standard/text-to-video',
      audio: 'fal-ai/stable-audio-25/text-to-audio',
    },
    examples: {},
    keyUrl: 'https://fal.ai/dashboard/keys',
    catalogUrl: 'https://fal.ai/models',
  },
  {
    id: 'replicate',
    name: 'Replicate',
    models: {
      image: 'black-forest-labs/flux-schnell',
      video: 'wan-video/wan-2.2-t2v-fast',
      audio: 'stability-ai/stable-audio-2.5',
    },
    examples: {},
    keyUrl: 'https://replicate.com/account/api-tokens',
    catalogUrl: 'https://replicate.com/explore',
    needsProxy: true,
  },
  {
    id: 'wavespeed',
    name: 'WaveSpeedAI',
    models: {
      image: 'wavespeed-ai/flux-2-klein-9b/text-to-image',
      video: 'alibaba/wan-2.7/text-to-video',
      audio: '',
    },
    examples: {},
    keyUrl: 'https://wavespeed.ai/accesskey',
    catalogUrl: 'https://wavespeed.ai/models',
  },
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    models: { image: 'higgsfield-ai/soul/v2/standard', video: '' },
    examples: { video: 'kling-video/v3/turbo/text-to-video' },
    keyUrl: 'https://console.higgsfield.ai',
    catalogUrl: 'https://console.higgsfield.ai',
    needsProxy: true,
  },
]

export function mediaService(id: string): MediaService | undefined {
  return MEDIA_SERVICES.find((s) => s.id === id)
}

// Who can make each kind, for the settings: providers first, then services.
export function mediaSources(kind: MediaKind): { id: string; name: string }[] {
  return [
    ...(kind === 'image' ? PROVIDERS.filter((p) => p.image) : []),
    ...MEDIA_SERVICES.filter((s) => kind in s.models),
  ].map(({ id, name }) => ({ id, name }))
}

// The default model of a source for a kind ('' when there is none).
export function defaultModel(source: string, kind: MediaKind): string {
  const service = mediaService(source)
  if (service) return service.models[kind] ?? ''
  return kind === 'image' ? (PROVIDERS.find((p) => p.id === source)?.image ?? '') : ''
}

function hasKey(settings: Settings, source: string): boolean {
  if (mediaService(source)) return !!settings.mediaKeys[source]?.trim()
  const provider = PROVIDERS.find((p) => p.id === source)
  const conn = settings.providers[source]
  return !!provider?.image && !!conn?.baseUrl && (!!conn.apiKey || !provider.keyRequired)
}

export interface MediaTarget {
  source: string
  model: string
  options: string
}

// Who makes `kind` now, or null when nobody can. A model typed in applies
// only to a source chosen by hand.
export function mediaSource(
  settings: Settings,
  kind: MediaKind,
  locked: boolean,
): MediaTarget | null {
  if (locked) return null
  const choice: MediaChoice = settings.media[kind]
  if (choice.source === 'auto') {
    const found = mediaSources(kind).find(
      (s) => hasKey(settings, s.id) && defaultModel(s.id, kind),
    )
    return found ? { source: found.id, model: defaultModel(found.id, kind), options: '' } : null
  }
  if (!hasKey(settings, choice.source)) return null
  const model = choice.model.trim() || defaultModel(choice.source, kind)
  return model ? { source: choice.source, model, options: choice.options } : null
}

// Why `kind` cannot be made now, for the message under the composer.
export function mediaProblem(settings: Settings, kind: MediaKind): string {
  const choice = settings.media[kind]
  const name =
    mediaService(choice.source)?.name ?? PROVIDERS.find((p) => p.id === choice.source)?.name
  if (choice.source !== 'auto' && name && !hasKey(settings, choice.source)) {
    return t('Informe a chave de {name} em Configurações → Mídia.', { name })
  }
  if (choice.source !== 'auto') return t('Informe o modelo em Configurações → Mídia.')
  return kind === 'image'
    ? t('Configure uma chave da OpenAI, do Gemini ou de um serviço de mídia para gerar imagens.')
    : kind === 'video'
      ? t(
          'Configure a chave do fal.ai, do Replicate ou da WaveSpeedAI, ou escolha o serviço e o modelo de vídeo em Configurações → Mídia.',
        )
      : t(
          'Configure a chave da ElevenLabs, do fal.ai ou do Replicate, ou escolha o serviço de áudio em Configurações → Mídia.',
        )
}
