import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EyeButton } from './EyeButton'
import { t } from './i18n'
import {
  defaultModel,
  MEDIA_KINDS,
  MEDIA_SERVICES,
  mediaService,
  mediaSources,
  type MediaService,
} from './media'
import { listVoices } from './mediaJobs'
import type { MediaChoice, MediaKind, Settings } from './types'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  locked: boolean
}

const hint = 'text-xs text-muted-foreground'
const link = 'inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline'

function kindName(kind: MediaKind): string {
  return kind === 'image' ? t('Imagem') : kind === 'video' ? t('Vídeo') : t('Áudio')
}

// Options worth knowing about, shown in the empty field.
const OPTION_EXAMPLES: Record<string, Partial<Record<MediaKind, string>>> = {
  openai: { audio: '{"voice": "coral", "instructions": "Fale com entusiasmo"}' },
  gemini: {
    video: '{"aspectRatio": "9:16", "durationSeconds": 8, "resolution": "1080p"}',
    audio: '{"voice": "Puck", "style": "alegre e acolhedor"}',
  },
  elevenlabs: { audio: '{"voice_settings": {"stability": 0.5}}' },
  fal: { video: '{"duration": "5", "aspect_ratio": "16:9"}' },
}

function isJsonObject(text: string): boolean {
  if (!text.trim()) return true
  try {
    const value = JSON.parse(text)
    return !!value && typeof value === 'object' && !Array.isArray(value)
  } catch {
    return false
  }
}

interface Voice {
  id: string
  name: string
}

