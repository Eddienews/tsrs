import { Check, ChevronRight, FileDown, Globe, Loader2, Plug, ShieldQuestion, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { t } from './i18n'
import type { ToolPart } from './types'

const PROVIDER_ICONS: Record<string, typeof Globe> = { web_search: Globe, web_fetch: FileDown }

interface Props {
  part: ToolPart
  // Answers a call that is waiting for permission.
  onApprove: (callId: string, allowed: boolean) => void
}

export default function ToolCallBlock({ part, onApprove }: Props) {
  const waiting = part.status === 'approval'
  const failed = part.status === 'done' && !!part.error
  // Until the user toggles it, a call that needs attention stays open.
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? (waiting || failed)
  const Icon = (part.provider && PROVIDER_ICONS[part.name]) || Plug
  const hasInput = !!part.input && part.input !== '{}'

  return (
    <div
      className={cn(
        'tool my-2 rounded-md border bg-card text-sm',
        waiting && 'border-primary/60',
        failed && 'border-destructive/50',
      )}
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setToggled(!open)}
      >
        <ChevronRight
          className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="truncate font-mono text-xs">{part.label ?? part.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {waiting && <ShieldQuestion className="size-3.5 text-primary" />}
          {part.status === 'running' && <Loader2 className="size-3.5 animate-spin text-primary" />}
          {failed && <X className="size-3.5 text-destructive" />}
          {part.status === 'done' && !failed && <Check className="size-3.5 text-success" />}
          {waiting
            ? t('aguardando permissão')
            : part.status === 'running'
              ? part.progress || t('executando…')
              : failed
                ? t('falhou')
                : t('concluída')}
        </span>
      </button>
      {open && (hasInput || part.result) && (
        <div className="space-y-2 border-t px-3 py-2">
          {hasInput && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('Entrada')}
              </div>
              <pre className="mt-1 overflow-x-auto rounded bg-code p-2 font-mono text-xs">
                {part.input}
              </pre>
            </div>
          )}
          {part.result && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('Resultado')}
              </div>
              <pre
                className={cn(
                  'mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-code p-2 font-mono text-xs',
                  failed && 'text-destructive',
                )}
              >
                {part.result}
              </pre>
            </div>
          )}
        </div>
      )}
      {waiting && (
        <div className="flex items-center gap-2 border-t px-3 py-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {t('O modelo quer usar esta ferramenta.')}
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => onApprove(part.id, false)}>
            {t('Negar')}
          </Button>
          <Button size="sm" className="h-7" onClick={() => onApprove(part.id, true)}>
            {t('Permitir')}
          </Button>
        </div>
      )}
    </div>
  )
}
