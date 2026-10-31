import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cliStatus, type CliStatus } from './cliAgents'
import { t } from './i18n'
import type { CliAccess, Provider, ProviderSettings } from './types'

const hint = 'text-xs text-muted-foreground'

// What a coding agent may do in the conversation's project folder.
export function accessOptions(): { id: CliAccess; name: string; note: string }[] {
  return [
    { id: 'read', name: t('Só ler'), note: t('Lê os arquivos e responde; não muda nada.') },
    { id: 'edit', name: t('Editar arquivos'), note: t('Cria e muda arquivos na pasta do projeto; não roda comandos sem perguntar.') },
    {
      id: 'full',
      name: t('Acesso total'),
      note: t('Roda qualquer comando, sem perguntar. Use só em pastas e projetos em que você confia.'),
    },
    {
      id: 'studio',
      name: t('Só o estúdio'),
      note: t('Para bots: usa só os comandos do TSRS (takes, filmes, quadro), mexe só nos arquivos da pasta, não roda comandos, não vê suas chaves e para em 2 horas.'),
    },
  ]
}

export function statusText(status: CliStatus): string {
  if (!status.ok) return status.error ?? t('Não encontrado.')
  const used = status.limit?.used
  return used === undefined
    ? t('Encontrado: {version}', { version: status.version ?? '' })
    : t('Encontrado: {version} · {used}% do limite de uso', {
        version: status.version ?? '',
        used: Math.round(used * 100),
      })
}

// The settings of a coding agent: its command, what it may do, and a check
// that the command answers. It needs no key: it uses its own login.
export default function CliProviderFields(props: {
  provider: Provider
  conn: ProviderSettings
  onPatch: (patch: Partial<ProviderSettings>) => void
}) {
  const { provider, conn, onPatch } = props
  const [status, setStatus] = useState('')
  const [checking, setChecking] = useState(false)
  const access = conn.cliAccess ?? 'edit'
  const options = accessOptions()

  async function check() {
    if (!provider.cli) return
    setChecking(true)
    try {
      setStatus(statusText(await cliStatus(provider.cli, conn.baseUrl)))
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <p className={hint}>
        {t(
          'Usa o agente instalado neste computador, com o login e o plano dele, na pasta de projeto da conversa. Precisa do TSRS servido por npm run dev.',
        )}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`url-${provider.id}`}>{t('Comando')}</Label>
        <Input
          id={`url-${provider.id}`}
          placeholder={provider.baseUrl}
          className="font-mono text-xs"
          value={conn.baseUrl}
          onChange={(e) => onPatch({ baseUrl: e.target.value.trim() })}
        />
        <p className={hint}>{t('O nome do comando ou o caminho completo dele.')}</p>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">{t('O que o agente pode fazer')}</div>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={t('O que o agente pode fazer')}
          className="flex-wrap justify-start"
          value={access}
          onValueChange={(value) => value && onPatch({ cliAccess: value as CliAccess })}
        >
          {options.map((option) => (
            <ToggleGroupItem key={option.id} value={option.id} className="px-3">
              {option.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className={hint}>{options.find((o) => o.id === access)?.note}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" disabled={checking} onClick={check}>
          <RefreshCw className="size-3.5" />
          {t('Verificar')}
        </Button>
        <span className={hint} role="status">
          {status}
        </span>
      </div>
    </>
  )
}
