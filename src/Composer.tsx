import {
  ArrowUp,
  AudioLines,
  BookMarked,
  Clapperboard,
  FileText,
  FileType2,
  ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Square,
  Telescope,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Dictation } from './dictation'
import { t } from './i18n'
import { fillPrompt, promptFields } from './prompts'
import { chainSteps, insertMention, mentionMatches, mentionQuery } from './agents'
import type { Attachment, MediaKind, Persona, SavedPrompt } from './types'

const MAX_HEIGHT = 240

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  streaming: boolean
  // True when a message cannot be sent yet (missing key, model…).
  blocked: boolean
  // True while files are being dragged over the conversation.
  dragging: boolean
  attachments: Attachment[]
  // Ids of attached audio files still being transcribed; sending waits.
  transcribing: string[]
  onAttach: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  prompts: SavedPrompt[]
  onInsertPrompt: (text: string) => void
  // Runs a prompt with steps, one after another, once its fields are filled.
  onRunChain?: (steps: string[]) => void
  // Agents that can be called with @name.
  agents?: Persona[]
  onManagePrompts: () => void
  dictation: Dictation
  // The next message asks for this kind of media instead of a reply.
  mediaMode: MediaKind | null
  // Kinds someone can make now, each with its toggle.
  mediaKinds: MediaKind[]
  onMediaMode: (kind: MediaKind | null) => void
  // The next message is a deep research request.
  research: boolean
  onResearch: (on: boolean) => void
  // Warnings shown above the field.
  children?: ReactNode
}

// Looked up when shown, so the names follow the interface language.
const MEDIA_BUTTONS: Record<MediaKind, [typeof ImageIcon, () => string, () => string]> = {
  image: [ImageIcon, () => t('Imagem'), () => t('Gerar uma imagem com a próxima mensagem')],
  video: [Clapperboard, () => t('Vídeo'), () => t('Gerar um vídeo com a próxima mensagem')],
  audio: [AudioLines, () => t('Áudio'), () => t('Gerar áudio com a próxima mensagem')],
}

// The fields of a prompt and of every step of its chain.
function fieldsOf(prompt: SavedPrompt): string[] {
  return [...new Set(chainSteps(prompt.text, prompt.steps).flatMap(promptFields))]
}

// Asks for the values of a prompt's {{fields}} before inserting it, or before
// running it when it is a chain.
function PromptFiller({ prompt, onUse }: { prompt: SavedPrompt; onUse: (steps: string[]) => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const filled = fillPrompt(prompt.text, values)
  const chain = chainSteps(prompt.text, prompt.steps).length > 1
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        onUse(chainSteps(prompt.text, prompt.steps).map((step) => fillPrompt(step, values)))
      }}
    >
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-code p-2 font-mono text-xs">
        {filled}
      </p>
      {chain && (
        <p className="text-xs text-muted-foreground">
          {t('Encadeado: {count} etapas, enviadas uma depois da outra.', { count: chainSteps(prompt.text, prompt.steps).length })}
        </p>
      )}
      {fieldsOf(prompt).map((field, index) => (
        <label key={field} className="block text-xs">
          <span className="font-mono text-muted-foreground">{field}</span>
          <Input
            autoFocus={index === 0}
            className="mt-1 h-8"
            value={values[field] ?? ''}
            onChange={(e) => setValues({ ...values, [field]: e.target.value })}
          />
        </label>
      ))}
      <Button size="sm" className="w-full">
        {chain ? t('Executar o encadeamento') : t('Inserir prompt')}
      </Button>
    </form>
  )
}

