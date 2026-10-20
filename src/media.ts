import { locale, t } from './i18n'
import { defaultPiperVoice } from './localVoiceInfo'
import { PROVIDERS } from './providers'
import type { MediaChoice, MediaKind, Provider, Settings } from './types'

// Images, video and audio made from a message by a media service (ElevenLabs,
// Runware, fal.ai, Replicate, WaveSpeedAI, Higgsfield, Krea) or, for images, by a
// chat provider that draws them (OpenAI, Gemini): which services there are,
// and who makes each kind. Making it is in mediaJobs.ts, loaded when needed.

export type MediaServiceId =
  | 'elevenlabs'
  | 'runware'
  | 'fal'
  | 'replicate'
  | 'wavespeed'
  | 'higgsfield'
  | 'stability'
  | 'bfl'
  | 'minimax'
  | 'cartesia'
  | 'krea'

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
  {
    id: 'stability',
    name: 'Stability AI',
    // The model is the endpoint: core, ultra or sd3.
    models: { image: 'core' },
    examples: { image: 'ultra' },
    keyUrl: 'https://platform.stability.ai/account/keys',
    catalogUrl: 'https://platform.stability.ai/docs/api-reference',
  },
  {
    id: 'bfl',
    name: 'Black Forest Labs',
    models: { image: 'flux-2-pro' },
    examples: { image: 'flux-2-max' },
    keyUrl: 'https://dashboard.bfl.ai',
    catalogUrl: 'https://docs.bfl.ai',
    needsProxy: true,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    // For audio, the model is a voice.
    models: { video: 'MiniMax-H3', audio: 'Portuguese_Wiselady' },
    examples: { video: 'MiniMax-H3-Max' },
    keyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    catalogUrl: 'https://platform.minimax.io/docs/faq/system-voice-id',
  },
  {
    id: 'cartesia',
    name: 'Cartesia',
    // The model is a voice; Sonic speaks it in the app's language.
    models: { audio: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4' },
    examples: {},
    keyUrl: 'https://play.cartesia.ai/keys',
    catalogUrl: 'https://play.cartesia.ai/voices',
  },
  {
    id: 'krea',
    name: 'Krea',
    // Krea's model ids, as its catalogue lists them (the kind comes first in
    // the endpoint, and may be typed too: video/minimax/h3-max-turbo).
    models: { image: 'z-image/z-image', video: 'minimax/h3-max-turbo', audio: '' },
    examples: { image: 'google/nano-banana-pro', video: 'bytedance/seedance-2-5' },
    keyUrl: 'https://krea.ai/features/api',
    catalogUrl: 'https://docs.krea.ai',
  },
]

export function mediaService(id: string): MediaService | undefined {
  return MEDIA_SERVICES.find((s) => s.id === id)
}

// Who can make each kind, for the settings: providers first, then services.
// The model a chat provider makes a kind with, if it makes it.
function providerModel(provider: Provider | undefined, kind: MediaKind): string {
  return (kind === 'image' ? provider?.image : kind === 'video' ? provider?.video : provider?.speech) ?? ''
}

// Who can make each kind, for the settings and for 'auto'. Images try the chat
// providers first; video and audio try the media services first, since a key
// added there was added for that.
export function mediaSources(kind: MediaKind): { id: string; name: string }[] {
  const providers = PROVIDERS.filter((p) => providerModel(p, kind))
  const services = MEDIA_SERVICES.filter((s) => kind in s.models)
  const sources = (kind === 'image' ? [...providers, ...services] : [...services, ...providers]).map(
    ({ id, name }) => ({ id, name }),
  )
  // ComfyUI and stable-diffusion.cpp on this computer come last, and 'auto'
  // never picks them (they may not be running): they are chosen by hand.
  if (kind === 'video') return sources
  const local = kind === 'image' ? [COMFY, SDCPP] : [COMFY]
  return [...sources, ...local.map((id) => ({ id, name: sourceName(id, kind) }))]
}

