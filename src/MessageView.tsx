import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Columns3,
  Copy,
  FileText,
  FileType2,
  Pencil,
  RefreshCw,
  Scissors,
} from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { t } from './i18n'
import Markdown, { useCopy } from './Markdown'
import ToolCallBlock from './ToolCallBlock'
import type { Message, Usage } from './types'
import { formatCost, formatTokens } from './usage'

interface Props {
  message: Message
  // True while any reply is streaming; edits and regeneration wait for it.
  busy: boolean
  // True when this is the reply being streamed.
  streaming: boolean
  // Interface language; only here so the memoized component re-renders on a switch.
  lang: string
  // Every version of this reply, when they are being shown side by side.
  versions?: Message[]
  onEdit: (id: string, text: string) => void
  onRegenerate: (id: string) => void
  // Shows another version of the conversation from this message on.
  onSwitch: (id: string, version: number) => void
  // Asks which model should write another version of this reply.
  onCompare: (id: string) => void
  onToggleVersions: (id: string) => void
  // Answers a tool call that is waiting for permission.
  onApprove: (callId: string, allowed: boolean) => void
}

function IconAction(props: {
  label: string
  disabled?: boolean
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={props.pressed ? 'secondary' : 'ghost'}
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={props.label}
          aria-pressed={props.pressed}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

function usageLine(model: string | undefined, usage: Usage | undefined): string {
  const tokens =
    usage &&
    t('{input} entrada · {output} saída', {
      input: formatTokens(usage.input),
      output: formatTokens(usage.output),
    })
  const cost = usage?.cost !== undefined ? formatCost(usage.cost) : undefined
  return [model, tokens, cost].filter(Boolean).join(' · ')
}

function MessageView(props: Props) {
  const { message, busy, streaming, versions, onEdit, onRegenerate, onSwitch } = props
  const total = (message.alts?.length ?? 0) + 1
  const current = message.altIndex ?? total - 1
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, copy] = useCopy()
  const isUser = message.role === 'user'
  const pending = streaming && !message.content && !message.parts?.length

  if (draft !== null) {
    return (
      <article className="message user editing flex flex-col items-end">
        <div className="w-full max-w-[85%] rounded-lg border bg-card p-2">
          <textarea
            autoFocus
            aria-label={t('Editar')}
            className="w-full resize-none bg-transparent p-1 text-sm outline-none"
            rows={Math.min(12, draft.split('\n').length + 1)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t('Cancelar')}
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim() && !message.attachments?.length}
              onClick={() => {
                onEdit(message.id, draft.trim())
                setDraft(null)
              }}
            >
              {t('Salvar e reenviar')}
            </Button>
          </div>
        </div>
      </article>
    )
  }

  const line = isUser ? '' : usageLine(message.model, message.usage)

  return (
    <article className={cn('message group flex flex-col gap-1', message.role, isUser && 'items-end')}>
      {message.attachments?.length ? (
        <div className="flex flex-wrap justify-end gap-2">
          {message.attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs"
              title={a.name}
            >
              {a.kind === 'image' ? (
                <img
                  src={`data:${a.mime};base64,${a.data}`}
                  alt={a.name}
                  className="size-8 rounded object-cover"
                />
              ) : a.kind === 'pdf' ? (
                <FileType2 className="size-4 text-destructive" />
              ) : (
                <FileText className="size-4 text-muted-foreground" />
              )}
              <span className="max-w-32 truncate">{a.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      {isUser ? (
        message.content && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface-2 px-3.5 py-2 text-[0.95rem]">
            {message.content}
          </div>
        )
      ) : versions ? (
        <div className="versions -mx-2 grid w-[calc(100%+1rem)] grid-cols-1 gap-2 md:grid-cols-2 xl:-mx-24 xl:w-[calc(100%+12rem)]">
          {versions.map((version, index) => (
            <section
              key={version.id}
              className={cn(
                'flex min-w-0 flex-col rounded-md border bg-card',
                index === current && 'current border-primary/60',
              )}
            >
              <header className="flex items-center gap-2 border-b px-3 py-2">
                <strong className="truncate font-mono text-xs font-medium">
                  {version.model ?? t('Versão {number}', { number: index + 1 })}
                </strong>
                {index === current ? (
                  <Check className="ml-auto size-3.5 text-primary" />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-6 text-xs"
                    disabled={busy}
                    onClick={() => onSwitch(message.id, index)}
                  >
                    {t('Usar esta')}
                  </Button>
                )}
              </header>
              <div className="flex-1 px-3 py-2">
                <Markdown content={version.content} />
                {version.error && <p className="error text-sm text-destructive">{version.error}</p>}
              </div>
              {version.usage && (
                <footer className="border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {usageLine(undefined, version.usage)}
                </footer>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className={cn('w-full', streaming && '[&_.prose-tsrs:last-child>p:last-child]:caret')}>
          {message.parts ? (
            message.parts.map((part, index) =>
              part.type === 'text' ? (
                <Markdown key={index} content={part.text} />
              ) : (
                <ToolCallBlock key={part.id} part={part} onApprove={props.onApprove} />
              ),
            )
          ) : (
            <Markdown content={message.content} />
          )}
        </div>
      )}

      {pending && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="live-dot" aria-hidden /> {t('Pensando…')}
        </p>
      )}
      {message.truncated && (
        <p className="flex w-full items-center gap-2 rounded-md border border-warning/50 px-3 py-2 text-xs text-warning">
          <Scissors className="size-3.5 shrink-0" />
          {t('Resposta cortada: o limite de tokens de saída foi atingido.')}
        </p>
      )}
      {message.error && (
        <div role="alert" className="error w-full rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">{message.error}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 gap-1"
            disabled={busy}
            onClick={() => onRegenerate(message.id)}
          >
            <RefreshCw className="size-3.5" />
            {t('Tentar de novo')}
          </Button>
        </div>
      )}

      {!streaming && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100',
            isUser && 'justify-end',
          )}
        >
          {total > 1 && (
            <div className="flex items-center font-mono text-xs text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={t('Versão anterior')}
                title={t('Versão anterior')}
                disabled={busy || current === 0}
                onClick={() => onSwitch(message.id, current - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              {current + 1}/{total}
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={t('Próxima versão')}
                title={t('Próxima versão')}
                disabled={busy || current === total - 1}
                onClick={() => onSwitch(message.id, current + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
          {message.content && (
            <IconAction
              label={copied ? t('Copiado') : t('Copiar')}
              onClick={() => copy(message.content)}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </IconAction>
          )}
          {isUser ? (
            <IconAction
              label={t('Editar')}
              disabled={busy}
              onClick={() => setDraft(message.content)}
            >
              <Pencil className="size-3.5" />
            </IconAction>
          ) : (
            <>
              {!message.error && (
                <IconAction
                  label={t('Regenerar')}
                  disabled={busy}
                  onClick={() => onRegenerate(message.id)}
                >
                  <RefreshCw className="size-3.5" />
                </IconAction>
              )}
              <IconAction
                label={t('Comparar')}
                disabled={busy}
                onClick={() => props.onCompare(message.id)}
              >
                <Columns3 className="size-3.5" />
              </IconAction>
              {total > 1 && (
                <IconAction
                  label={t('Lado a lado')}
                  pressed={!!versions}
                  onClick={() => props.onToggleVersions(message.id)}
                >
                  <Columns2 className="size-3.5" />
                </IconAction>
              )}
            </>
          )}
        </div>
      )}
      {line && !versions && (
        <div className="font-mono text-[11px] text-muted-foreground">{line}</div>
      )}
    </article>
  )
}

export default memo(MessageView)
