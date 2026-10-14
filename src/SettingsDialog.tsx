import { useRef, useState } from 'react'
import { LANGUAGES, t, type Language } from './i18n'
import { PROVIDERS } from './providers'
import { listModels } from './stream'
import type { Provider, ProviderSettings, Settings } from './types'

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
  onClose: () => void
}

export default function SettingsDialog(props: Props) {
  const { settings, locked, onChange, onExport, onImport, onClose } = props
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
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

  async function loadModels(provider: Provider) {
    const conn = settings.providers[provider.id]
    setStatus((s) => ({ ...s, [provider.id]: t('Carregando…') }))
    try {
      const list = await listModels({ provider, baseUrl: conn.baseUrl, apiKey: conn.apiKey })
      patch(provider.id, { models: list.ids, modelInfo: list.info })
      setStatus((s) => ({ ...s, [provider.id]: t('{count} modelos carregados.', { count: list.ids.length }) }))
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

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('Configurações')}</h2>
          <button className="icon" title={t('Fechar')} onClick={onClose}>
            ×
          </button>
        </header>

        <label>
          {t('Idioma')}
          <select
            value={settings.language}
            onChange={(e) => onChange((s) => ({ ...s, language: e.target.value as Language }))}
          >
            {LANGUAGES.map((language) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('Prompt de sistema global')}
          <textarea
            rows={3}
            placeholder={t('Opcional. Usado nas conversas sem prompt próprio.')}
            value={settings.systemPrompt}
            onChange={(e) => onChange((s) => ({ ...s, systemPrompt: e.target.value }))}
          />
        </label>

        <h3>{t('Títulos')}</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autoTitle}
            onChange={(e) => onChange((s) => ({ ...s, autoTitle: e.target.checked }))}
          />
          {t('Gerar o título da conversa automaticamente')}
        </label>
        {settings.autoTitle && (
          <label>
            {t('Modelo para títulos')}
            <input
              placeholder={t('Vazio usa o modelo da conversa. Um modelo barato do mesmo provedor serve.')}
              value={settings.titleModel}
              onChange={(e) => onChange((s) => ({ ...s, titleModel: e.target.value.trim() }))}
            />
          </label>
        )}

        <h3>{t('Provedores')}</h3>
        {PROVIDERS.map((provider) => {
          const conn = settings.providers[provider.id]
          return (
            <details key={provider.id} open={provider.id === settings.providerId}>
              <summary>
                {provider.name}
                {conn.apiKey && <span className="badge">{t('chave salva')}</span>}
                {locked && <span className="badge">{t('bloqueada')}</span>}
              </summary>
              <label>
                {provider.keyRequired ? t('Chave de API') : t('Chave de API (opcional)')}
                <input
                  type="password"
                  autoComplete="off"
                  disabled={locked}
                  placeholder={locked ? t('Desbloqueie as chaves para ver ou alterar') : ''}
                  value={conn.apiKey}
                  onChange={(e) => patch(provider.id, { apiKey: e.target.value.trim() })}
                />
              </label>
              <label>
                {t('URL base')}
                <input
                  type="url"
                  placeholder={t('https://exemplo.com/v1')}
                  value={conn.baseUrl}
                  onChange={(e) => patch(provider.id, { baseUrl: e.target.value.trim() })}
                />
              </label>
              <div className="row">
                <button onClick={() => loadModels(provider)}>{t('Carregar modelos')}</button>
                <span className="hint">
                  {status[provider.id] ?? t('{count} modelos na lista.', { count: conn.models.length })}
                </span>
              </div>
            </details>
          )
        })}

        <h3>{t('Segurança das chaves')}</h3>
        {!settings.vault && (
          <>
            <p className="hint">
              {t(
                'Sem proteção, as chaves ficam no localStorage deste navegador em texto puro. Com uma senha, elas são gravadas criptografadas e pedidas uma vez a cada abertura do app.',
              )}
            </p>
            <div className="row">
              <input
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('Senha')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('Repita a senha')}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <button
                disabled={!password || password !== confirmation}
                onClick={async () => {
                  await props.onEnableVault(password)
                  setPassword('')
                  setConfirmation('')
                }}
              >
                {t('Proteger')}
              </button>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              {t('Mostrar senha')}
            </label>
          </>
        )}
        {settings.vault && !locked && (
          <div className="row">
            <span className="hint grow">{t('Chaves protegidas por senha e desbloqueadas.')}</span>
            <button onClick={props.onLock}>{t('Bloquear agora')}</button>
            <button onClick={props.onDisableVault}>{t('Remover proteção')}</button>
          </div>
        )}
        {locked && (
          <div className="row">
            <span className="hint grow">{t('Chaves protegidas por senha e bloqueadas.')}</span>
            <button onClick={props.onUnlock}>{t('Desbloquear')}</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm(t('Apagar todas as chaves salvas e remover a senha?'))) {
                  props.onResetVault()
                }
              }}
            >
              {t('Esqueci a senha')}
            </button>
          </div>
        )}
        <p className="hint">
          {t(
            'A senha não pode ser recuperada. As chaves só são enviadas ao provedor correspondente.',
          )}
        </p>

        <h3>{t('Dados')}</h3>
        <div className="row">
          <button onClick={onExport}>{t('Exportar backup')}</button>
          <button onClick={() => importRef.current?.click()}>{t('Importar backup')}</button>
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
        </div>
        <p className="hint">
          {dataStatus ||
            t(
              'O backup contém conversas, pastas, personas e prompts. Chaves de API não são exportadas.',
            )}
        </p>
      </div>
    </div>
  )
}