// The default model of a source for a kind ('' when there is none).
export function defaultModel(source: string, kind: MediaKind): string {
  if (source === PIPER) return kind === 'audio' ? defaultPiperVoice(locale()) : ''
  if (source === COMFY) return kind === 'audio' ? COMFY_AUDIO_MODEL : kind === 'image' ? COMFY_IMAGE_MODEL : ''
  if (source === SDCPP) return kind === 'image' ? SDCPP_IMAGE_MODEL : ''
  const service = mediaService(source)
  if (service) return service.models[kind] ?? ''
  return providerModel(PROVIDERS.find((p) => p.id === source), kind)
}

function hasKey(settings: Settings, source: string): boolean {
  // Piper runs on this computer and needs no key.
  if (source === PIPER || source === COMFY || source === SDCPP) return true
  if (mediaService(source)) return !!settings.mediaKeys[source]?.trim()
  const provider = PROVIDERS.find((p) => p.id === source)
  const conn = settings.providers[source]
  return !!provider && !!conn?.baseUrl && (!!conn.apiKey || !provider.keyRequired)
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
      (s) => s.id !== COMFY && s.id !== SDCPP && hasKey(settings, s.id) && defaultModel(s.id, kind),
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
    return mediaService(choice.source)
      ? t('Informe a chave de {name} em Configurações → Mídia.', { name })
      : t('Informe a chave de {name} em Configurações → Provedores.', { name })
  }
  if (choice.source !== 'auto') return t('Informe o modelo em Configurações → Mídia.')
  return kind === 'image'
    ? t('Configure em Configurações → Mídia um serviço que gere imagens.')
    : kind === 'video'
      ? t('Configure em Configurações → Mídia um serviço que gere vídeos.')
      : t('Configure em Configurações → Mídia um serviço que gere áudio.')
}

// Sources that read text aloud, for replies; music and sound models do not.
// Piper's voices run in the browser, with files kept by the TSRS server.
export const PIPER = 'piper'

// Media from ComfyUI on this computer, asked through the TSRS server; no key
// and no cost per file. Music and sound with Stable Audio 3 Medium; images
// with Z-Image Turbo, or Qwen-Image-Edit-2511 when images are attached.
export const COMFY = 'comfyui'
export const COMFY_AUDIO_MODEL = 'stable_audio_3_medium'
export const COMFY_IMAGE_MODEL = 'z-image-turbo'

// Images from stable-diffusion.cpp's sd-server on this computer, also asked
// through the TSRS server; it makes them with whatever model it was started
// with, on GPUs ComfyUI may not reach (Vulkan).
export const SDCPP = 'sdcpp'
export const SDCPP_IMAGE_MODEL = 'sd-server'

export const READER_SOURCES = [PIPER, 'elevenlabs', 'openai', 'gemini', 'minimax', 'cartesia']

// Who reads replies aloud now, or null for the browser's own voices (also
// when the chosen source has no key, or the keys are locked).
export function readerSource(settings: Settings, locked: boolean): MediaTarget | null {
  const choice = settings.readAloud
  if (locked || choice.source === 'browser' || !READER_SOURCES.includes(choice.source)) return null
  if (!hasKey(settings, choice.source)) return null
  const model = choice.model.trim() || defaultModel(choice.source, 'audio')
  return model ? { source: choice.source, model, options: choice.options } : null
}

export function sourceName(source: string, kind?: MediaKind): string {
  if (source === PIPER) return t('Piper (local, grátis)')
  if (source === COMFY) return kind === 'image' ? t('ComfyUI local (Z-Image / Qwen Edit)') : kind === 'audio' ? t('ComfyUI local (Stable Audio 3)') : t('ComfyUI local')
  if (source === SDCPP) return t('stable-diffusion.cpp local (sd-server)')
  return mediaService(source)?.name ?? PROVIDERS.find((p) => p.id === source)?.name ?? source
}
