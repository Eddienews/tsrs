import { useRef, useState } from 'react'
import { Download, Eye, EyeOff, FolderSync, Lock, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { LANGUAGES, locale, t, type Language } from './i18n'
import { connection, PROVIDERS, usesProxy } from './providers'
import { listModels } from './stream'
import type { SyncStatus } from './App'
import type { Appearance, Provider, ProviderSettings, Settings } from './types'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  // True when the API keys are password-protected and not yet unlocked.
  locked: boolean
  onEnableVault: (password: string) => Promise<void>
  onDisableVault: () => void
  onLock: () => void
  onUnlock: () => void
  onResetVault: () => void
  onExport: () => void
  // Resolves to a summary line to show the user; rejects with a readable error.
  onImport: (file: File) => Promise<string>
  // Asks for confirmation, then removes everything stored by the app.
  onDeleteEverything: () => void
  sync: {
    // The browser can open a folder for writing.
    supported: boolean
    connected: boolean
    status: SyncStatus
    onConnect: () => void
    onDisconnect: () => void
    onSyncNow: () => void
  }
  onClose: () => void
}

type Section = 'providers' | 'general' | 'appearance' | 'security' | 'sync' | 'data' | 'shortcuts'

const SECTIONS: Section[] = [
  'providers',
  'general',
  'appearance',
  'security',
  'sync',
  'data',
  'shortcuts',
]

// Looked up at render time so the names follow the language being switched in this dialog.
function sectionName(section: Section): string {
  switch (section) {
    case 'providers':
      return t('Provedores')
    case 'general':
      return t('Geral')
    case 'appearance':
      return t('Aparência')
    case 'security':
      return t('Segurança')
    case 'sync':
      return t('Sincronização')
    case 'data':
      return t('Dados')
    case 'shortcuts':
      return t('Atalhos')
  }
}

const hint = 'text-xs text-muted-foreground'
const badge = 'rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground'

