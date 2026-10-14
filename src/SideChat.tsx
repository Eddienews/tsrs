import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { t } from './i18n'
import Markdown from './Markdown'
import type { Message } from './types'
import { formatCost } from './usage'

interface Props {
  // The part of the reply being asked about; empty for the whole reply.
  quote: string
  messages: Message[]
  busy: boolean
  // Why a question cannot be sent now, if it cannot.
  blocked?: string
  onSend: (text: string) => void
  onStop: () => void
  onClose: () => void
}

// Questions about a reply, answered beside the conversation and never added to it.
export default function SideChat(p: Props) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const cost = p.messages.reduce<number | undefined>(
    (sum, m) => (m.usage?.cost === undefined ? sum : (sum ?? 0) + m.usage.cost),
    undefined,
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [p.messages])

  function send() {
    const text = draft.trim()
    if (!text || p.busy || p.blocked) return
    setDraft('')
    p.onSend(text)
  }

  return (
    <Sheet open onOpenChange={(open) => !open && p.onClose()}>
      <SheetContent side="right" className="side-chat flex w-full flex-col gap-3 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('Pergunta à parte')}</SheetTitle>
          <SheetDescription>
            {t('As perguntas e respostas daqui não entram na conversa.')}
          </SheetDescription>
        </SheetHeader>
        {p.quote && (
          <blockquote className="max-h-32 overflow-y-auto border-l-2 border-primary pl-3 text-sm text-muted-foreground">
            {p.quote}
          </blockquote>
        )}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {p.messages.map((m) =>
            m.role === 'user' ? (
              <div
                key={m.id}
                className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-sm"
              >
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="text-sm">
                {m.content ? (
                  <Markdown content={m.content} />
                ) : (
                  !m.error && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="live-dot" aria-hidden /> {t('Pensando…')}
                    </p>
                  )
                )}
                {m.error && (
                  <p role="alert" className="error text-destructive">
                    {m.error}
                  </p>
                )}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
        {p.blocked && <p className="text-xs text-warning">{p.blocked}</p>}
        <div className="rounded-lg border bg-card focus-within:border-ring">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            aria-label={t('Pergunta')}
            placeholder={
              p.quote
                ? t('O que você quer saber sobre este trecho?')
                : t('O que você quer saber sobre esta resposta?')
            }
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            {cost !== undefined && (
              <span className="font-mono text-[11px] text-muted-foreground">{formatCost(cost)}</span>
            )}
            {p.busy ? (
              <Button
                size="icon"
                variant="outline"
                className="ml-auto size-8"
                aria-label={t('Parar')}
                title={t('Parar')}
                onClick={p.onStop}
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="ml-auto size-8"
                aria-label={t('Perguntar')}
                title={t('Perguntar')}
                disabled={!draft.trim() || !!p.blocked}
                onClick={send}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
