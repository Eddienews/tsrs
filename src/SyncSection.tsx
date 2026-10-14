import { useState } from 'react'
import { Cloud, FolderSync, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { SyncStatus } from './App'
import { locale, t } from './i18n'
import { bucketUrl } from './syncRemote'
import type { S3Sync, Settings, WebdavSync } from './types'

export type SyncKind = 'folder' | 'webdav' | 's3'

// A WebDAV server or a bucket to connect to.
export interface RemoteTarget {
  webdav?: WebdavSync
  s3?: S3Sync
  proxy: boolean
}

export interface SyncProps {
  // The browser can open a folder for writing.
  supported: boolean
  // What the app syncs with, if anything.
  connected: SyncKind | null
  status: SyncStatus
  onConnect: () => void
  // Tries the server and connects; resolves to the problem met, if any.
  onConnectRemote: (target: RemoteTarget) => Promise<string | undefined>
  onDisconnect: () => void
  onSyncNow: () => void
}

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  locked: boolean
  sync: SyncProps
}

const hint = 'text-xs text-muted-foreground'

// What a bucket must allow so that the app can reach it from the browser.
const CORS_RULES = `[
  {
    "AllowedOrigins": ["${location.origin}"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 600
  }
]`

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id} className="text-xs">
        {props.label}
      </Label>
      <Input
        id={props.id}
        type={props.type ?? 'text'}
        autoComplete={props.type === 'password' ? 'new-password' : 'off'}
        placeholder={props.placeholder}
        className="h-8 text-sm"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  )
}

