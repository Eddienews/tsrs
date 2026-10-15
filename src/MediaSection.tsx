import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EyeButton } from './EyeButton'
import { locale, t } from './i18n'
import { STOCK_SERVICES, stockKeyId } from './stock'
import {
  defaultModel,
  MEDIA_KINDS,
  MEDIA_SERVICES,
  mediaService,
  mediaSources,
  READER_SOURCES,
  sourceName,
  type MediaService,
} from './media'
import { BrowserVoiceField, ElevenModelField, ElevenVoiceField } from './VoiceFields'
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
  stability: { image: '{"aspect_ratio": "16:9"}' },
  bfl: { image: '{"width": 1440, "height": 1024}' },
  minimax: { video: '{"resolution": "768P", "duration": 6}' },
  cartesia: { audio: '{"language": "es"}' },
  xai: { video: '{"duration": 6}' },
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

function KeyCard(props: Props & { service: MediaService }) {
  const { service, settings, locked } = props
  const [shown, setShown] = useState(false)
  const key = settings.mediaKeys[service.id] ?? ''
  const kinds = MEDIA_KINDS.filter((kind) => kind in service.models)

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
        <p className={hint}>{t('Escreva o id e o segredo da chave separados por dois-pontos.')}</p>
      )}
      {service.needsProxy && (
        <p className={hint}>
          {t(
            'A API de {name} não aceita chamadas do navegador: ela só funciona com o proxy local rodando (npm run proxy).',
            { name: service.name },
          )}
        </p>
      )}
    </div>
  )
}

