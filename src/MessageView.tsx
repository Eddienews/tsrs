import { memo, useRef, useState, type ComponentProps } from 'react'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { t } from './i18n'
import type { Message, ToolPart } from './types'
import { formatCost, formatTokens } from './usage'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return [copied, copy]
}

function CodeBlock({ node, ...props }: ComponentProps<'pre'> & { node?: unknown }) {
  void node
  const ref = useRef<HTMLPreElement>(null)
  const [copied, copy] = useCopy()
  return (
    <div className="code-block">
      <button className="copy" onClick={() => copy(ref.current?.innerText ?? '')}>
        {copied ? t('Copiado') : t('Copiar')}
      </button>
      <pre ref={ref} {...props} />
    </div>
  )
}

const components = { pre: CodeBlock }

interface Props {
  message: Message
  // True while any reply is streaming; edits and regeneration wait for it.
  busy: boolean
  // True when this is the reply being streamed and no text has arrived yet.
  pending: boolean
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

function Tool({ part, onApprove }: { part: ToolPart; onApprove: Props['onApprove'] }) {
  const state =
    part.status === 'approval'
      ? t('aguardando permissão')
      : part.status === 'running'
        ? t('executando…')
        : part.error
          ? t('falhou')
          : t('concluída')
  return (
    <div className={`tool${part.error ? ' failed' : ''}`}>
      <details>
        <summary>
          <strong>{part.label ?? part.name}</strong>
          <span className="hint">{state}</span>
        </summary>
        {part.input && part.input !== '{}' && <pre>{part.input}</pre>}
        {part.result && <pre>{part.result}</pre>}
      </details>
      {part.status === 'approval' && (
        <div className="row">
          <span className="hint grow">{t('O modelo quer usar esta ferramenta.')}</span>
          <button onClick={() => onApprove(part.id, false)}>{t('Negar')}</button>
          <button className="primary" onClick={() => onApprove(part.id, true)}>
            {t('Permitir')}
          </button>
        </div>
      )}
    </div>
  )
}

function Reply({ content }: { content: string }) {
  return (
    <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
      {content}
    </Markdown>
  )
}

function MessageView(props: Props) {
  const { message, busy, pending, versions, onEdit, onRegenerate, onSwitch } = props
  const total = (message.alts?.length ?? 0) + 1
  const current = message.altIndex ?? total - 1
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, copy] = useCopy()
  const isUser = message.role === 'user'

  if (draft !== null) {
    return (
      <article className="message user editing">
        <textarea
          autoFocus
          rows={Math.min(12, draft.split('\n').length + 1)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="actions visible">
          <button
            className="primary"
            disabled={!draft.trim() && !message.attachments?.length}
            onClick={() => {
              onEdit(message.id, draft.trim())
              setDraft(null)
            }}
          >
            {t('Salvar e reenviar')}
          </button>
          <button onClick={() => setDraft(null)}>{t('Cancelar')}</button>
        </div>
      </article>
    )
  }

  return (
    <article className={`message ${message.role}${versions ? ' wide' : ''}`}>
      {message.attachments?.length ? (
        <div className="attachments">
          {message.attachments.map((a) =>
            a.kind === 'image' ? (
              <img key={a.id} src={`data:${a.mime};base64,${a.data}`} alt={a.name} title={a.name} />
            ) : (
              <span key={a.id} className="chip">
                {a.name}
              </span>
            ),
          )}
        </div>
      ) : null}
      {isUser ? (
        message.content && <p className="plain">{message.content}</p>
      ) : versions ? (
        <div className="versions">
          {versions.map((version, index) => (
            <section key={version.id} className={index === current ? 'current' : undefined}>
              <header>
                <strong>{version.model ?? t('Versão {number}', { number: index + 1 })}</strong>
                {index !== current && (
                  <button disabled={busy} onClick={() => onSwitch(message.id, index)}>
                    {t('Usar esta')}
                  </button>
                )}
              </header>
              <Reply content={version.content} />
              {version.error && <p className="error">{version.error}</p>}
            </section>
          ))}
        </div>
      ) : message.parts ? (
        message.parts.map((part, index) =>
          part.type === 'text' ? (
            <Reply key={index} content={part.text} />
          ) : (
            <Tool key={part.id} part={part} onApprove={props.onApprove} />
          ),
        )
      ) : (
        <Reply content={message.content} />
      )}
      {pending && <p className="pending">{t('Pensando…')}</p>}
      {message.truncated && (
        <p className="notice">{t('Resposta cortada: o limite de tokens de saída foi atingido.')}</p>
      )}
      {message.error && <p className="error">{message.error}</p>}
      {!pending && (
        <div className="actions">
          {total > 1 && (
            <span className="pager">
              <button
                title={t('Versão anterior')}
                disabled={busy || current === 0}
                onClick={() => onSwitch(message.id, current - 1)}
              >
                ‹
              </button>
              {current + 1}/{total}
              <button
                title={t('Próxima versão')}
                disabled={busy || current === total - 1}
                onClick={() => onSwitch(message.id, current + 1)}
              >
                ›
              </button>
            </span>
          )}
          {message.content && (
            <button onClick={() => copy(message.content)}>{copied ? t('Copiado') : t('Copiar')}</button>
          )}
          {isUser ? (
            <button disabled={busy} onClick={() => setDraft(message.content)}>
              {t('Editar')}
            </button>
          ) : (
            <button disabled={busy} onClick={() => onRegenerate(message.id)}>
              {message.error ? t('Tentar de novo') : t('Regenerar')}
            </button>
          )}
          {!isUser && (
            <button
              title={t('Gerar outra versão desta resposta com outro modelo')}
              disabled={busy}
              onClick={() => props.onCompare(message.id)}
            >
              {t('Comparar')}
            </button>
          )}
          {!isUser && total > 1 && (
            <button
              className={versions ? 'toggled' : undefined}
              onClick={() => props.onToggleVersions(message.id)}
            >
              {t('Lado a lado')}
            </button>
          )}
          {message.model && <span className="hint">{message.model}</span>}
          {message.usage && (
            <span className="hint">
              {t('{input} entrada · {output} saída', {
                input: formatTokens(message.usage.input),
                output: formatTokens(message.usage.output),
              })}
              {message.usage.cost !== undefined && ` · ${formatCost(message.usage.cost)}`}
            </span>
          )}
        </div>
      )}
    </article>
  )
}

export default memo(MessageView)