export default function SyncSection({ settings, onChange, locked, sync }: Props) {
  // Starts on the place in use, so that disconnecting shows its form, filled in.
  const [kind, setKind] = useState<SyncKind>(
    sync.connected ?? (sync.supported ? 'folder' : 'webdav'),
  )
  const [webdav, setWebdav] = useState<WebdavSync>(
    settings.sync.webdav ?? { url: '', user: '', password: '' },
  )
  const [s3, setS3] = useState<S3Sync>(
    settings.sync.s3 ?? {
      endpoint: '',
      region: '',
      bucket: '',
      prefix: 'tsrs',
      accessKey: '',
      secretKey: '',
    },
  )
  const [proxy, setProxy] = useState(settings.sync.proxy ?? false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const state = sync.status.state

  async function connect() {
    setBusy(true)
    setProblem('')
    const target = kind === 'webdav' ? { webdav, proxy } : { s3, proxy }
    setProblem((await sync.onConnectRemote(target)) ?? '')
    setBusy(false)
  }

  const ready =
    kind === 'webdav'
      ? /^https?:\/\/./.test(webdav.url.trim())
      : !!(s3.bucket.trim() && s3.accessKey.trim() && s3.secretKey)

  const where =
    sync.connected === 'folder'
      ? t('Pasta: {name}', { name: settings.sync.folder })
      : sync.connected === 'webdav'
        ? t('WebDAV: {url}', { url: settings.sync.webdav?.url ?? '' })
        : sync.connected === 's3'
          ? t('S3: {bucket}', {
              bucket: [settings.sync.s3?.bucket, settings.sync.s3?.prefix].filter(Boolean).join('/'),
            })
          : ''

  return (
    <div className="sync space-y-4">
      <p className={hint}>
        {t(
          'Sincronize conversas, biblioteca e documentos entre dispositivos por uma pasta que um serviço como Dropbox, Google Drive, OneDrive ou Syncthing mantém igual em todos eles, por um servidor WebDAV (Nextcloud, um NAS…) ou por um bucket S3 seu. O TSRS não tem servidor: só lê e grava arquivos ali. As chaves de API e as configurações não vão junto.',
        )}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="sync-password">{t('Senha da sincronização (opcional)')}</Label>
        <Input
          id="sync-password"
          type="password"
          autoComplete="new-password"
          disabled={locked}
          value={settings.sync.password}
          onChange={(e) => onChange((s) => ({ ...s, sync: { ...s.sync, password: e.target.value } }))}
        />
        <p className={hint}>
          {t(
            'Com senha, os arquivos ficam criptografados. Use a mesma senha em todos os dispositivos; ela é definida na primeira sincronização e não pode ser trocada depois (para trocar, use outro lugar).',
          )}
        </p>
      </div>

      {sync.connected ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            {sync.connected === 'folder' ? (
              <FolderSync className="size-4 text-muted-foreground" />
            ) : (
              <Cloud className="size-4 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{where}</span>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={state === 'syncing'}
              onClick={sync.onSyncNow}
            >
              <RefreshCw className={cn('size-3.5', state === 'syncing' && 'animate-spin')} />
              {t('Sincronizar agora')}
            </Button>
            <Button size="sm" variant="ghost" onClick={sync.onDisconnect}>
              {t('Desconectar')}
            </Button>
          </div>
          <p
            role="status"
            className={cn(
              'sync-status text-xs',
              state === 'error' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {state === 'syncing'
              ? t('Sincronizando…')
              : state === 'permission'
                ? t('O navegador precisa da sua permissão para usar a pasta. Clique em Sincronizar agora.')
                : (sync.status.message ??
                  (settings.sync.lastSync
                    ? t('Última sincronização: {time}', {
                        time: new Date(settings.sync.lastSync).toLocaleString(locale()),
                      })
                    : ''))}
          </p>
        </>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label={t('Sincronizar por')}
            value={kind}
            onValueChange={(value) => {
              if (!value) return
              setKind(value as SyncKind)
              setProblem('')
            }}
          >
            <ToggleGroupItem value="folder">{t('Pasta')}</ToggleGroupItem>
            <ToggleGroupItem value="webdav">WebDAV</ToggleGroupItem>
            <ToggleGroupItem value="s3">S3</ToggleGroupItem>
          </ToggleGroup>

          {kind === 'folder' &&
            (sync.supported ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                  {t('Nenhuma pasta escolhida.')}
                </span>
                <Button size="sm" onClick={sync.onConnect}>
                  {t('Escolher pasta')}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-warning">
                {t('Este navegador não deixa sites gravarem numa pasta. Use o Chrome, o Edge ou outro navegador baseado no Chromium, ou sincronize por WebDAV ou S3.')}
              </p>
            ))}

          {kind === 'webdav' && (
            <div className="space-y-2">
              <Field
                id="webdav-url"
                label={t('Endereço da pasta')}
                placeholder="https://nuvem.exemplo.com/remote.php/dav/files/voce/TSRS/"
                value={webdav.url}
                onChange={(url) => setWebdav({ ...webdav, url })}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Field
                  id="webdav-user"
                  label={t('Usuário')}
                  value={webdav.user}
                  onChange={(user) => setWebdav({ ...webdav, user })}
                />
                <Field
                  id="webdav-password"
                  label={t('Senha ou senha de app')}
                  type="password"
                  value={webdav.password}
                  onChange={(password) => setWebdav({ ...webdav, password })}
                />
              </div>
              <p className={hint}>
                {t(
                  'A pasta é criada se não existir. O servidor precisa aceitar chamadas deste endereço (CORS); o Nextcloud e muitos outros não aceitam, e então é preciso o proxy local.',
                )}
              </p>
            </div>
          )}

          {kind === 's3' && (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field
                  id="s3-endpoint"
                  label={t('Endpoint (vazio para a AWS)')}
                  placeholder="https://<conta>.r2.cloudflarestorage.com"
                  value={s3.endpoint}
                  onChange={(endpoint) => setS3({ ...s3, endpoint })}
                />
                <Field
                  id="s3-region"
                  label={t('Região')}
                  placeholder="us-east-1"
                  value={s3.region}
                  onChange={(region) => setS3({ ...s3, region })}
                />
                <Field
                  id="s3-bucket"
                  label={t('Bucket')}
                  value={s3.bucket}
                  onChange={(bucket) => setS3({ ...s3, bucket })}
                />
                <Field
                  id="s3-prefix"
                  label={t('Pasta no bucket')}
                  value={s3.prefix}
                  onChange={(prefix) => setS3({ ...s3, prefix })}
                />
                <Field
                  id="s3-access"
                  label={t('Access key')}
                  value={s3.accessKey}
                  onChange={(accessKey) => setS3({ ...s3, accessKey })}
                />
                <Field
                  id="s3-secret"
                  label={t('Secret key')}
                  type="password"
                  value={s3.secretKey}
                  onChange={(secretKey) => setS3({ ...s3, secretKey })}
                />
              </div>
              <details className={hint}>
                <summary className="cursor-pointer">
                  {t('O bucket precisa aceitar chamadas deste endereço (CORS). Regras para copiar:')}
                </summary>
                <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2 font-mono text-[11px]">
                  {CORS_RULES}
                </pre>
              </details>
              <p className={hint}>
                {t('Use uma chave que só acesse este bucket. No Cloudflare R2, a região é auto.')}
              </p>
            </div>
          )}

          {kind !== 'folder' && (
            <>
              <label className="flex items-center justify-between gap-4 text-sm">
                {t('Passar pelo proxy local')}
                <Switch
                  aria-label={t('Passar pelo proxy local')}
                  checked={proxy}
                  onCheckedChange={setProxy}
                />
              </label>
              {proxy && (
                <p className={hint}>
                  {t('Inicie o proxy permitindo o servidor: npm run proxy -- --allow {host}', {
                    host: hostOf(kind === 'webdav' ? webdav.url : bucketUrl(s3)) || 'servidor.exemplo.com',
                  })}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" className="gap-1.5" disabled={!ready || busy || locked} onClick={connect}>
                  {busy && <Loader2 className="size-3.5 animate-spin" />}
                  {busy ? t('Conectando…') : t('Conectar')}
                </Button>
              </div>
              {problem && (
                <p role="alert" className="text-xs text-destructive">
                  {problem}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <p className={hint}>
        {t(
          'Sincroniza ao abrir o app, alguns segundos depois de cada mudança e a cada dois minutos. Vale a mudança mais recente de cada conversa e de cada item da biblioteca.',
        )}
      </p>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname
  } catch {
    return ''
  }
}
