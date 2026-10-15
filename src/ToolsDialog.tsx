import { useState } from 'react'
import { ChevronDown, ChevronRight, FileDown, Globe, Plus } from 'lucide-react'
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
import { t } from './i18n'
import { forget, listTools } from './mcp'
import type { McpServer, Provider, Settings } from './types'
import { SEARCH_SERVICES, searchKeyId } from './webSearch'

interface Props {
  settings: Settings
  // Provider selected in the toolbar, which decides the web tools on offer.
  provider: Provider
  // True when the saved tokens are password-protected and not yet unlocked.
  locked: boolean
  onChange: (update: (s: Settings) => Settings) => void
  onClose: () => void
}

const hint = 'text-xs text-muted-foreground'

export default function ToolsDialog({ settings, provider, locked, onChange, onClose }: Props) {
  // Servers added while the dialog is open start expanded.
  const [fresh, setFresh] = useState<string[]>([])
  // Servers whose card was toggled by hand, which overrides the initial state.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
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

  function addServer() {
    const id = crypto.randomUUID()
    setFresh((ids) => [...ids, id])
    onChange((s) => ({
      ...s,
      mcpServers: [
        ...s.mcpServers,
        { id, name: '', url: '', token: '', enabled: true, autoApprove: false },
      ],
    }))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Ferramentas')}</DialogTitle>
          <DialogDescription>{t('O que o modelo pode usar.')}</DialogDescription>
        </DialogHeader>

        <h3 className="text-sm font-medium">Web</h3>
        <div className="divide-y rounded-md border">
          <label className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <Globe className="size-4 text-muted-foreground" />
            <span className="flex-1">{t('Busca na web')}</span>
            <Switch
              aria-label={t('Busca na web')}
              checked={settings.webSearch}
              onCheckedChange={(webSearch) => onChange((s) => ({ ...s, webSearch }))}
            />
          </label>
          <label className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <FileDown className="size-4 text-muted-foreground" />
            <span className="flex-1">{t('Leitura de páginas')}</span>
            <Switch
              aria-label={t('Leitura de páginas')}
              checked={settings.webFetch}
              onCheckedChange={(webFetch) => onChange((s) => ({ ...s, webFetch }))}
            />
          </label>
        </div>
        <p className={hint}>
          {t(
            'Executadas pelo próprio provedor e cobradas por ele. A busca funciona com Anthropic e OpenRouter; a leitura de páginas, só com Anthropic.',
          )}{' '}
          {provider.webTools
            ? ''
            : t('{provider}, o provedor selecionado, não oferece nenhuma das duas.', {
                provider: provider.name,
              })}
        </p>

        <OwnSearch settings={settings} locked={locked} onChange={onChange} />

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-sm font-medium">{t('Servidores MCP')}</h3>
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={addServer}>
            <Plus className="size-3.5" />
            {t('Novo servidor')}
          </Button>
        </div>
        <p className={hint}>
          {t(
            'Servidores remotos (HTTP) cujas ferramentas o modelo pode chamar. O servidor precisa aceitar chamadas do navegador (CORS); servidores locais por linha de comando e login por OAuth não são suportados.',
          )}
        </p>
        {settings.mcpServers.map((server) => {
          const expanded = toggled[server.id] ?? fresh.includes(server.id)
          return (
            <div key={server.id} data-server={server.id} className="rounded-md border">
              {/* The whole row toggles; the chevron button carries the state for keyboards. */}
              <div
                className="flex cursor-pointer items-center gap-2 px-3 py-2"
                onClick={() => setToggled((s) => ({ ...s, [server.id]: !expanded }))}
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {server.name || t('Sem nome')}
                </span>
                {server.enabled && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <span className="size-1.5 rounded-full bg-success" />
                    {t('ativo')}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-7"
                  aria-expanded={expanded}
                  aria-label={expanded ? t('Ocultar detalhes') : t('Mostrar detalhes')}
                >
                  {expanded ? <ChevronDown /> : <ChevronRight />}
                </Button>
              </div>
              {expanded && (
                <div className="space-y-3 border-t p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`name-${server.id}`}>{t('Nome')}</Label>
                    <Input
                      id={`name-${server.id}`}
                      value={server.name}
                      onChange={(e) => patch(server.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`url-${server.id}`}>URL</Label>
                    <Input
                      id={`url-${server.id}`}
                      type="url"
                      placeholder={t('https://exemplo.com/mcp')}
                      className="font-mono text-xs"
                      value={server.url}
                      onChange={(e) => patch(server.id, { url: e.target.value.trim() })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`token-${server.id}`}>{t('Token (opcional)')}</Label>
                    <Input
                      id={`token-${server.id}`}
                      type="password"
                      autoComplete="off"
                      disabled={locked}
                      placeholder={locked ? t('Desbloqueie as chaves para ver ou alterar') : ''}
                      className="font-mono text-xs"
                      value={server.token}
                      onChange={(e) => patch(server.id, { token: e.target.value.trim() })}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    {t('Usar nas conversas')}
                    <Switch
                      aria-label={t('Usar nas conversas')}
                      checked={server.enabled}
                      onCheckedChange={(enabled) => patch(server.id, { enabled })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    {t('Executar sem pedir permissão')}
                    <Switch
                      aria-label={t('Executar sem pedir permissão')}
                      checked={server.autoApprove}
                      onCheckedChange={(autoApprove) => patch(server.id, { autoApprove })}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!server.url}
                      onClick={() => test(server)}
                    >
                      {t('Testar conexão')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        forget(server.id)
                        onChange((s) => ({
                          ...s,
                          mcpServers: s.mcpServers.filter((m) => m.id !== server.id),
                        }))
                      }}
                    >
                      {t('Excluir')}
                    </Button>
                  </div>
                  {status[server.id] && <p className={hint}>{status[server.id]}</p>}
                </div>
              )}
            </div>
          )
        })}
        <p className={hint}>
          {t(
            'Sem a opção de executar sem permissão, cada chamada aparece na conversa e espera você permitir. O resultado de uma ferramenta é enviado ao modelo.',
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}

// Search with the user's own key: any model can search and read pages.
function OwnSearch({ settings, locked, onChange }: Pick<Props, 'settings' | 'locked' | 'onChange'>) {
  const chosen = settings.ownSearch?.provider ?? 'off'
  const service = SEARCH_SERVICES.find((x) => x.id === chosen)
  const key = settings.mediaKeys[searchKeyId(chosen)] ?? ''
  const set = (fields: Partial<NonNullable<Settings['ownSearch']>>) =>
    onChange((s) => ({ ...s, ownSearch: { provider: 'off', ...s.ownSearch, ...fields } }))
  return (
    <section className="own-search space-y-2 rounded-md border p-3">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex-1 font-medium">{t('Busca própria (qualquer modelo)')}</span>
        <select
          aria-label={t('Serviço de busca')}
          className="select-native"
          value={chosen}
          onChange={(e) => set({ provider: e.target.value })}
        >
          <option value="off">{t('Desligada')}</option>
          {SEARCH_SERVICES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {service && (
        <>
          <Input
            aria-label={t('Chave de {name}', { name: service.name })}
            type="password"
            autoComplete="off"
            disabled={locked}
            placeholder={locked ? t('Desbloqueie as chaves para ver ou alterar') : t('Chave de API')}
            className="font-mono text-xs"
            value={key}
            onChange={(e) =>
              onChange((s) => ({ ...s, mediaKeys: { ...s.mediaKeys, [searchKeyId(service.id)]: e.target.value.trim() } }))
            }
          />
          {service.id === 'google' && (
            <Input
              aria-label={t('ID do mecanismo de busca (cx)')}
              placeholder={t('ID do mecanismo de busca (cx)')}
              className="font-mono text-xs"
              value={settings.ownSearch?.googleCx ?? ''}
              onChange={(e) => set({ googleCx: e.target.value.trim() })}
            />
          )}
          <a className="text-xs text-primary underline-offset-2 hover:underline" href={service.keyUrl} target="_blank" rel="noreferrer">
            {t('Criar chave')}
          </a>
        </>
      )}
      <p className={hint}>
        {t(
          'Com uma chave sua, qualquer modelo busca na web e lê páginas (ferramentas search_web e read_page), no lugar da busca do provedor, quando a Busca na web está ligada. As fontes aparecem abaixo da resposta. O servidor do TSRS (npm run dev) faz as chamadas; páginas da rede local não são lidas.',
        )}
      </p>
    </section>
  )
}