function KindChoice(props: Props & { kind: MediaKind }) {
  const { kind, settings, onChange } = props
  const choice = settings.media[kind]
  const service = mediaService(choice.source)
  const fallback = choice.source === 'auto' ? '' : defaultModel(choice.source, kind)
  const example = service?.examples[kind]
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
        {choice.source !== 'auto' && service?.id === 'elevenlabs' && kind === 'audio' ? (
          <>
            <ElevenVoiceField
              apiKey={settings.mediaKeys.elevenlabs ?? ''}
              label={t('Voz ou tipo de áudio')}
              value={choice.model}
              fallback={fallback}
              extras={[
                { value: 'sound-effects', label: t('Efeitos sonoros') },
                { value: 'music', label: t('Música') },
              ]}
              onChange={(model) => set({ model })}
            />
            {!['music', 'sound-effects'].includes(choice.model) && (
              <ElevenModelField
                apiKey={settings.mediaKeys.elevenlabs ?? ''}
                options={choice.options}
                onOptions={(options) => set({ options })}
              />
            )}
          </>
        ) : (
          choice.source !== 'auto' && (
            <Input
              aria-label={t('Modelo de {kind}', { kind: kindName(kind).toLowerCase() })}
              className="h-9 min-w-48 flex-1 font-mono text-xs"
              placeholder={fallback || (example ? t('ex.: {example}', { example }) : t('Modelo'))}
              value={choice.model}
              onChange={(e) => set({ model: e.target.value.trim() })}
            />
          )
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

// Who reads replies aloud: the browser's voices or a voice service.
function ReaderChoice(props: Props) {
  const { settings, onChange } = props
  const choice = settings.readAloud
  const service = choice.source === 'browser' ? undefined : choice.source
  const fallback = service ? defaultModel(service, 'audio') : ''
  const set = (fields: Partial<MediaChoice>) =>
    onChange((s) => ({ ...s, readAloud: { ...s.readAloud, ...fields } }))
  return (
    <section className="reader space-y-1.5">
      <Label htmlFor="read-aloud" className="text-sm font-medium">
        {t('Leitura em voz alta')}
      </Label>
      <div className="flex flex-wrap gap-2">
        <select
          id="read-aloud"
          className="select-native"
          value={choice.source}
          onChange={(e) => set({ source: e.target.value, model: '', options: '' })}
        >
          <option value="browser">{t('Voz do navegador')}</option>
          {READER_SOURCES.map((id) => (
            <option key={id} value={id}>
              {sourceName(id)}
            </option>
          ))}
        </select>
        {service === 'elevenlabs' ? (
          <>
            <ElevenVoiceField
              apiKey={settings.mediaKeys.elevenlabs ?? ''}
              label={t('Voz da leitura')}
              value={choice.model}
              fallback={fallback}
              onChange={(model) => set({ model })}
            />
            <ElevenModelField
              apiKey={settings.mediaKeys.elevenlabs ?? ''}
              options={choice.options}
              onOptions={(options) => set({ options })}
            />
          </>
        ) : service ? (
          <Input
            aria-label={t('Voz ou modelo da leitura')}
            className="h-9 min-w-48 flex-1 font-mono text-xs"
            placeholder={fallback}
            value={choice.model}
            onChange={(e) => set({ model: e.target.value.trim() })}
          />
        ) : (
          <BrowserVoiceField value={choice.model} lang={locale()} onChange={(model) => set({ model })} />
        )}
      </div>
      {service && (
        <details className={hint} open={!!choice.options}>
          <summary className="cursor-pointer">{t('Opções da voz (JSON)')}</summary>
          <Textarea
            aria-label={t('Opções da voz (JSON)')}
            rows={2}
            className="mt-1 font-mono text-xs"
            placeholder={OPTION_EXAMPLES[service]?.audio ?? '{}'}
            value={choice.options}
            onChange={(e) => set({ options: e.target.value })}
          />
          {!isJsonObject(choice.options) && (
            <p className="mt-1 text-destructive">{t('Não é um objeto JSON válido.')}</p>
          )}
        </details>
      )}
      <p className={hint}>
        {t(
          'O botão Ler em voz alta de cada resposta usa esta voz. As do navegador são grátis: as marcadas como naturais (no Microsoft Edge, as "Online (Natural)") soam quase como um serviço pago; as outras, instaladas no sistema, funcionam sem internet. Um serviço cobra pelo texto lido (cada trecho é gerado uma vez por sessão). Sem a chave do serviço, volta para a do navegador.',
        )}
      </p>
    </section>
  )
}

// Keys for stock video (Pexels, Pixabay), used by short videos and the stock tool.
function StockKeys(props: Props) {
  const [shown, setShown] = useState<string | null>(null)
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{t('Vídeos de banco')}</h3>
      <p className={hint}>
        {t(
          'Trechos de vídeo gratuitos para os vídeos curtos e para a pasta do projeto. As chaves são grátis; os vídeos podem ser usados sem pagar, e o TSRS anota o autor de cada um em CREDITOS.md.',
        )}
      </p>
      {STOCK_SERVICES.map((service) => {
        const id = stockKeyId(service.id)
        return (
          <div key={service.id} className="media-service space-y-2 rounded-md border p-3" data-service={id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{service.name}</span>
              <a className={`${link} ml-auto`} href={service.keyUrl} target="_blank" rel="noreferrer">
                {t('Criar chave')}
                <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                aria-label={t('Chave de {name}', { name: service.name })}
                type={shown === id ? 'text' : 'password'}
                autoComplete="off"
                disabled={props.locked}
                placeholder={props.locked ? t('Desbloqueie as chaves para ver ou alterar') : ''}
                className="pr-9 font-mono text-xs"
                value={props.settings.mediaKeys[id] ?? ''}
                onChange={(e) =>
                  props.onChange((s) => ({ ...s, mediaKeys: { ...s.mediaKeys, [id]: e.target.value.trim() } }))
                }
              />
              <EyeButton
                visible={shown === id}
                show={t('Mostrar chave')}
                hide={t('Ocultar chave')}
                disabled={props.locked}
                className="absolute top-0.5 right-0.5"
                onToggle={() => setShown(shown === id ? null : id)}
              />
            </div>
          </div>
        )
      })}
    </section>
  )
}

export default function MediaSection(props: Props) {
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
          <KeyCard key={service.id} {...props} service={service} />
        ))}
      </section>
      <section className="space-y-4">
        <h3 className="text-sm font-medium">{t('Quem gera cada tipo')}</h3>
        {MEDIA_KINDS.map((kind) => (
          <KindChoice key={kind} {...props} kind={kind} />
        ))}
        <p className={hint}>
          {t(
            'No automático, usa o primeiro com chave que tenha modelo padrão: para imagem, os provedores antes dos serviços de mídia; para vídeo e áudio, os serviços de mídia antes dos provedores. No áudio da ElevenLabs, da MiniMax e da Cartesia, o modelo é o id de uma voz (na ElevenLabs, também sound-effects ou music).',
          )}
        </p>
      </section>
      <ReaderChoice {...props} />
      <StockKeys {...props} />
    </div>
  )
}