export default function Composer(p: Props) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [promptsOpen, setPromptsOpen] = useState(false)
  // Prompt whose fields are being filled in.
  const [picked, setPicked] = useState<SavedPrompt | null>(null)
  const empty = !p.value.trim() && !p.attachments.length
  // The @name being typed, with the highlighted suggestion.
  const [mention, setMention] = useState<{ query: string; active: number } | null>(null)
  const suggestions = mention ? mentionMatches(mention.query, p.agents ?? []).slice(0, 6) : []

  function track(field: HTMLTextAreaElement) {
    const query = field.selectionStart === field.selectionEnd ? mentionQuery(field.value.slice(0, field.selectionStart)) : null
    setMention(query === null ? null : (m) => ({ query, active: m?.query === query ? m.active : 0 }))
  }

  function pick(agent: Persona) {
    const field = fieldRef.current
    if (!field) return
    const { text, caret } = insertMention(p.value, field.selectionStart, agent.name.trim())
    p.onChange(text)
    setMention(null)
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(caret, caret)
    })
  }

  // Grows with the text up to a limit, then scrolls.
  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT)}px`
  }, [p.value])

  function insert(text: string) {
    p.onInsertPrompt(text)
    setPromptsOpen(false)
    setPicked(null)
    fieldRef.current?.focus()
  }

  // A filled prompt: a chain runs, a single prompt goes into the field.
  function use(steps: string[]) {
    if (steps.length > 1 && p.onRunChain) {
      setPromptsOpen(false)
      setPicked(null)
      p.onRunChain(steps)
    } else insert(steps[0] ?? '')
  }

  return (
    <footer className="composer mx-auto w-full max-w-3xl space-y-2 px-3 pb-3">
      {p.children}
      <div className="relative rounded-lg border bg-card focus-within:border-ring">
        {p.dragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/90 text-sm">
            <Upload className="size-4 text-primary" /> {t('Solte os arquivos para anexar')}
          </div>
        )}
        {p.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {p.attachments.map((a) => (
              <div
                key={a.id}
                className="chip relative flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs"
                title={a.name}
              >
                {a.kind === 'image' ? (
                  <img
                    src={`data:${a.mime};base64,${a.data}`}
                    alt=""
                    className="size-8 rounded object-cover"
                  />
                ) : a.kind === 'pdf' ? (
                  <FileType2 className="size-4 text-destructive" />
                ) : a.kind === 'audio' ? (
                  <AudioLines className="size-4 text-primary" />
                ) : (
                  <FileText className="size-4 text-muted-foreground" />
                )}
                <span className="max-w-32 truncate">{a.name}</span>
                {a.kind === 'audio' && (
                  <span
                    className="flex items-center gap-1 text-[10px] text-muted-foreground"
                    title={
                      a.transcript === undefined && !p.transcribing.includes(a.id)
                        ? t('Configure uma chave da OpenAI ou do Groq para o modelo receber o que o áudio diz.')
                        : undefined
                    }
                  >
                    {p.transcribing.includes(a.id) ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        {t('transcrevendo…')}
                      </>
                    ) : a.transcript !== undefined ? (
                      t('transcrito')
                    ) : (
                      t('sem transcrição')
                    )}
                  </span>
                )}
                <button
                  aria-label={t('Remover anexo')}
                  title={t('Remover anexo')}
                  className="rounded p-0.5 hover:bg-accent"
                  onClick={() => p.onRemoveAttachment(a.id)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {suggestions.length > 0 && mention && (
          <div
            id="agent-suggestions"
            role="listbox"
            aria-label={t('Agentes')}
            className="menu absolute bottom-full left-2 z-20 mb-1 w-72 rounded-md border bg-popover p-1 shadow-md"
          >
            {suggestions.map((agent, i) => (
              <div
                key={agent.id}
                role="option"
                aria-selected={i === mention.active}
                className={cn(
                  'cursor-pointer rounded px-2 py-1.5 text-sm',
                  i === mention.active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
                )}
                // Keeps the field focused, so its blur does not close the list first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(agent)
                }}
              >
                <div className="font-medium">@{agent.name.trim()}</div>
                {agent.model && <div className="font-mono text-[11px] text-muted-foreground">{agent.model}</div>}
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={fieldRef}
          rows={1}
          value={p.value}
          placeholder={
            p.research
              ? t('O que pesquisar? A resposta vem num relatório com fontes, salvo na pasta do projeto.')
              : p.mediaMode === 'image'
              ? t('Descreva a imagem que você quer gerar…')
              : p.mediaMode === 'video'
                ? t('Descreva o vídeo que você quer gerar…')
                : p.mediaMode === 'audio'
                  ? t('Escreva o texto a narrar, ou descreva o som ou a música…')
                  : t('Escreva sua mensagem… (Enter envia, Shift+Enter quebra a linha)')
          }
          className="block w-full resize-none bg-transparent px-3.5 py-3 text-[0.95rem] outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            p.onChange(e.target.value)
            track(e.target)
          }}
          onSelect={(e) => track(e.currentTarget)}
          onBlur={() => setMention(null)}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="agent-suggestions"
          aria-autocomplete="list"
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              p.onAttach([...e.clipboardData.files])
            }
          }}
          onKeyDown={(e) => {
            if (suggestions.length && mention) {
              const move = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
              if (move) {
                e.preventDefault()
                setMention({ ...mention, active: (mention.active + move + suggestions.length) % suggestions.length })
                return
              }
              if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                pick(suggestions[Math.min(mention.active, suggestions.length - 1)])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMention(null)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              p.onSend()
            }
            if (e.key === 'Escape' && p.streaming) p.onStop()
          }}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('Anexar')}
            title={t('Anexar imagens, PDFs, Word, PowerPoint, planilhas, áudio ou texto')}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              p.onAttach([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
          <Popover
            open={promptsOpen}
            onOpenChange={(open) => {
              setPromptsOpen(open)
              if (!open) setPicked(null)
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                title={t('Inserir um prompt salvo')}
              >
                <BookMarked className="size-4" />
                Prompts
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="menu w-80">
              {picked ? (
                <PromptFiller prompt={picked} onUse={use} />
              ) : (
                <div className="space-y-1">
                  <div className="px-1 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
                    {t('Prompts salvos')}
                  </div>
                  {p.prompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      aria-label={prompt.title || t('Sem título')}
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                      onClick={() =>
                        fieldsOf(prompt).length || prompt.steps?.some((s) => s.trim())
                          ? setPicked(prompt)
                          : insert(prompt.text)
                      }
                    >
                      <div className="flex items-center gap-1.5 text-sm">
                        {prompt.title || t('Sem título')}
                        {chainSteps(prompt.text, prompt.steps).length > 1 && (
                          <span className="rounded border px-1 text-[10px] text-muted-foreground">
                            {t('{count} etapas', { count: chainSteps(prompt.text, prompt.steps).length })}
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {prompt.text}
                      </div>
                    </button>
                  ))}
                  <button
                    className="block w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
                    onClick={() => {
                      setPromptsOpen(false)
                      p.onManagePrompts()
                    }}
                  >
                    {p.prompts.length ? t('Gerenciar prompts…') : t('Criar um prompt…')}
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {p.mediaKinds.map((kind) => {
            const [Icon, label, title] = MEDIA_BUTTONS[kind]
            const on = p.mediaMode === kind
            return (
              <Button
                key={kind}
                variant={on ? 'secondary' : 'ghost'}
                size="sm"
                className={cn('h-8 gap-1.5 text-xs', on && 'text-primary')}
                aria-pressed={on}
                aria-label={label()}
                title={title()}
                onClick={() => {
                  p.onMediaMode(on ? null : kind)
                  fieldRef.current?.focus()
                }}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label()}</span>
              </Button>
            )
          })}
          <Button
            variant={p.research ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-8 gap-1.5 text-xs', p.research && 'text-primary')}
            aria-pressed={p.research}
            aria-label={t('Pesquisa')}
            title={t('Pesquisa profunda: o modelo busca e lê várias fontes e escreve um relatório')}
            onClick={() => {
              p.onResearch(!p.research)
              fieldRef.current?.focus()
            }}
          >
            <Telescope className="size-4" />
            <span className="hidden sm:inline">{t('Pesquisa')}</span>
          </Button>
          {p.dictation.available && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'ml-auto size-8',
                p.dictation.state === 'recording' && 'animate-pulse text-destructive',
              )}
              aria-label={p.dictation.state === 'recording' ? t('Parar o ditado') : t('Ditar')}
              title={p.dictation.state === 'recording' ? t('Parar o ditado') : t('Ditar')}
              aria-pressed={p.dictation.state === 'recording'}
              disabled={p.dictation.state === 'transcribing'}
              onClick={p.dictation.toggle}
            >
              {p.dictation.state === 'transcribing' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          )}
          {p.streaming ? (
            <Button
              size="icon"
              variant="outline"
              className={cn('size-8', !p.dictation.available && 'ml-auto')}
              aria-label={t('Parar')}
              title={t('Parar')}
              onClick={p.onStop}
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className={cn('size-8', !p.dictation.available && 'ml-auto')}
              aria-label={t('Enviar')}
              title={t('Enviar')}
              disabled={empty || p.blocked || p.transcribing.length > 0}
              onClick={p.onSend}
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </footer>
  )
}