function KeyCard(props: Props & { service: MediaService; onVoices: (voices: Voice[]) => void }) {
  const { service, settings, locked } = props
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const key = settings.mediaKeys[service.id] ?? ''
  const kinds = MEDIA_KINDS.filter((kind) => kind in service.models)

  async function loadVoices() {
    setBusy(true)
    setNote('')
    try {
      const voices = await listVoices(key)
      props.onVoices(voices)
      setNote(t('{count} vozes carregadas.', { count: voices.length }))
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="media-service space-y-2 rounded-md border p-3" data-service={service.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{service.name}</span>
        <span className={hint}>{kinds.map(kindName).join(', ')}</span>
        <a className={`${link} ml-auto`} href={service.keyUrl} target="_blank" rel="noreferrer">
          {t('Criar chave')}
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="relative">
        <Input
          aria-label={t('Chave de {name}', { name: service.name })}
          type={shown ? 'text' : 'password'}
          autoComplete="off"
          disabled={locked}
          placeholder={
            locked
              ? t('Desbloqueie as chaves para ver ou alterar')
              : service.id === 'higgsfield'
                ? t('id:segredo')
                : ''
          }
          className="pr-9 font-mono text-xs"
          value={key}
          onChange={(e) =>
            props.onChange((s) => ({
              ...s,
              mediaKeys: { ...s.mediaKeys, [service.id]: e.target.value.trim() },
            }))
          }
        />
        <EyeButton
          visible={shown}
          show={t('Mostrar chave')}
          hide={t('Ocultar chave')}
          disabled={locked}
          className="absolute top-0.5 right-0.5"
          onToggle={() => setShown(!shown)}
        />
      </div>
      {service.id === 'higgsfield' && (
        <p className={hint}>
          {t(
            'Escreva o id e o segredo da chave separados por dois-pontos. A API da Higgsfield não aceita chamadas do navegador: ela só funciona com o proxy local rodando (npm run proxy).',
          )}
        </p>
      )}
      {service.id === 'elevenlabs' && key && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            disabled={busy || locked}
            onClick={loadVoices}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {t('Carregar vozes')}
          </Button>
          {note && <span className={hint}>{note}</span>}
        </div>
      )}
    </div>
  )
}

function KindChoice(props: Props & { kind: MediaKind; voices: Voice[] }) {
  const { kind, settings, onChange } = props
  const choice = settings.media[kind]
  const service = mediaService(choice.source)
  const fallback = choice.source === 'auto' ? '' : defaultModel(choice.source, kind)
  const example = service?.examples[kind]
  const list = `media-models-${kind}`
  const set = (fields: Partial<MediaChoice>) =>
    onChange((s) => ({ ...s, media: { ...s.media, [kind]: { ...s.media[kind], ...fields } } }))

  return (
    <div className="media-kind space-y-1.5" data-kind={kind}>
      <Label htmlFor={`media-${kind}`}>{kindName(kind)}</Label>
      <div className="flex flex-wrap gap-2">
        <select
          id={`media-${kind}`}
          className="select-native"
          value={choice.source}
          onChange={(e) => set({ source: e.target.value, model: '', options: '' })}
        >
          <option value="auto">{t('Automático')}</option>
          {mediaSources(kind).map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        {choice.source !== 'auto' && (
          <>
            <Input
              aria-label={t('Modelo de {kind}', { kind: kindName(kind).toLowerCase() })}
              className="h-9 min-w-48 flex-1 font-mono text-xs"
              list={service?.id === 'elevenlabs' ? list : undefined}
              placeholder={fallback || (example ? t('ex.: {example}', { example }) : t('Modelo'))}
              value={choice.model}
              onChange={(e) => set({ model: e.target.value.trim() })}
            />
            {service?.id === 'elevenlabs' && (
              <datalist id={list}>
                <option value="sound-effects">{t('Efeitos sonoros')}</option>
                <option value="music">{t('Música')}</option>
                {props.voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </datalist>
            )}
          </>
        )}
      </div>
      {choice.source !== 'auto' && !fallback && !choice.model && (
        <p className="text-xs text-warning">{t('Este serviço não tem modelo padrão para isso: informe um.')}</p>
      )}
      {service && (
        <a className={link} href={service.catalogUrl} target="_blank" rel="noreferrer">
          {service.id === 'elevenlabs' ? t('Ver vozes') : t('Ver modelos de {name}', { name: service.name })}
          <ExternalLink className="size-3" />
        </a>
      )}
      {choice.source !== 'auto' && (
        <details className={hint} open={!!choice.options}>
          <summary className="cursor-pointer">{t('Opções do modelo (JSON)')}</summary>
          <Textarea
            aria-label={t('Opções do modelo de {kind}', { kind: kindName(kind).toLowerCase() })}
            rows={3}
            className="mt-1 font-mono text-xs"
            placeholder={
              OPTION_EXAMPLES[choice.source]?.[kind] ?? (kind === 'video' ? '{"duration": 5}' : '{}')
            }
            value={choice.options}
            onChange={(e) => set({ options: e.target.value })}
          />
          {!isJsonObject(choice.options) && (
            <p className="mt-1 text-destructive">{t('Não é um objeto JSON válido.')}</p>
          )}
          <p className="mt-1">
            {t(
              'Vão junto com o pedido, para parâmetros que só alguns modelos aceitam (duração, proporção, resolução…). Cada modelo lista os seus na página dele.',
            )}
          </p>
        </details>
      )}
    </div>
  )
}

export default function MediaSection(props: Props) {
  const [voices, setVoices] = useState<Voice[]>([])
  return (
    <div className="media space-y-5">
      <p className={hint}>
        {t(
          'Serviços que geram imagem, vídeo e áudio. Os botões Imagem, Vídeo e Áudio, ao lado de Prompts, transformam a próxima mensagem num pedido; o arquivo gerado fica na conversa. As chaves ficam neste navegador, como as dos provedores, e cada serviço cobra pelo que gerar.',
        )}
      </p>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('Chaves')}</h3>
        {MEDIA_SERVICES.map((service) => (
          <KeyCard key={service.id} {...props} service={service} onVoices={setVoices} />
        ))}
      </section>
      <section className="space-y-4">
        <h3 className="text-sm font-medium">{t('Quem gera cada tipo')}</h3>
        {MEDIA_KINDS.map((kind) => (
          <KindChoice key={kind} {...props} kind={kind} voices={voices} />
        ))}
        <p className={hint}>
          {t(
            'No automático, usa o primeiro com chave que tenha modelo padrão: para imagem, a OpenAI ou o Gemini antes dos serviços de mídia; para vídeo e áudio, os serviços de mídia antes do Veo (chave do Gemini) e da voz da OpenAI. Na ElevenLabs, o modelo é o id de uma voz, sound-effects ou music.',
          )}
        </p>
      </section>
    </div>
  )
}