function Choice<T extends string>(props: {
  label: string
  value: T
  options: { id: T; name: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{props.label}</div>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={props.label}
        className="flex-wrap justify-start"
        value={props.value}
        // Radix reports '' when the active item is clicked again; a choice is always required.
        onValueChange={(value) => value && props.onChange(value as T)}
      >
        {props.options.map((option) => (
          <ToggleGroupItem key={option.id} value={option.id} className="px-4">
            {option.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function EyeButton(props: {
  visible: boolean
  show: string
  hide: string
  disabled?: boolean
  className?: string
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-8', props.className)}
      disabled={props.disabled}
      aria-label={props.visible ? props.hide : props.show}
      onClick={props.onToggle}
    >
      {props.visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
    </Button>
  )
}

export default function SettingsDialog(props: Props) {
  const { settings, locked, onChange, onExport, onImport, onClose } = props
  const [section, setSection] = useState<Section>('providers')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  // Providers whose API key is currently shown in clear text.
  const [shownKeys, setShownKeys] = useState<string[]>([])
  // Per-provider status line for the "load models" action.
  const [status, setStatus] = useState<Record<string, string>>({})
  const [dataStatus, setDataStatus] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  function patch(id: string, fields: Partial<ProviderSettings>) {
    onChange((s) => ({
      ...s,
      providers: { ...s.providers, [id]: { ...s.providers[id], ...fields } },
    }))
  }

  function setAppearance(fields: Partial<Appearance>) {
    onChange((s) => ({ ...s, appearance: { ...s.appearance, ...fields } }))
  }

  async function loadModels(provider: Provider) {
    setStatus((s) => ({ ...s, [provider.id]: t('Carregando…') }))
    try {
      const list = await listModels(connection(settings, provider.id))
      patch(provider.id, { models: list.ids, modelInfo: list.info })
      setStatus((s) => ({
        ...s,
        [provider.id]: t('{count} modelos carregados.', { count: list.ids.length }),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus((s) => ({ ...s, [provider.id]: t('Falhou: {message}', { message }) }))
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      setDataStatus(await onImport(file))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setDataStatus(t('Falhou: {message}', { message }))
    }
  }

  const shortcuts: [string, string][] = [
    ['Ctrl/⌘+K', t('Paleta de comandos')],
    ['Ctrl/⌘+.', t('Abrir ou fechar o preview')],
    ['Alt+N', t('Nova conversa')],
    ['Enter', t('Enviar mensagem')],
    ['Shift+Enter', t('Quebrar a linha')],
  ]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog flex h-[85vh] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>{t('Configurações')}</DialogTitle>
          <DialogDescription>{t('Guardadas apenas neste navegador.')}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label={t('Seções')}
            className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:border-r sm:border-b-0"
          >
            {SECTIONS.map((id) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
                className={cn(
                  'shrink-0 cursor-pointer rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent',
                  section === id && 'bg-accent font-medium',
                )}
              >
                {sectionName(id)}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-5">
            {section === 'providers' && (
              <div className="proxy space-y-1.5 rounded-md border border-dashed p-3">
                <Label htmlFor="proxy-url">{t('Proxy local')}</Label>
                <Input
                  id="proxy-url"
                  type="url"
                  className="font-mono text-xs"
                  value={settings.proxyUrl}
                  onChange={(e) => onChange((s) => ({ ...s, proxyUrl: e.target.value.trim() }))}
                />
                <p className={hint}>
                  {t(
                    'Alguns provedores (como o OpenCode) não aceitam chamadas do navegador. Rode npm run proxy na pasta do TSRS e ligue o proxy no provedor; para outros endereços, inicie com --allow host.',
                  )}
                </p>
              </div>
            )}
            {section === 'providers' &&
              PROVIDERS.map((provider) => {
                const conn = settings.providers[provider.id]
                const shown = shownKeys.includes(provider.id)
                return (
                  <div
                    key={provider.id}
                    data-provider={provider.id}
                    className="space-y-3 rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{provider.name}</span>
                      {conn.apiKey && <span className={badge}>{t('chave salva')}</span>}
                      {locked && <span className={badge}>{t('bloqueada')}</span>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`key-${provider.id}`}>
                        {provider.keyRequired ? t('Chave de API') : t('Chave de API (opcional)')}
                      </Label>
                      <div className="relative">
                        <Input
                          id={`key-${provider.id}`}
                          type={shown ? 'text' : 'password'}
                          autoComplete="off"
                          disabled={locked}
                          placeholder={locked ? t('Desbloqueie as chaves para ver ou alterar') : ''}
                          className="pr-9 font-mono text-xs"
                          value={conn.apiKey}
                          onChange={(e) => patch(provider.id, { apiKey: e.target.value.trim() })}
                        />
                        <EyeButton
                          visible={shown}
                          show={t('Mostrar chave')}
                          hide={t('Ocultar chave')}
                          disabled={locked}
                          className="absolute top-0.5 right-0.5"
                          onToggle={() =>
                            setShownKeys((ids) =>
                              shown ? ids.filter((id) => id !== provider.id) : [...ids, provider.id],
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`url-${provider.id}`}>{t('URL base')}</Label>
                      <Input
                        id={`url-${provider.id}`}
                        type="url"
                        placeholder={t('https://exemplo.com/v1')}
                        className="font-mono text-xs"
                        value={conn.baseUrl}
                        onChange={(e) => patch(provider.id, { baseUrl: e.target.value.trim() })}
                      />
                    </div>
                    {(provider.needsProxy || !provider.keyRequired || provider.id === 'custom') && (
                      <label className="flex items-center justify-between gap-4 text-sm">
                        {t('Usar o proxy local')}
                        <Switch
                          aria-label={t('Usar o proxy local')}
                          checked={usesProxy(settings, provider)}
                          onCheckedChange={(proxy) => patch(provider.id, { proxy })}
                        />
                      </label>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => loadModels(provider)}
                      >
                        <RefreshCw className="size-3.5" />
                        {t('Carregar modelos')}
                      </Button>
                      <span className={hint}>
                        {status[provider.id] ??
                          t('{count} modelos na lista.', { count: conn.models.length })}
                      </span>
                    </div>
                  </div>
                )
              })}

            {section === 'sync' && (
              <div className="sync space-y-4">
                <p className={hint}>
                  {t(
                    'Sincronize conversas, biblioteca e documentos entre dispositivos por uma pasta que um serviço como Dropbox, Google Drive, OneDrive ou Syncthing mantém igual em todos eles. O TSRS não tem servidor: só lê e grava arquivos nessa pasta. As chaves de API e as configurações não vão para a pasta.',
                  )}
                </p>
                {!props.sync.supported ? (
                  <p className="rounded-md border border-warning/50 px-3 py-2 text-xs text-warning">
                    {t('Este navegador não deixa sites gravarem numa pasta. Use o Chrome, o Edge ou outro navegador baseado no Chromium.')}
                  </p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="sync-password">{t('Senha da sincronização (opcional)')}</Label>
                      <Input
                        id="sync-password"
                        type="password"
                        autoComplete="new-password"
                        disabled={locked}
                        value={settings.sync.password}
                        onChange={(e) =>
                          onChange((s) => ({ ...s, sync: { ...s.sync, password: e.target.value } }))
                        }
                      />
                      <p className={hint}>
                        {t(
                          'Com senha, os arquivos da pasta ficam criptografados. Use a mesma senha em todos os dispositivos; ela é definida na primeira sincronização da pasta e não pode ser trocada depois (para trocar, use outra pasta).',
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                      <FolderSync className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {props.sync.connected
                          ? t('Pasta: {name}', { name: settings.sync.folder })
                          : t('Nenhuma pasta escolhida.')}
                      </span>
                      {props.sync.connected ? (
                        <>
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={props.sync.status.state === 'syncing'}
                            onClick={props.sync.onSyncNow}
                          >
                            <RefreshCw
                              className={cn(
                                'size-3.5',
                                props.sync.status.state === 'syncing' && 'animate-spin',
                              )}
                            />
                            {t('Sincronizar agora')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={props.sync.onDisconnect}>
                            {t('Desconectar')}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={props.sync.onConnect}>
                          {t('Escolher pasta')}
                        </Button>
                      )}
                    </div>
                    {props.sync.connected && (
                      <p
                        role="status"
                        className={cn(
                          'sync-status text-xs',
                          props.sync.status.state === 'error' ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {props.sync.status.state === 'syncing'
                          ? t('Sincronizando…')
                          : props.sync.status.state === 'permission'
                            ? t('O navegador precisa da sua permissão para usar a pasta. Clique em Sincronizar agora.')
                            : props.sync.status.message ??
                              (settings.sync.lastSync
                                ? t('Última sincronização: {time}', {
                                    time: new Date(settings.sync.lastSync).toLocaleString(locale()),
                                  })
                                : '')}
                      </p>
                    )}
                    <p className={hint}>
                      {t(
                        'Sincroniza ao abrir o app, alguns segundos depois de cada mudança e a cada dois minutos. Vale a mudança mais recente de cada conversa; a biblioteca é sincronizada inteira, então edite-a num dispositivo de cada vez.',
                      )}
                    </p>
                  </>
                )}
              </div>
            )}

            {section === 'general' && (
              <div className="space-y-5">
                <Choice<Language>
                  label={t('Idioma')}
                  value={settings.language}
                  options={LANGUAGES}
                  onChange={(language) => onChange((s) => ({ ...s, language }))}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="global-system">{t('Prompt de sistema global')}</Label>
                  <Textarea
                    id="global-system"
                    rows={4}
                    className="font-mono text-xs"
                    placeholder={t('Opcional. Usado nas conversas sem prompt próprio.')}
                    value={settings.systemPrompt}
                    onChange={(e) => onChange((s) => ({ ...s, systemPrompt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                    {t('Cache de prompt (Anthropic)')}
                    <Switch
                      aria-label={t('Cache de prompt (Anthropic)')}
                      checked={settings.promptCache}
                      onCheckedChange={(promptCache) => onChange((s) => ({ ...s, promptCache }))}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'A Anthropic guarda a conversa por alguns minutos e cobra cerca de 10% do preço pela parte já enviada. A gravação no cache custa 25% a mais, então só não compensa em conversas de uma pergunta.',
                    )}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                    {t('Mostrar o raciocínio do modelo')}
                    <Switch
                      aria-label={t('Mostrar o raciocínio do modelo')}
                      checked={settings.showThinking}
                      onCheckedChange={(showThinking) => onChange((s) => ({ ...s, showThinking }))}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Aparece recolhido acima da resposta, quando o provedor envia. Nos modelos Claude 4.6 ou mais novos, pede um resumo do raciocínio, sem custo extra.',
                    )}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dictation">{t('Ditado')}</Label>
                  <select
                    id="dictation"
                    className="select-native w-full"
                    value={settings.dictation}
                    onChange={(e) => onChange((s) => ({ ...s, dictation: e.target.value }))}
                  >
                    <option value="auto">{t('Automático')}</option>
                    <option value="browser">{t('Reconhecimento do navegador')}</option>
                    {PROVIDERS.filter((p) => p.transcription).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'O áudio vai para o provedor escolhido, que cobra pela transcrição. No automático, usa a OpenAI ou o Groq se houver chave e, senão, o navegador (no Chrome, o áudio vai para o Google).',
                    )}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="image-provider">{t('Geração de imagens')}</Label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      id="image-provider"
                      className="select-native"
                      value={settings.imageProvider}
                      onChange={(e) =>
                        onChange((s) => ({ ...s, imageProvider: e.target.value, imageModel: '' }))
                      }
                    >
                      <option value="auto">{t('Automático')}</option>
                      {PROVIDERS.filter((p) => p.image).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {settings.imageProvider !== 'auto' && (
                      <Input
                        aria-label={t('Modelo de imagem')}
                        className="h-9 min-w-40 flex-1 font-mono text-xs"
                        placeholder={PROVIDERS.find((p) => p.id === settings.imageProvider)?.image}
                        value={settings.imageModel}
                        onChange={(e) =>
                          onChange((s) => ({ ...s, imageModel: e.target.value.trim() }))
                        }
                      />
                    )}
                  </div>
                  <p className={hint}>
                    {t(
                      'O botão Imagem, ao lado de Prompts, transforma a próxima mensagem num pedido de imagem. No automático, usa a OpenAI ou o Gemini, o que tiver chave. O custo da imagem não entra na conta da conversa.',
                    )}
                  </p>
                </div>
                <label className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                  {t('Abrir o preview sozinho quando a resposta trouxer uma página, imagem SVG, componente React ou diagrama')}
                  <Switch
                    aria-label={t('Abrir o preview sozinho')}
                    checked={settings.autoPreview}
                    onCheckedChange={(autoPreview) => onChange((s) => ({ ...s, autoPreview }))}
                  />
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                    {t('Avisar o modelo sobre o preview')}
                    <Switch
                      aria-label={t('Avisar o modelo sobre o preview')}
                      checked={settings.previewHint}
                      onCheckedChange={(previewHint) => onChange((s) => ({ ...s, previewHint }))}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Acrescenta ao prompt de sistema uma nota dizendo que blocos de código HTML, SVG, JavaScript e Markdown podem ser abertos no preview.',
                    )}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">{t('Títulos')}</h3>
                  <label className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                    {t('Gerar o título da conversa automaticamente')}
                    <Switch
                      aria-label={t('Gerar o título da conversa automaticamente')}
                      checked={settings.autoTitle}
                      onCheckedChange={(autoTitle) => onChange((s) => ({ ...s, autoTitle }))}
                    />
                  </label>
                  {settings.autoTitle && (
                    <div className="space-y-1.5">
                      <Label htmlFor="title-model">{t('Modelo para títulos')}</Label>
                      <Input
                        id="title-model"
                        className="font-mono text-xs"
                        placeholder={t(
                          'Vazio usa o modelo da conversa. Um modelo barato do mesmo provedor serve.',
                        )}
                        value={settings.titleModel}
                        onChange={(e) =>
                          onChange((s) => ({ ...s, titleModel: e.target.value.trim() }))
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {section === 'appearance' && (
              <div className="space-y-5">
                <Choice<Appearance['theme']>
                  label={t('Tema')}
                  value={settings.appearance.theme}
                  options={[
                    { id: 'light', name: t('Claro') },
                    { id: 'dark', name: t('Escuro') },
                  ]}
                  onChange={(theme) => setAppearance({ theme })}
                />
                <Choice<Appearance['accent']>
                  label={t('Cor de destaque')}
                  value={settings.appearance.accent}
                  options={[
                    { id: 'signal', name: t('Âmbar') },
                    { id: 'green', name: t('Verde') },
                    { id: 'blue', name: t('Azul') },
                    { id: 'red', name: t('Vermelho') },
                  ]}
                  onChange={(accent) => setAppearance({ accent })}
                />
                <Choice<Appearance['font']>
                  label={t('Tamanho da fonte')}
                  value={settings.appearance.font}
                  options={[
                    { id: 'sm', name: t('Pequena') },
                    { id: 'md', name: t('Média') },
                    { id: 'lg', name: t('Grande') },
                  ]}
                  onChange={(font) => setAppearance({ font })}
                />
                <Choice<Appearance['density']>
                  label={t('Densidade')}
                  value={settings.appearance.density}
                  options={[
                    { id: 'compact', name: t('Compacta') },
                    { id: 'comfortable', name: t('Confortável') },
                  ]}
                  onChange={(density) => setAppearance({ density })}
                />
              </div>
            )}

            {section === 'security' && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">{t('Segurança das chaves')}</h3>
                {!settings.vault && (
                  <>
                    <p className={hint}>
                      {t(
                        'Sem proteção, as chaves ficam no localStorage deste navegador em texto puro. Com uma senha, elas são gravadas criptografadas e pedidas uma vez a cada abertura do app.',
                      )}
                    </p>
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type={visible ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder={t('Senha')}
                          aria-label={t('Senha')}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <EyeButton
                          visible={visible}
                          show={t('Mostrar senha')}
                          hide={t('Ocultar senha')}
                          className="shrink-0"
                          onToggle={() => setVisible(!visible)}
                        />
                      </div>
                      <Input
                        type={visible ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder={t('Repita a senha')}
                        aria-label={t('Repita a senha')}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={!password || password !== confirmation}
                        onClick={async () => {
                          await props.onEnableVault(password)
                          setPassword('')
                          setConfirmation('')
                        }}
                      >
                        <Lock className="size-3.5" />
                        {t('Proteger')}
                      </Button>
                    </div>
                  </>
                )}
                {settings.vault && !locked && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <span className={cn(hint, 'min-w-40 flex-1')}>
                      {t('Chaves protegidas por senha e desbloqueadas.')}
                    </span>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={props.onLock}>
                      <Lock className="size-3.5" />
                      {t('Bloquear agora')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={props.onDisableVault}>
                      {t('Remover proteção')}
                    </Button>
                  </div>
                )}
                {locked && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <span className={cn(hint, 'min-w-40 flex-1')}>
                      {t('Chaves protegidas por senha e bloqueadas.')}
                    </span>
                    <Button variant="outline" size="sm" onClick={props.onUnlock}>
                      {t('Desbloquear')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(t('Apagar todas as chaves salvas e remover a senha?'))) {
                          props.onResetVault()
                        }
                      }}
                    >
                      {t('Esqueci a senha')}
                    </Button>
                  </div>
                )}
                <p className={hint}>
                  {t(
                    'A senha não pode ser recuperada. As chaves só são enviadas ao provedor correspondente.',
                  )}
                </p>
              </div>
            )}

            {section === 'data' && (
              <div className="space-y-3">
                <Button variant="outline" className="w-full justify-start gap-2" onClick={onExport}>
                  <Download className="size-4" />
                  {t('Exportar backup')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload className="size-4" />
                  {t('Importar backup')}
                </Button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    importFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <p className={hint}>
                  {dataStatus ||
                    t(
                      'O backup contém conversas, pastas, personas e prompts. Chaves de API não são exportadas.',
                    )}
                </p>
                <div className="rounded-md border border-destructive/40 p-3">
                  <h3 className="text-sm font-medium text-destructive">{t('Apagar tudo')}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(
                      'Remove deste navegador todas as conversas, chaves de API e configurações. Não pode ser desfeito; exporte um backup antes se quiser guardar as conversas.',
                    )}
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={props.onDeleteEverything}
                  >
                    <Trash2 className="size-3.5" />
                    {t('Apagar tudo')}
                  </Button>
                </div>
              </div>
            )}

            {section === 'shortcuts' && (
              <table className="w-full text-sm">
                <tbody>
                  {shortcuts.map(([keys, action]) => (
                    <tr key={keys} className="border-b">
                      <td className="py-2">{action}</td>
                      <td className="py-2 text-right">
                        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {keys}
                        </kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
