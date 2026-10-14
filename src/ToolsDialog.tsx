import { useState } from 'react'
import { t } from './i18n'
import { forget, listTools } from './mcp'
import type { McpServer, Provider, Settings } from './types'

interface Props {
  settings: Settings
  // Provider selected in the toolbar, which decides the web tools on offer.
  provider: Provider
  // True when the saved tokens are password-protected and not yet unlocked.
  locked: boolean
  onChange: (update: (s: Settings) => Settings) => void
  onClose: () => void
}

export default function ToolsDialog({ settings, provider, locked, onChange, onClose }: Props) {
  // Servers added while the dialog is open start expanded.
  const [fresh, setFresh] = useState<string[]>([])
  // Per-server result of the last connection test.
  const [status, setStatus] = useState<Record<string, string>>({})

  function patch(id: string, fields: Partial<McpServer>) {
    onChange((s) => ({
      ...s,
      mcpServers: s.mcpServers.map((m) => (m.id === id ? { ...m, ...fields } : m)),
    }))
  }

  async function test(server: McpServer) {
    setStatus((s) => ({ ...s, [server.id]: t('Conectando…') }))
    forget(server.id)
    try {
      const tools = await listTools(server)
      const names = tools.map((tool) => tool.name).join(', ')
      setStatus((s) => ({
        ...s,
        [server.id]: tools.length
          ? t('{count} ferramentas: {names}', { count: tools.length, names })
          : t('Conectado, mas o servidor não oferece ferramentas.'),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus((s) => ({ ...s, [server.id]: t('Falhou: {message}', { message }) }))
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('Ferramentas')}</h2>
          <button className="icon" title={t('Fechar')} onClick={onClose}>
            ×
          </button>
        </header>

        <h3>Web</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.webSearch}
            onChange={(e) => onChange((s) => ({ ...s, webSearch: e.target.checked }))}
          />
          {t('Busca na web')}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.webFetch}
            onChange={(e) => onChange((s) => ({ ...s, webFetch: e.target.checked }))}
          />
          {t('Leitura de páginas')}
        </label>
        <p className="hint">
          {t(
            'Executadas pelo próprio provedor e cobradas por ele. A busca funciona com Anthropic e OpenRouter; a leitura de páginas, só com Anthropic.',
          )}{' '}
          {provider.webTools
            ? ''
            : t('{provider}, o provedor selecionado, não oferece nenhuma das duas.', {
                provider: provider.name,
              })}
        </p>

        <h3>{t('Servidores MCP')}</h3>
        <p className="hint">
          {t(
            'Servidores remotos (HTTP) cujas ferramentas o modelo pode chamar. O servidor precisa aceitar chamadas do navegador (CORS); servidores locais por linha de comando e login por OAuth não são suportados.',
          )}
        </p>
        {settings.mcpServers.map((server) => (
          <details key={server.id} open={fresh.includes(server.id)}>
            <summary>
              {server.name || t('Sem nome')}
              {server.enabled && <span className="badge">{t('ativo')}</span>}
            </summary>
            <label>
              {t('Nome')}
              <input value={server.name} onChange={(e) => patch(server.id, { name: e.target.value })} />
            </label>
            <label>
              URL
              <input
                type="url"
                placeholder={t('https://exemplo.com/mcp')}
                value={server.url}
                onChange={(e) => patch(server.id, { url: e.target.value.trim() })}
              />
            </label>
            <label>
              {t('Token (opcional)')}
              <input
                type="password"
                autoComplete="off"
                disabled={locked}
                placeholder={locked ? t('Desbloqueie as chaves para ver ou alterar') : ''}
                value={server.token}
                onChange={(e) => patch(server.id, { token: e.target.value.trim() })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={server.enabled}
                onChange={(e) => patch(server.id, { enabled: e.target.checked })}
              />
              {t('Usar nas conversas')}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={server.autoApprove}
                onChange={(e) => patch(server.id, { autoApprove: e.target.checked })}
              />
              {t('Executar sem pedir permissão')}
            </label>
            <div className="row">
              <button disabled={!server.url} onClick={() => test(server)}>
                {t('Testar conexão')}
              </button>
              <button
                className="danger"
                onClick={() => {
                  forget(server.id)
                  onChange((s) => ({
                    ...s,
                    mcpServers: s.mcpServers.filter((m) => m.id !== server.id),
                  }))
                }}
              >
                {t('Excluir')}
              </button>
            </div>
            {status[server.id] && <p className="hint">{status[server.id]}</p>}
          </details>
        ))}
        <button
          onClick={() => {
            const id = crypto.randomUUID()
            setFresh((ids) => [...ids, id])
            onChange((s) => ({
              ...s,
              mcpServers: [
                ...s.mcpServers,
                { id, name: '', url: '', token: '', enabled: true, autoApprove: false },
              ],
            }))
          }}
        >
          {t('Novo servidor')}
        </button>
        <p className="hint">
          {t(
            'Sem a opção de executar sem permissão, cada chamada aparece na conversa e espera você permitir. O resultado de uma ferramenta é enviado ao modelo.',
          )}
        </p>
      </div>
    </div>
  )
}
