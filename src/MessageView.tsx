import {
  AlertTriangle,
  Brain,
  Download,
  ImageIcon,
  Library,
  MessageSquareQuote,
  ScrollText,
  GitBranch,
  Pin,
  PinOff,
  Square,
  Volume2,
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Columns2,
  Columns3,
  Copy,
  AudioLines,
  Telescope,
  FileText,
  FileType2,
  Film,
  Pencil,
  RefreshCw,
  Scissors,
} from 'lucide-react'
import { memo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatWhen, locale, t } from './i18n'
import { canSpeak, speak, speakable, stopSpeaking, useSpeaking, useSpeechProblem } from './speech'
import Markdown, { useCopy } from './Markdown'
import ToolCallBlock from './ToolCallBlock'
import type { Attachment, Message, Reference, Usage } from './types'
import { clock } from './videoFrames'
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
  // Starts a new conversation with everything up to this message.
  onFork: (id: string) => void
  onTogglePin: (id: string) => void
  // Opens a side question about the reply, or about the selected part of it.
  onAside: (id: string, quote: string) => void
}

function IconAction(props: {
  label: string
  disabled?: boolean
  pressed?: boolean
  // Keep the text selection, which a click would otherwise clear.
  keepSelection?: boolean
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
          onMouseDown={props.keepSelection ? (e) => e.preventDefault() : undefined}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

// Where the user cleared the context: what is above is no longer sent.
export function ContextReset({ busy, onUndo }: { busy: boolean; onUndo: () => void }) {
  return (
    <div className="context-reset flex w-full items-center gap-3 text-xs text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      <Eraser className="size-3.5 shrink-0" />
      <span>{t('Contexto limpo aqui: o modelo não vê as mensagens acima.')}</span>
      <button className="underline underline-offset-2 hover:text-foreground disabled:opacity-50" disabled={busy} onClick={onUndo}>
        {t('Desfazer')}
      </button>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

// A summary that stands in for the messages above it in later requests.
function Summary({ message, live }: { message: Message; live: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="summary w-full rounded-md border border-dashed bg-card px-3 py-2">
      <button
        className="flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open || live}
        onClick={() => setOpen(!open)}
      >
        {live ? <span className="live-dot" aria-hidden /> : <ScrollText className="size-3.5" />}
        {live
          ? t('Resumindo a conversa…')
          : t('Conversa resumida até aqui: as mensagens acima não são mais enviadas ao modelo.')}
        <ChevronRight className={cn('ml-auto size-3 shrink-0 transition-transform', (open || live) && 'rotate-90')} />
      </button>
      {(open || live) && message.content && (
        <div className="mt-2 border-t pt-2">
          <Markdown content={message.content} />
        </div>
      )}
    </div>
  )
}

// Knowledge base passages sent with the question, folded away.
function References({ references }: { references: Reference[] }) {
  const [open, setOpen] = useState(false)
  const names = [...new Set(references.map((r) => r.name))]
  return (
    <div className="references w-full rounded-md border bg-card px-3 py-2 text-xs">
      <button
        className="flex w-full items-center gap-1.5 text-left text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Library className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          {t('Da base de conhecimento: {names}', { names: names.join(', ') })}
        </span>
        <ChevronRight className={cn('ml-auto size-3 shrink-0 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <ol className="mt-2 space-y-2">
          {references.map((r, i) => (
            <li key={i} className="border-l-2 pl-2">
              <div className="font-medium">{r.name}</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{r.text}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// The model's reasoning, folded away unless the user opens it.
function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="thinking mb-2">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {live ? <span className="live-dot" aria-hidden /> : <Brain className="size-3.5" />}
        {live ? t('Pensando…') : t('Raciocínio')}
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <p className="mt-1.5 max-h-80 overflow-y-auto whitespace-pre-wrap border-l-2 pl-3 text-sm text-muted-foreground">
          {text}
        </p>
      )}
    </div>
  )
}

// Where a generated file plays from: kept in the app, or the service's link.
function sourceOf(a: Attachment): string {
  return a.data ? `data:${a.mime};base64,${a.data}` : (a.url ?? '')
}

function usageLine(model: string | undefined, usage: Usage | undefined): string {
  // Generated media is billed per file, with no tokens.
  const tokens =
    usage &&
    (usage.input || usage.output) &&
    (usage.cacheRead
      ? t('{input} entrada ({cached} do cache) · {output} saída', {
          input: formatTokens(usage.input),
          cached: formatTokens(usage.cacheRead),
          output: formatTokens(usage.output),
        })
      : t('{input} entrada · {output} saída', {
          input: formatTokens(usage.input),
          output: formatTokens(usage.output),
        }))
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
  const speaking = useSpeaking(message.id)
  const speechProblem = useSpeechProblem(message.id)
  const articleRef = useRef<HTMLElement>(null)
  const image = message.imagePrompt !== undefined

  // Text selected inside this reply, if any.
  function selection(): string {
    const selected = window.getSelection()
    const node = selected?.anchorNode
    return node && articleRef.current?.contains(node) ? selected.toString().trim() : ''
  }

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
    <article
      ref={articleRef}
      id={`message-${message.id}`}
      className={cn('message group flex scroll-mt-16 flex-col gap-1', message.role, isUser && 'items-end')}
    >
      {message.attachments?.length && !image ? (
        <div className={cn('flex flex-wrap gap-2', isUser ? 'justify-end' : 'justify-start')}>
          {message.attachments.map((a) =>
            a.kind === 'video' && a.frames ? (
              <AttachedVideo key={a.id} video={a} />
            ) : a.kind === 'video' ? (
              <video
                key={a.id}
                controls
                src={sourceOf(a)}
                aria-label={a.name}
                className="made-video max-h-[32rem] max-w-full rounded-md border bg-black"
              />
            ) : a.kind === 'image' && !isUser ? (
              // A picture the reply made (a chart from the interpreter): shown at its size.
              <figure key={a.id} className="made-image flex max-w-full flex-col gap-1">
                <img
                  src={`data:${a.mime};base64,${a.data}`}
                  alt={a.name}
                  className="w-[45rem] max-w-full rounded-md border bg-white"
                />
                <figcaption className="text-[11px] text-muted-foreground">{a.name}</figcaption>
              </figure>
            ) : a.kind === 'audio' ? (
              <div
                key={a.id}
                className="attached-audio flex w-80 max-w-full flex-col gap-1.5 rounded-md border bg-card px-2 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2" title={a.name}>
                  <AudioLines className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{a.name}</span>
                </span>
                {a.data && <audio controls src={`data:${a.mime};base64,${a.data}`} className="h-8 w-full" />}
                {a.transcript !== undefined ? (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">{t('Transcrição')}</summary>
                    <p className="mt-1 whitespace-pre-wrap">{a.transcript || t('(nenhuma fala)')}</p>
                  </details>
                ) : (
                  <span className="text-muted-foreground">{t('Sem transcrição: o modelo não ouviu este áudio.')}</span>
                )}
              </div>
            ) : (
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
            ),
          )}
        </div>
      ) : null}

      {message.research && (
        <span className="research-label flex items-center gap-1 text-[11px] text-primary">
          <Telescope className="size-3" /> {t('Pesquisa profunda')}
        </span>
      )}
      {message.agentName && (
        <span className="agent-label text-[11px] font-medium text-primary">@{message.agentName}</span>
      )}
      {message.pinned && (
        <span className="flex items-center gap-1 text-[11px] text-primary">
          <Pin className="size-3" /> {t('Fixada')}
        </span>
      )}
      {message.summary ? (
        <Summary message={message} live={streaming} />
      ) : image ? (
        <figure className="generated w-full">
          {message.attachments?.map((a) => (
            <div key={a.id} className={cn('group/image relative', a.kind === 'audio' ? 'w-full max-w-md' : 'w-fit')}>
              {a.kind === 'video' ? (
                <video
                  controls
                  src={sourceOf(a)}
                  aria-label={message.imagePrompt}
                  className="max-h-[32rem] max-w-full rounded-md border bg-black"
                />
              ) : a.kind === 'audio' ? (
                <audio controls src={sourceOf(a)} aria-label={message.imagePrompt} className="w-full" />
              ) : (
                <img
                  src={sourceOf(a)}
                  alt={message.imagePrompt}
                  className="max-h-[32rem] max-w-full rounded-md border"
                />
              )}
              <a
                href={sourceOf(a)}
                download={a.name}
                target={a.data ? undefined : '_blank'}
                rel="noreferrer"
                aria-label={t('Baixar imagem')}
                title={t('Baixar imagem')}
                className={cn(
                  'rounded-md border bg-background/90 p-1.5 transition-opacity focus:opacity-100',
                  a.kind === 'audio'
                    ? 'absolute -right-9 top-1.5'
                    : 'absolute right-2 top-2 opacity-0 group-hover/image:opacity-100',
                )}
              >
                <Download className="size-4" />
              </a>
              {a.savedPath && <SavedPath path={a.savedPath} />}
              {!a.data && a.url && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('O arquivo não pôde ser baixado para o app; fica no link do serviço, que pode expirar.')}
                </p>
              )}
            </div>
          ))}
          {message.content && (
            <figcaption className="mt-1.5 text-xs text-muted-foreground">{message.content}</figcaption>
          )}
        </figure>
      ) : isUser ? (
        message.content && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface-2 px-3.5 py-2 text-[0.95rem]">
            {message.content}
          </div>
        )
      ) : versions ? (
        <div
          className={cn(
            'versions -mx-2 grid w-[calc(100%+1rem)] grid-cols-1 gap-2 md:grid-cols-2 xl:-mx-24 xl:w-[calc(100%+12rem)]',
            versions.length === 3 && 'xl:grid-cols-3',
            versions.length >= 4 && 'xl:grid-cols-4',
          )}
        >
          {versions.map((version, index) => (
            <section
              key={version.id}
              className={cn(
                'flex min-w-0 flex-col rounded-md border bg-card',
                index === current && 'current border-primary/60',
              )}
            >
              <header className="flex h-10 items-center gap-2 border-b px-3">
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
                {busy && !version.content && !version.error && !version.parts?.length ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="live-dot" aria-hidden /> {t('Pensando…')}
                  </p>
                ) : (
                  <Markdown content={version.content} />
                )}
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
          {message.thinking && (
            <Thinking text={message.thinking} live={streaming && !message.content} />
          )}
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

      {!isUser && !versions && message.sources?.length ? (
        <div className="sources w-full rounded-md border bg-card px-3 py-2 text-xs">
          <div className="mb-1 uppercase tracking-wider text-muted-foreground">{t('Fontes')}</div>
          <ol className="list-decimal space-y-0.5 pl-5">
            {message.sources.map((source) => (
              <li key={source.url} className="truncate">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {source.title || new URL(source.url).host}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {!isUser && !versions && message.references?.length ? (
        <References references={message.references} />
      ) : null}
      {pending && !message.thinking && !message.summary && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {image ? <ImageIcon className="size-3.5 animate-pulse" /> : <span className="live-dot" aria-hidden />}
          {!image
            ? t('Pensando…')
            : message.mediaKind === 'video'
              ? t('Gerando vídeo…')
              : message.mediaKind === 'audio'
                ? t('Gerando áudio…')
                : t('Gerando imagem…')}
          {message.mediaProgress && <span className="font-mono">({message.mediaProgress})</span>}
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
          {message.createdAt !== undefined && (
            <time
              className="message-time px-1 font-mono text-[11px] text-muted-foreground"
              dateTime={new Date(message.createdAt).toISOString()}
              title={new Date(message.createdAt).toLocaleString(locale(), {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            >
              {formatWhen(message.createdAt)}
            </time>
          )}
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
          {!isUser && !image && message.content && canSpeak() && (
            <IconAction
              label={speaking ? t('Parar a leitura') : t('Ler em voz alta')}
              pressed={speaking}
              onClick={() =>
                speaking
                  ? stopSpeaking()
                  : speak(message.id, speakable(message.content), locale())
              }
            >
              {speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </IconAction>
          )}
          {!isUser && !image && !message.summary && message.content && (
            <IconAction
              label={t('Perguntar à parte')}
              keepSelection
              onClick={() => props.onAside(message.id, selection())}
            >
              <MessageSquareQuote className="size-3.5" />
            </IconAction>
          )}
          {!message.summary && (
            <>
              <IconAction
                label={message.pinned ? t('Desafixar') : t('Fixar')}
                pressed={!!message.pinned}
                disabled={busy}
                onClick={() => props.onTogglePin(message.id)}
              >
                {message.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </IconAction>
              <IconAction
                label={t('Ramificar a partir daqui')}
                disabled={busy}
                onClick={() => props.onFork(message.id)}
              >
                <GitBranch className="size-3.5" />
              </IconAction>
            </>
          )}
          {message.summary ? null : isUser ? (
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
              {!image && (
                <IconAction
                  label={t('Comparar')}
                  disabled={busy}
                  onClick={() => props.onCompare(message.id)}
                >
                  <Columns3 className="size-3.5" />
                </IconAction>
              )}
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
      {speechProblem && <p className="speech-problem text-xs text-warning">{speechProblem}</p>}
    </article>
  )
}

export default memo(MessageView)

// A video the user attached: the frames the model saw and what is said in it.
function AttachedVideo({ video }: { video: Attachment }) {
  const frames = video.frames ?? []
  return (
    <div className="attached-video flex w-96 max-w-full flex-col gap-1.5 rounded-md border bg-card px-2 py-1.5 text-xs">
      <span className="flex items-center gap-2" title={video.name}>
        <Film className="size-4 shrink-0 text-primary" />
        <span className="truncate">{video.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {t('{count} quadros · {length}', { count: frames.length, length: clock(video.duration ?? 0) })}
        </span>
      </span>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {frames.map((frame) => (
          <img
            key={frame.at}
            src={`data:image/jpeg;base64,${frame.data}`}
            alt={t('Quadro em {at}', { at: clock(frame.at) })}
            title={clock(frame.at)}
            className="h-14 shrink-0 rounded border object-cover"
          />
        ))}
      </div>
      {video.transcript !== undefined ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">{t('Transcrição')}</summary>
          <p className="mt-1 whitespace-pre-wrap">{video.transcript || t('(nenhuma fala)')}</p>
        </details>
      ) : (
        <span className="text-muted-foreground">{t('Sem transcrição: o modelo só viu os quadros.')}</span>
      )}
    </div>
  )
}

// Where generated media was written in the conversation's folder, to find it
// outside the app.
function SavedPath({ path }: { path: string }) {
  const [copied, copy] = useCopy()
  return (
    <p className="saved-path mt-1 flex max-w-full items-center gap-1 text-xs text-muted-foreground">
      <span className="min-w-0 break-all" title={path}>
        {t('Salvo em {path}', { path })}
      </span>
      <button
        type="button"
        className="shrink-0 rounded p-1 hover:bg-surface-2"
        aria-label={t('Copiar caminho')}
        title={t('Copiar caminho')}
        onClick={() => copy(path)}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </p>
  )
}
